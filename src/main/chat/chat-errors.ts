/**
 * TD-054: collapses everything a turn can throw — MCP failures, Bedrock
 * rejections, AWS signing errors, an aborted stream — into the single
 * {@link ChatErrorKind} union the renderer branches on.
 *
 * Bedrock's failures arrive as opaque messages rather than typed
 * classes, so the AWS cases are string matches by necessity. The
 * substrings mirror `scripts/bedrock-smoke.mjs`, which is where each of
 * them was first observed against a real account.
 */

import type { ChatErrorKind } from '../../shared/chat'
import { McpFailureError, messageOf, type McpFailure } from '../mcp/errors'

export interface ChatFailure {
  error: ChatErrorKind
  message: string
}

/**
 * Model access is granted per account *and* per region, so this is the
 * one Bedrock failure a retry can never clear — it needs an AWS console
 * action. `on-demand throughput` lands here too: the account can reach
 * the model only through an inference profile it has not been granted.
 */
const ACCESS_DENIED = /AccessDenied|not authorized to perform|on-demand throughput/i
const BAD_CREDENTIALS = /UnrecognizedClient|InvalidSignature|security token|ExpiredToken/i
const RATE_LIMITED = /Throttling|TooManyRequests|rate ?limit|ServiceQuotaExceeded/i
const UNREACHABLE =
  /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|getaddrinfo|fetch failed|socket hang up/i

const MCP_KIND_TO_CHAT: Record<McpFailure['kind'], ChatErrorKind> = {
  unauthorized: 'unauthorized',
  unreachable: 'unreachable',
  // A tool that ran and failed never reaches here — the loop hands it
  // back to the model as an errored `tool_result`. Reaching this arm
  // means the failure escaped that path, which is not a tool problem.
  tool_error: 'unknown',
  protocol: 'unreachable'
}

/**
 * `AbortController.abort()` surfaces differently depending on who
 * noticed first — Node's fetch throws a `DOMException` named
 * `AbortError`, the Anthropic SDK throws its own `APIUserAbortError`,
 * and our own pre-flight check throws a plain `Error`. All three mean
 * the user pressed cancel.
 */
function isAbort(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const { name } = error as { name?: unknown }
  return name === 'AbortError' || name === 'APIUserAbortError'
}

/** HTTP status, when the thrower carries one (the Anthropic SDK does). */
function statusOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const { status } = error as { status?: unknown }
  return typeof status === 'number' ? status : undefined
}

export function classifyChatError(error: unknown): ChatFailure {
  const message = messageOf(error)

  if (isAbort(error)) {
    return { error: 'cancelled', message: 'The request was cancelled.' }
  }

  if (error instanceof McpFailureError) {
    return { error: MCP_KIND_TO_CHAT[error.failure.kind], message }
  }

  // Status first: a 403 is access-denied regardless of how AWS worded
  // it, and a 429 is throttling even when the body says something else.
  const status = statusOf(error)
  if (status === 403) return { error: 'bedrock_access_denied', message }
  if (status === 401) return { error: 'unauthorized', message }
  if (status === 429) return { error: 'rate_limited', message }

  if (ACCESS_DENIED.test(message)) return { error: 'bedrock_access_denied', message }
  if (BAD_CREDENTIALS.test(message)) return { error: 'unauthorized', message }
  if (RATE_LIMITED.test(message)) return { error: 'rate_limited', message }
  if (UNREACHABLE.test(message)) return { error: 'unreachable', message }
  if (status !== undefined && status >= 500) return { error: 'unreachable', message }

  return { error: 'unknown', message }
}
