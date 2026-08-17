/**
 * TD-053: the failure vocabulary for halo-mcp calls.
 *
 * Everything that can go wrong collapses to one of four kinds so the
 * renderer can branch on a field instead of string-matching a message.
 * The distinction that matters most is `unauthorized` vs the rest:
 * halo-mcp holds no password and cannot mint a replacement token, so an
 * expired session has to reach the renderer to trigger its existing
 * `reauthenticate()` rather than being reported as a generic outage.
 *
 * A tool that ran and returned `isError: true` is `tool_error` — a
 * normal outcome, not a crash. TD-054 hands it back to the model as a
 * `tool_result` with `is_error: true` so the model can adapt. A tool
 * that simply found nothing is not a failure at all and never reaches
 * this module.
 */

import { McpError, ErrorCode, type CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

export type McpFailure =
  /** 401, or a tool result whose text says the session has expired. */
  | { kind: 'unauthorized'; message: string }
  /** Network failure, DNS, or the per-call timeout elapsing. */
  | { kind: 'unreachable'; message: string }
  /** The tool ran and returned `isError: true`. */
  | { kind: 'tool_error'; message: string; content: CallToolResult['content'] }
  /** Malformed JSON-RPC, a failed `initialize`, or an unexpected status. */
  | { kind: 'protocol'; message: string }

export type McpFailureKind = McpFailure['kind']

/** Carries an {@link McpFailure} across a `throw`. */
export class McpFailureError extends Error {
  readonly failure: McpFailure

  constructor(failure: McpFailure, options?: ErrorOptions) {
    super(failure.message, options)
    this.name = 'McpFailureError'
    this.failure = failure
  }
}

// Node's fetch reports every transport-level problem as an opaque
// `TypeError: fetch failed` and moves the real code onto `cause`, so the
// message is as load-bearing as the code here.
const NETWORK_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPIPE',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET'
])

const NETWORK_MESSAGE = /fetch failed|network|socket hang up|timed? ?out|aborted/i

/**
 * "The session expired" arrives as prose inside a successful tool
 * result when Halo rejects the forwarded token downstream of halo-mcp,
 * so this is a text match by necessity — the alternative is treating a
 * dead session as an ordinary tool failure the model then tries to work
 * around.
 *
 * Deliberately does not match a bare status code: a validation message
 * quoting "401" as data is a tool error, not a dead session.
 */
const SESSION_EXPIRED =
  /(session|token|credential)s?\b[^.]{0,40}\b(expired|invalid)|expired\b[^.]{0,20}\b(session|token)|unauthori[sz]ed|not authenticated/i

function isNetworkError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const { code, message } = error as { code?: unknown; message?: unknown }
  if (typeof code === 'string' && NETWORK_CODES.has(code)) return true
  return typeof message === 'string' && NETWORK_MESSAGE.test(message)
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

/** Classifies anything thrown by the MCP client or its transport. */
export function toMcpFailure(error: unknown): McpFailure {
  if (error instanceof McpFailureError) return error.failure

  if (error instanceof StreamableHTTPError) {
    if (error.code === 401 || error.code === 403) {
      return { kind: 'unauthorized', message: error.message }
    }
    return { kind: 'protocol', message: error.message }
  }

  if (error instanceof McpError) {
    if (error.code === ErrorCode.RequestTimeout || error.code === ErrorCode.ConnectionClosed) {
      return { kind: 'unreachable', message: error.message }
    }
    return { kind: 'protocol', message: error.message }
  }

  if (isNetworkError(error)) {
    return { kind: 'unreachable', message: messageOf(error) }
  }

  return { kind: 'protocol', message: messageOf(error) }
}

function textOf(content: CallToolResult['content']): string {
  return content
    .map((block) => (block.type === 'text' ? block.text : ''))
    .filter((text) => text.length > 0)
    .join('\n')
}

/**
 * Classifies a tool result that came back over a successful HTTP call.
 * Returns `null` for anything the model should see verbatim — including
 * an empty result, which for a prefix filter means "nothing starts with
 * that" and is a valid answer rather than a failure.
 *
 * The session-expired text match is deliberately gated on `isError`.
 * Halo's catalogue is full of arbitrary user-authored strings, and
 * scanning successful results for words like "unauthorized" would blow
 * up the session on a record that merely happens to mention one.
 */
export function toolResultFailure(result: CallToolResult): McpFailure | null {
  if (result.isError !== true) return null

  const message = textOf(result.content) || 'The tool reported an error.'
  if (SESSION_EXPIRED.test(message)) {
    return { kind: 'unauthorized', message }
  }
  return { kind: 'tool_error', message, content: result.content }
}
