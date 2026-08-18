/**
 * TD-065: the main-process half of the thunder-context cutover. Creates
 * a conversation, posts a turn, polls it to a terminal status and hands
 * back the same `ChatAskResult` the renderer has always read.
 *
 * Kept free of the `electron` import — the base URL, the bearer token
 * and `fetch` all arrive as injected callbacks — so the polling rules
 * are unit-testable under vitest's node environment (same split as
 * `settings-io` / `auth-io`).
 *
 * The token is a callback rather than a value on purpose: a silent
 * reauth partway through a five-minute poll must not leave the loop
 * replaying an expired one.
 */

import type {
  ChatAction,
  ChatAskFailure,
  ChatAskResult,
  ChatErrorKind,
  ChatStatus
} from '../../shared/chat'

/** Proposal §4.3: 1s while a turn is young, 2s once it has been a while. */
export const POLL_INTERVAL_MS = 1_000
export const SLOW_POLL_INTERVAL_MS = 2_000
export const SLOW_POLL_AFTER_MS = 30_000

/**
 * The whole turn's ceiling. Matches thunder-context's own worker timeout
 * — a poll that outlives the worker is waiting on something that has
 * already stopped running.
 */
export const POLL_TIMEOUT_MS = 300_000

/** Per-request ceiling, so one hung socket can't stall the poll loop. */
export const REQUEST_TIMEOUT_MS = 15_000

/**
 * `POST /turns` 409s while the conversation still holds its lock. A
 * cancelled turn releases that lock only once its worker notices, so a
 * user who asks a second question immediately would otherwise be told
 * their own superseded turn is in the way. Retried at the poll cadence
 * rather than failed outright.
 */
export const CONFLICT_RETRIES = 5

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export interface ContextClientOptions {
  getBaseUrl: () => string
  getToken: () => string | undefined
  fetch?: FetchLike
  now?: () => number
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>
}

export interface AskOptions {
  question: string
  onStatus: (status: ChatStatus) => void
  /** Aborting resolves the turn `cancelled` and deletes it server-side. */
  signal: AbortSignal
}

export interface ContextClient {
  ask: (options: AskOptions) => Promise<ChatAskResult>
  /** Drops the server-side transcript. Best effort — never throws. */
  clearConversation: () => Promise<void>
}

/**
 * The error taxonomy thunder-context puts on the wire. Typed as
 * `ChatErrorKind` so a code removed from the shared union fails to
 * compile here rather than silently stopping matching. `interrupted` is
 * deliberately absent — it is ours, not the server's.
 */
const WIRE_ERROR_CODES: ReadonlyArray<ChatErrorKind> = [
  'unauthorized',
  'unreachable',
  'bedrock_access_denied',
  'rate_limited',
  'refusal',
  'loop_limit',
  'cancelled',
  'unknown'
]

const GENERIC_MESSAGE = 'The assistant could not answer that.'

type JsonObject = Record<string, unknown>

/** A completed HTTP exchange, whatever the status. */
interface Exchange {
  status: number
  body: JsonObject | null
}

/**
 * Every internal step either produces its payload or the failure the
 * renderer will see — nothing throws its way back up to `ask`.
 */
type Outcome<T> = ({ ok: true } & T) | { ok: false; failure: ChatAskFailure }

function failure(error: ChatErrorKind, message: string): ChatAskFailure {
  return { ok: false, error, message }
}

const CANCELLED = failure('cancelled', 'Cancelled.')
const MALFORMED = failure('unreachable', 'The assistant service sent a malformed response.')

function asObject(value: unknown): JsonObject | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : null
}

function stringField(body: JsonObject | null, key: string): string | undefined {
  const value = body?.[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/**
 * Route-level errors (`{ error, message }`) and terminal turn results
 * share a vocabulary, so they share a mapping. A code this client does
 * not know becomes `unknown` rather than throwing — a server that adds
 * one must not break an old client.
 */
function toErrorKind(code: string | undefined, status: number): ChatErrorKind {
  if (code !== undefined && (WIRE_ERROR_CODES as ReadonlyArray<string>).includes(code)) {
    return code as ChatErrorKind
  }
  if (status === 401 || status === 403) return 'unauthorized'
  if (status >= 500) return 'unreachable'
  return 'unknown'
}

function httpFailure(exchange: Exchange): ChatAskFailure {
  return failure(
    toErrorKind(stringField(exchange.body, 'error'), exchange.status),
    stringField(exchange.body, 'message') ?? GENERIC_MESSAGE
  )
}

/**
 * A terminal turn carries a `result` in exactly the shape the renderer
 * reads. Validated rather than trusted: a malformed payload reported as
 * a success would render an empty card with no explanation.
 */
function toAskResult(result: unknown): ChatAskResult | null {
  const record = asObject(result)
  if (!record) return null
  if (record.ok === true) {
    if (typeof record.text !== 'string' || asObject(record.action) === null) return null
    return {
      ok: true,
      text: record.text,
      action: record.action as ChatAction,
      truncated: record.truncated === true
    }
  }
  if (record.ok === false) {
    return failure(
      toErrorKind(stringField(record, 'error'), 200),
      stringField(record, 'message') ?? GENERIC_MESSAGE
    )
  }
  return null
}

function defaultSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(finish, ms)
    function finish(): void {
      clearTimeout(timer)
      signal.removeEventListener('abort', finish)
      resolve()
    }
    signal.addEventListener('abort', finish, { once: true })
  })
}

/** Trailing slashes would double up against the leading-slash paths below. */
function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

