/**
 * TD-053: the main-process client for halo-mcp, which speaks Streamable
 * HTTP in stateless mode and authenticates with the caller's own Halo
 * access token — the same one TD-030 sealed into the keychain. halo-mcp
 * validates it against Halo's Cognito pool and forwards it, so Halo sees
 * the user rather than a service identity.
 *
 * The URL and the token arrive as getters rather than values.
 * Re-reading the token on every request is the whole point: a silent
 * reauth swaps the stored token underneath a long-lived client, and one
 * captured at construction would keep presenting the dead one.
 *
 * Electron-free by design — `getUrl`/`getToken` are injected, so the
 * unit tests drive it without mocking `app` or `safeStorage`. TD-054
 * wires it to `resolveMcpUrl()` and `resolveAuthToken()`.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { FetchLike } from '@modelcontextprotocol/sdk/shared/transport.js'
import {
  CallToolResultSchema,
  type CallToolResult,
  type Tool
} from '@modelcontextprotocol/sdk/types.js'
import { McpFailureError, toMcpFailure, toolResultFailure } from './errors'

/**
 * `get_related_records` defaults to `limit: 100` and a full page carries
 * four presigned image slots per record, so a legitimate response is
 * genuinely large. The timeout has to cover that, not just a fast path.
 */
export const MCP_CALL_TIMEOUT_MS = 30_000

/** Advertised to halo-mcp for logging; not a compatibility gate. */
const CLIENT_INFO = { name: 'thunder-desktop', version: '1.0.0' } as const

/** The slice of the MCP SDK this client uses, so tests can stand in for it. */
export interface McpSession {
  connect(): Promise<void>
  listTools(): Promise<{ tools: Tool[] }>
  callTool(name: string, args: Record<string, unknown>): Promise<CallToolResult>
  close(): Promise<void>
}

export interface HaloMcpClientOptions {
  getUrl: () => string
  getToken: () => string | undefined
  createSession?: (url: URL, fetchImpl: FetchLike) => McpSession
}

/**
 * Injects the bearer token per request. This has to be the transport's
 * `fetch` override and not its `requestInit.headers`: the SDK merges
 * `requestInit` once, at construction, so a header set there is a
 * snapshot of whatever token happened to be stored at the time.
 */
export function createAuthorizedFetch(
  getToken: () => string | undefined,
  fetchImpl: FetchLike = fetch
): FetchLike {
  return async (url, init) => {
    const token = getToken()
    if (token === undefined || token.length === 0) {
      throw new McpFailureError({
        kind: 'unauthorized',
        message: 'No Halo access token is stored — sign in again.'
      })
    }
    const headers = new Headers(init?.headers)
    headers.set('Authorization', `Bearer ${token}`)
    return fetchImpl(url, { ...init, headers })
  }
}

function createStreamableSession(url: URL, fetchImpl: FetchLike): McpSession {
  const transport = new StreamableHTTPClientTransport(url, { fetch: fetchImpl })
  const client = new Client(CLIENT_INFO, { capabilities: {} })
  // The handshake and the tool list get the same ceiling as a call. An
  // endpoint that accepts the connection and then never answers would
  // otherwise leave `connect()` pending forever, which is the one
  // failure mode a timeout on `tools/call` alone cannot cover.
  const timeout = { timeout: MCP_CALL_TIMEOUT_MS }
  return {
    connect: () => client.connect(transport, timeout),
    listTools: () => client.listTools(undefined, timeout),
    callTool: async (name, args) => {
      const result = await client.callTool({ name, arguments: args }, CallToolResultSchema, timeout)
      // The declared return also covers the legacy `toolResult` shape,
      // which passing `CallToolResultSchema` rules out — the union is an
      // artefact of the signature, not a runtime possibility.
      return result as CallToolResult
    },
    close: () => client.close()
  }
}

async function mapFailures<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    throw new McpFailureError(toMcpFailure(error), { cause: error })
  }
}

/**
 * Caches the in-flight promise, not just the resolved value, so
 * concurrent first callers share one round trip. A rejection is dropped
 * rather than cached: the next caller retries, which is what recovery
 * after a reauth depends on.
 */
function memoise<T>(
  read: () => Promise<T> | null,
  write: (value: Promise<T> | null) => void,
  produce: () => Promise<T>
): Promise<T> {
  const cached = read()
  if (cached !== null) return cached

  const attempt: Promise<T> = produce().catch((error: unknown) => {
    if (read() === attempt) write(null)
    throw error
  })
  write(attempt)
  return attempt
}

export class HaloMcpClient {
  readonly #options: HaloMcpClientOptions
  readonly #createSession: (url: URL, fetchImpl: FetchLike) => McpSession
  #session: Promise<McpSession> | null = null
  #tools: Promise<Tool[]> | null = null

  constructor(options: HaloMcpClientOptions) {
    this.#options = options
    this.#createSession = options.createSession ?? createStreamableSession
  }

  /**
   * `initialize` + `notifications/initialized`. Stateless mode means the
   * server issues no `Mcp-Session-Id`, so there is nothing to thread
   * between calls and nothing to persist.
   */
  async connect(): Promise<void> {
    await this.#connect()
  }

  /**
   * Memoised for the process lifetime and dropped on {@link disconnect}.
   * halo-mcp writes long, prescriptive tool descriptions deliberately;
   * re-fetching them every turn would buy a round trip and nothing else.
   */
  listTools(): Promise<Tool[]> {
    return memoise(
      () => this.#tools,
      (value) => {
        this.#tools = value
      },
      async () => {
        const session = await this.#connect()
        const { tools } = await mapFailures(() => session.listTools())
        return tools
      }
    )
  }

  /**
   * Returns the result verbatim — TD-054 hands it to the model and
   * TD-057 reads it for cards, so neither `content` nor `isError` is
   * reshaped. `isError: true` included: a tool that ran and failed is a
   * normal outcome the model can adapt to.
   *
   * The exception is an expired session. halo-mcp holds no password and
   * cannot mint a replacement, so there is nothing for the model to
   * adapt to — that one throws, to reach the renderer's
   * `reauthenticate()`.
   */
  async callTool(name: string, args: Record<string, unknown> = {}): Promise<CallToolResult> {
    const session = await this.#connect()
    const result = await mapFailures(() => session.callTool(name, args))

    const failure = toolResultFailure(result)
    if (failure?.kind === 'unauthorized') throw new McpFailureError(failure)
    return result
  }

  async disconnect(): Promise<void> {
    const pending = this.#session
    this.#session = null
    this.#tools = null
    if (pending === null) return
    // A session that never finished connecting has nothing to close,
    // and its rejection was already reported to whoever awaited it.
    const session = await pending.catch(() => null)
    if (session !== null) await mapFailures(() => session.close())
  }

  #connect(): Promise<McpSession> {
    return memoise(
      () => this.#session,
      (value) => {
        this.#session = value
      },
      () =>
        mapFailures(async () => {
          const fetchImpl = createAuthorizedFetch(this.#options.getToken)
          const session = this.#createSession(new URL(this.#options.getUrl()), fetchImpl)
          await session.connect()
          return session
        })
    )
  }
}
