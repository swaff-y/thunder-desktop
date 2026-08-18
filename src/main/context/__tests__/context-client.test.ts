/**
 * TD-065: the polling rules the cutover rests on. Time and the network
 * are both injected, so these run in milliseconds and assert on what was
 * actually sent rather than on a spy's call count alone.
 */

import { describe, expect, it, vi } from 'vitest'
import {
  createContextClient,
  POLL_INTERVAL_MS,
  POLL_TIMEOUT_MS,
  SLOW_POLL_AFTER_MS,
  SLOW_POLL_INTERVAL_MS,
  type ContextClient,
  type ContextClientOptions
} from '../context-client'
import type { ChatAction, ChatStatus } from '../../../shared/chat'

const BASE_URL = 'https://thunder-context.example/v1'
const CONVERSATION_ID = 'conv-1'
const TURN_ID = 'conv-1.turn-1'
const TURN_PATH = `/turns/${encodeURIComponent(TURN_ID)}`

const ACTION: ChatAction = {
  kind: 'list',
  tool: 'search_records',
  args: { query: 'actors' },
  title: 'Search records',
  result: { records: [] }
}

const ANSWER = { ok: true, text: 'Eleven actors.', action: ACTION, truncated: false }
const THINKING = { status: 'thinking' }
const DONE = { status: 'done', result: ANSWER }

interface Call {
  method: string
  path: string
  token: string | null
  body: unknown
}

type Responder = (call: Call) => Response

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status })
}

/**
 * The happy path for everything but the polls, which walk `statuses` and
 * then repeat the last one — so a test that wants "always thinking"
 * passes one entry rather than a hundred.
 */
function turnScript(statuses: ReadonlyArray<unknown>): Responder {
  let poll = 0
  return (call) => {
    if (call.method === 'POST' && call.path === '/conversations') {
      return json(201, { conversation_id: CONVERSATION_ID })
    }
    if (call.method === 'POST' && call.path.endsWith('/turns')) {
      return json(202, { turn_id: TURN_ID, status: 'thinking' })
    }
    if (call.method === 'GET') {
      const next = statuses[Math.min(poll, statuses.length - 1)]
      poll += 1
      return json(200, next)
    }
    return json(204)
  }
}

interface Harness {
  client: ContextClient
  calls: Call[]
  sleeps: number[]
  clock: { now: number }
}

/** Every request is recorded; `respond` decides what comes back. */
function harness(respond: Responder, overrides: Partial<ContextClientOptions> = {}): Harness {
  const calls: Call[] = []
  const sleeps: number[] = []
  const clock = { now: 0 }

  const client = createContextClient({
    getBaseUrl: () => BASE_URL,
    getToken: () => 'token-1',
    now: () => clock.now,
    sleep: async (ms) => {
      sleeps.push(ms)
      clock.now += ms
    },
    fetch: (url, init) => {
      const headers = new Headers(init?.headers)
      const call: Call = {
        method: init?.method ?? 'GET',
        // Everything after the deployment's own `/v1`, so a test that
        // repoints the base URL still asserts on routes.
        path: url.replace(/^https:\/\/[^/]+\/v1/, ''),
        token: headers.get('Authorization'),
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
      }
      calls.push(call)
      return Promise.resolve(respond(call))
    },
    ...overrides
  })

  return { client, calls, sleeps, clock }
}

function ask(
  client: ContextClient,
  signal: AbortSignal = new AbortController().signal
): { result: Promise<Awaited<ReturnType<ContextClient['ask']>>>; statuses: ChatStatus[] } {
  const statuses: ChatStatus[] = []
  const result = client.ask({
    question: 'how many actors?',
    onStatus: (status) => statuses.push(status),
    signal
  })
  return { result, statuses }
}