export function createContextClient(options: ContextClientOptions): ContextClient {
  const doFetch = options.fetch ?? ((input, init) => fetch(input, init))
  const now = options.now ?? Date.now
  const sleep = options.sleep ?? defaultSleep

  // Paired with the URL it was minted against: a conversation id means
  // nothing to a different deployment, so repointing `contextUrl` in
  // Settings has to start a new one rather than 404 on every turn.
  let conversation: { id: string; baseUrl: string } | null = null

  async function send(
    method: string,
    path: string,
    body?: JsonObject
  ): Promise<Outcome<{ exchange: Exchange }>> {
    const token = options.getToken()
    if (token === undefined) {
      return { ok: false, failure: failure('unauthorized', 'Your session has expired.') }
    }

    // Its own controller, not the caller's: the request that deletes a
    // cancelled turn is issued *because* the caller aborted, so it must
    // not be aborted along with it.
    const timeout = new AbortController()
    const timer = setTimeout(() => timeout.abort(), REQUEST_TIMEOUT_MS)
    try {
      const response = await doFetch(`${normalizeBaseUrl(options.getBaseUrl())}${path}`, {
        method,
        signal: timeout.signal,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body !== undefined && { 'Content-Type': 'application/json' })
        },
        ...(body !== undefined && { body: JSON.stringify(body) })
      })
      return { ok: true, exchange: { status: response.status, body: await readBody(response) } }
    } catch (error) {
      console.warn(`[context] ${method} ${path} failed`, error)
      return {
        ok: false,
        failure: failure('unreachable', 'The assistant service could not be reached.')
      }
    } finally {
      clearTimeout(timer)
    }
  }

  async function readBody(response: Response): Promise<JsonObject | null> {
    if (response.status === 204) return null
    try {
      return asObject(await response.json())
    } catch {
      return null
    }
  }

  async function ensureConversation(): Promise<Outcome<{ id: string }>> {
    const baseUrl = normalizeBaseUrl(options.getBaseUrl())
    if (conversation?.baseUrl === baseUrl) return { ok: true, id: conversation.id }

    const result = await send('POST', '/conversations')
    if (!result.ok) return { ok: false, failure: result.failure }
    if (result.exchange.status !== 201) {
      return { ok: false, failure: httpFailure(result.exchange) }
    }
    const id = stringField(result.exchange.body, 'conversation_id')
    if (id === undefined) return { ok: false, failure: MALFORMED }

    conversation = { id, baseUrl }
    return { ok: true, id }
  }

  async function createTurn(
    id: string,
    question: string,
    signal: AbortSignal
  ): Promise<Outcome<{ turnId: string }>> {
    const path = `/conversations/${encodeURIComponent(id)}/turns`

    for (let attempt = 0; ; attempt += 1) {
      const result = await send('POST', path, { question })
      if (!result.ok) return { ok: false, failure: result.failure }

      if (result.exchange.status === 409 && attempt < CONFLICT_RETRIES) {
        await sleep(POLL_INTERVAL_MS, signal)
        if (signal.aborted) return { ok: false, failure: CANCELLED }
        continue
      }
      if (result.exchange.status !== 202) {
        return { ok: false, failure: httpFailure(result.exchange) }
      }

      const turnId = stringField(result.exchange.body, 'turn_id')
      if (turnId === undefined) return { ok: false, failure: MALFORMED }

      return { ok: true, turnId }
    }
  }

  async function pollTurn(
    turnId: string,
    onStatus: (status: ChatStatus) => void,
    signal: AbortSignal
  ): Promise<ChatAskResult> {
    const startedAt = now()
    let lastPushed = ''

    for (;;) {
      if (signal.aborted) return CANCELLED
      const elapsed = now() - startedAt
      if (elapsed >= POLL_TIMEOUT_MS) {
        return failure('unreachable', 'The assistant took too long to answer.')
      }

      await sleep(elapsed >= SLOW_POLL_AFTER_MS ? SLOW_POLL_INTERVAL_MS : POLL_INTERVAL_MS, signal)
      if (signal.aborted) return CANCELLED

      const result = await send('GET', `/turns/${encodeURIComponent(turnId)}`)
      if (!result.ok) return result.failure
      if (signal.aborted) return CANCELLED

      const { status, body } = result.exchange
      // Swept, or never ours to begin with. The renderer already has a
      // state for a turn nobody is coming back to.
      if (status === 404) {
        return failure('interrupted', 'That answer is no longer available.')
      }
      if (status !== 200) return httpFailure(result.exchange)

      const turnStatus = stringField(body, 'status')
      if (turnStatus === 'done' || turnStatus === 'error' || turnStatus === 'cancelled') {
        return (
          toAskResult(body?.result) ??
          failure('unreachable', 'The assistant service sent a malformed answer.')
        )
      }

      const next: ChatStatus =
        turnStatus === 'calling-tool'
          ? { state: 'calling-tool', tool: stringField(body, 'tool') ?? '' }
          : { state: 'thinking' }
      const key = next.state === 'calling-tool' ? `${next.state}:${next.tool}` : next.state
      if (key !== lastPushed) {
        lastPushed = key
        onStatus(next)
      }
    }
  }

  return {
    async ask({ question, onStatus, signal }) {
      const conversation = await ensureConversation()
      if (!conversation.ok) return conversation.failure
      if (signal.aborted) return CANCELLED

      const turn = await createTurn(conversation.id, question, signal)
      if (!turn.ok) return turn.failure

      const result = await pollTurn(turn.turnId, onStatus, signal)
      // Cancelling in the renderer only frees the renderer; the server
      // keeps spending on the answer until it is told to stop.
      if (signal.aborted) {
        await send('DELETE', `/turns/${encodeURIComponent(turn.turnId)}`)
      }
      return result
    },

    async clearConversation() {
      const current = conversation
      conversation = null
      if (current === null) return
      await send('DELETE', `/conversations/${encodeURIComponent(current.id)}`)
    }
  }
}
