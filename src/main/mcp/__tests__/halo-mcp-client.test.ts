/**
 * TD-053: drives the client against a stubbed session so the two
 * behaviours that are easy to get quietly wrong are pinned — the bearer
 * token being re-read on every request (not captured at construction),
 * and the tool list being fetched once per session rather than once per
 * turn.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FetchLike } from '@modelcontextprotocol/sdk/shared/transport.js'
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js'
import { StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { createAuthorizedFetch, HaloMcpClient, type McpSession } from '../halo-mcp-client'
import { McpFailureError } from '../errors'

const MCP_URL = 'https://halo-mcp.example/mcp'
const TOOLS = [{ name: 'search_records', inputSchema: { type: 'object' } }] as unknown as Tool[]

const EMPTY_RESULT: CallToolResult = { content: [] }

let token: string | undefined
let sessionUrls: string[]
let fetchStub: ReturnType<typeof vi.fn>
let session: {
  connect: ReturnType<typeof vi.fn>
  listTools: ReturnType<typeof vi.fn>
  callTool: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
}

function createClient(): HaloMcpClient {
  return new HaloMcpClient({
    getUrl: () => MCP_URL,
    getToken: () => token,
    createSession: (url) => {
      sessionUrls.push(url.toString())
      return session as unknown as McpSession
    }
  })
}

/** The headers the wrapped `fetch` actually put on the wire. */
function sentHeaders(call: number): Headers {
  return new Headers((fetchStub.mock.calls[call][1] as RequestInit).headers)
}

beforeEach(() => {
  token = 'halo-token-1'
  sessionUrls = []
  fetchStub = vi.fn(async () => new Response('{}', { status: 200 }))
  session = {
    connect: vi.fn(async () => {}),
    listTools: vi.fn(async () => ({ tools: TOOLS })),
    callTool: vi.fn(async () => EMPTY_RESULT),
    close: vi.fn(async () => {})
  }
})

describe('createAuthorizedFetch (TD-053)', () => {
  function request(): FetchLike {
    return createAuthorizedFetch(() => token, fetchStub as unknown as FetchLike)
  }

  it('sends the token on every request and picks up one that changed between calls', async () => {
    const send = request()

    await send(MCP_URL, { method: 'POST' })
    token = 'halo-token-2'
    await send(MCP_URL, { method: 'POST' })

    expect(sentHeaders(0).get('Authorization')).toBe('Bearer halo-token-1')
    expect(sentHeaders(1).get('Authorization')).toBe('Bearer halo-token-2')
  })

  it('preserves the headers the transport set alongside the token', async () => {
    await request()(MCP_URL, { headers: { 'content-type': 'application/json' } })

    expect(sentHeaders(0).get('content-type')).toBe('application/json')
    expect(sentHeaders(0).get('Authorization')).toBe('Bearer halo-token-1')
  })

  it.each([
    ['nothing is stored', undefined],
    ['the stored token is empty', '']
  ])(
    'fails as unauthorized rather than sending an empty bearer when %s',
    async (_label, stored) => {
      token = stored

      await expect(request()(MCP_URL)).rejects.toMatchObject({
        failure: { kind: 'unauthorized' }
      })
      expect(fetchStub).not.toHaveBeenCalled()
    }
  )
})

describe('HaloMcpClient — connection (TD-053)', () => {
  it('connects to the configured mcpUrl', async () => {
    await createClient().connect()
    expect(sessionUrls).toEqual([MCP_URL])
  })
})

describe('HaloMcpClient — tool list memoisation (TD-053)', () => {
  it('hits the transport once across two calls, and again after disconnect', async () => {
    const client = createClient()

    expect(await client.listTools()).toEqual(TOOLS)
    await client.listTools()
    expect(session.listTools).toHaveBeenCalledTimes(1)

    await client.disconnect()
    await client.listTools()
    expect(session.listTools).toHaveBeenCalledTimes(2)
  })

  it('opens one session for concurrent callers rather than one each', async () => {
    const client = createClient()
    await Promise.all([client.listTools(), client.callTool('get_stats_summary')])
    expect(session.connect).toHaveBeenCalledTimes(1)
  })

  it('fetches once for concurrent callers that both miss the cache', async () => {
    const client = createClient()
    const [first, second] = await Promise.all([client.listTools(), client.listTools()])

    expect(session.listTools).toHaveBeenCalledTimes(1)
    expect(first).toEqual(TOOLS)
    expect(second).toEqual(TOOLS)
  })

  it('retries after a failed fetch instead of caching the rejection', async () => {
    session.listTools.mockRejectedValueOnce(new StreamableHTTPError(503, 'Service Unavailable'))
    const client = createClient()

    await expect(client.listTools()).rejects.toMatchObject({ failure: { kind: 'protocol' } })
    await expect(client.listTools()).resolves.toEqual(TOOLS)
  })

  it('closes the session on disconnect', async () => {
    const client = createClient()
    await client.connect()
    await client.disconnect()
    expect(session.close).toHaveBeenCalledTimes(1)
  })

  it('retries the connection after a failed attempt instead of caching the rejection', async () => {
    session.connect.mockRejectedValueOnce(new StreamableHTTPError(401, 'Unauthorized'))
    const client = createClient()

    await expect(client.connect()).rejects.toMatchObject({ failure: { kind: 'unauthorized' } })
    await expect(client.connect()).resolves.toBeUndefined()
  })
})

describe('HaloMcpClient — callTool (TD-053)', () => {
  it('forwards the name and arguments to the session', async () => {
    await createClient().callTool('search_records', { limit: 2 })
    // Third argument is TD-054's optional cancellation signal.
    expect(session.callTool).toHaveBeenCalledWith('search_records', { limit: 2 }, undefined)
  })

  it('defaults to empty arguments for a tool that takes none', async () => {
    await createClient().callTool('get_stats_summary')
    expect(session.callTool).toHaveBeenCalledWith('get_stats_summary', {}, undefined)
  })

  it('returns an empty result verbatim rather than treating it as a failure', async () => {
    session.callTool.mockResolvedValueOnce({ content: [], isError: false })
    await expect(createClient().callTool('search_records', { filter: 'zzz' })).resolves.toEqual({
      content: [],
      isError: false
    })
  })

  it('returns an isError result verbatim so the model can adapt to it', async () => {
    const failed = { content: [{ type: 'text', text: 'limit must be 1-100' }], isError: true }
    session.callTool.mockResolvedValueOnce(failed)
    await expect(createClient().callTool('search_records')).resolves.toEqual(failed)
  })

  it('throws unauthorized when the tool reports the session has expired', async () => {
    session.callTool.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Your session has expired.' }],
      isError: true
    })
    await expect(createClient().callTool('search_records')).rejects.toMatchObject({
      failure: { kind: 'unauthorized' }
    })
  })

  it('classifies a transport failure instead of surfacing it raw', async () => {
    session.callTool.mockRejectedValueOnce(new StreamableHTTPError(401, 'Unauthorized'))
    const error = await createClient()
      .callTool('search_records')
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(McpFailureError)
    expect((error as McpFailureError).failure.kind).toBe('unauthorized')
  })
})