describe('context-client (TD-065)', () => {
  it('polls a turn through to its answer', async () => {
    const { client, calls } = harness(
      turnScript([THINKING, { status: 'calling-tool', tool: 'search_records' }, DONE])
    )

    const { result, statuses } = ask(client)

    expect(await result).toEqual(ANSWER)
    expect(statuses).toEqual([
      { state: 'thinking' },
      { state: 'calling-tool', tool: 'search_records' }
    ])
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      'POST /conversations',
      `POST /conversations/${CONVERSATION_ID}/turns`,
      `GET ${TURN_PATH}`,
      `GET ${TURN_PATH}`,
      `GET ${TURN_PATH}`
    ])
    expect(calls[1].body).toEqual({ question: 'how many actors?' })
  })

  it('reuses the conversation across turns', async () => {
    const { client, calls } = harness(turnScript([DONE]))

    await ask(client).result
    await ask(client).result

    expect(calls.filter((call) => call.path === '/conversations')).toHaveLength(1)
  })

  // A conversation id means nothing to a different deployment, so a
  // Settings change mid-session has to start a new one.
  it('starts a new conversation when the base URL changes', async () => {
    let baseUrl = BASE_URL
    const { client, calls } = harness(turnScript([DONE]), { getBaseUrl: () => baseUrl })

    await ask(client).result
    baseUrl = 'https://thunder-context-dev.example/v1'
    await ask(client).result

    expect(calls.filter((call) => call.path === '/conversations')).toHaveLength(2)
  })

  it('does not push the same status twice', async () => {
    const { client } = harness(turnScript([THINKING, THINKING, DONE]))

    const { result, statuses } = ask(client)
    await result

    expect(statuses).toEqual([{ state: 'thinking' }])
  })

  // The server sweeps finished turns; a poll that outlives the sweep is
  // asking about an answer nobody is coming back to.
  it('resolves a swept turn as interrupted', async () => {
    const script = turnScript([THINKING])
    const { client } = harness((call) =>
      call.method === 'GET' ? json(404, { error: 'not_found' }) : script(call)
    )

    expect(await ask(client).result).toEqual({
      ok: false,
      error: 'interrupted',
      message: expect.any(String)
    })
  })

  it("surfaces a terminal failure with the server's own error code", async () => {
    const { client } = harness(
      turnScript([
        { status: 'error', result: { ok: false, error: 'rate_limited', message: 'Slow down.' } }
      ])
    )

    expect(await ask(client).result).toEqual({
      ok: false,
      error: 'rate_limited',
      message: 'Slow down.'
    })
  })

  // A server that adds a code must not break an old client.
  it('maps an unrecognised error code to unknown', async () => {
    const { client } = harness(
      turnScript([
        { status: 'error', result: { ok: false, error: 'quota_exhausted', message: 'Nope.' } }
      ])
    )

    expect(await ask(client).result).toEqual({ ok: false, error: 'unknown', message: 'Nope.' })
  })

  it('rejects a malformed terminal result rather than rendering an empty card', async () => {
    const { client } = harness(turnScript([{ status: 'done', result: { ok: true, text: 'hi' } }]))

    expect(await ask(client).result).toEqual({
      ok: false,
      error: 'unreachable',
      message: expect.any(String)
    })
  })

  it('stops polling on cancel and pushes no further status', async () => {
    const controller = new AbortController()
    let sleeps = 0
    const { client, calls } = harness(
      turnScript([THINKING, { status: 'calling-tool', tool: 'search_records' }, DONE]),
      {
        sleep: async () => {
          sleeps += 1
          if (sleeps === 2) controller.abort()
        }
      }
    )

    const { result, statuses } = ask(client, controller.signal)

    expect(await result).toEqual({ ok: false, error: 'cancelled', message: expect.any(String) })
    expect(statuses).toEqual([{ state: 'thinking' }])
    expect(calls.filter((call) => call.method === 'GET')).toHaveLength(1)
    // The server keeps spending until it is told to stop.
    expect(calls.at(-1)).toMatchObject({ method: 'DELETE', path: TURN_PATH })
  })

  // A cancelled turn releases the conversation lock only once its worker
  // notices, so the question that superseded it can legitimately 409.
  it('retries a 409 rather than failing the question', async () => {
    const script = turnScript([DONE])
    let posts = 0
    const { client, calls } = harness((call) => {
      if (call.method === 'POST' && call.path.endsWith('/turns')) {
        posts += 1
        return posts < 3
          ? json(409, { error: 'conflict', message: 'In flight.' })
          : json(202, { turn_id: TURN_ID })
      }
      return script(call)
    })

    expect(await ask(client).result).toEqual(ANSWER)
    expect(calls.filter((call) => call.path.endsWith('/turns'))).toHaveLength(3)
  })

  it("gives up on a conversation that never frees up, reporting the server's message", async () => {
    const script = turnScript([DONE])
    const { client } = harness((call) =>
      call.method === 'POST' && call.path.endsWith('/turns')
        ? json(409, { error: 'conflict', message: 'A turn is already in flight.' })
        : script(call)
    )

    expect(await ask(client).result).toEqual({
      ok: false,
      error: 'unknown',
      message: 'A turn is already in flight.'
    })
  })

  // A silent reauth mid-poll must not leave the loop replaying the token
  // it started with.
  it('reads the token afresh for every request', async () => {
    let token = 'token-1'
    const { client, calls } = harness(turnScript([THINKING, DONE]), {
      getToken: () => token,
      sleep: async () => {
        token = 'token-2'
      }
    })

    await ask(client).result

    expect(calls[0].token).toBe('Bearer token-1')
    expect(calls.at(-1)?.token).toBe('Bearer token-2')
  })

  it('fails unauthorized without a request when there is no token', async () => {
    const { client, calls } = harness(turnScript([DONE]), { getToken: () => undefined })

    expect(await ask(client).result).toEqual({
      ok: false,
      error: 'unauthorized',
      message: expect.any(String)
    })
    expect(calls).toHaveLength(0)
  })

  it('maps a 401 from the gateway onto unauthorized', async () => {
    const { client } = harness(() => json(401, { error: 'unauthorized', message: 'Expired.' }))

    expect(await ask(client).result).toEqual({
      ok: false,
      error: 'unauthorized',
      message: 'Expired.'
    })
  })

  it('reports a network failure as unreachable', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const script = turnScript([THINKING])
    const { client } = harness((call) => {
      if (call.method === 'GET') throw new Error('ECONNREFUSED')
      return script(call)
    })

    expect(await ask(client).result).toEqual({
      ok: false,
      error: 'unreachable',
      message: expect.any(String)
    })
  })

  it('gives up at five minutes, backing the poll off along the way', async () => {
    const { client, calls, sleeps, clock } = harness(turnScript([THINKING]))

    expect(await ask(client).result).toEqual({
      ok: false,
      error: 'unreachable',
      message: expect.any(String)
    })
    expect(clock.now).toBeGreaterThanOrEqual(POLL_TIMEOUT_MS)

    const fast = SLOW_POLL_AFTER_MS / POLL_INTERVAL_MS
    expect(sleeps.slice(0, fast)).toEqual(Array.from({ length: fast }, () => POLL_INTERVAL_MS))
    expect(sleeps[fast]).toBe(SLOW_POLL_INTERVAL_MS)
    expect(calls.filter((call) => call.method === 'GET')).toHaveLength(
      fast + (POLL_TIMEOUT_MS - SLOW_POLL_AFTER_MS) / SLOW_POLL_INTERVAL_MS
    )
  })

  it('deletes the conversation on clear and starts a new one next turn', async () => {
    const { client, calls } = harness(turnScript([DONE]))

    await ask(client).result
    await client.clearConversation()
    await ask(client).result

    expect(calls.filter((call) => call.method === 'DELETE')).toMatchObject([
      { path: `/conversations/${CONVERSATION_ID}` }
    ])
    expect(calls.filter((call) => call.path === '/conversations')).toHaveLength(2)
  })

  it('does not call the server when there is no conversation to clear', async () => {
    const { client, calls } = harness(turnScript([DONE]))

    await client.clearConversation()

    expect(calls).toHaveLength(0)
  })

  it('tolerates a base URL with a trailing slash', async () => {
    const { client, calls } = harness(turnScript([DONE]), { getBaseUrl: () => `${BASE_URL}/` })

    await ask(client).result

    expect(calls[0].path).toBe('/conversations')
  })
})
