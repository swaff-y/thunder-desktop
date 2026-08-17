/**
 * TD-054: the AI chat contract shared by main, preload and renderer.
 *
 * Lives beside `settings.ts` and under the same rule: no `electron` and
 * no runtime imports that aren't safe in a sandboxed renderer. The
 * agent loop runs entirely in main, so this module is the only part of
 * it the renderer ever sees.
 */

/**
 * What the renderer should render beside the answer. Picked from the
 * tool the model actually called, not from the prose — `list` fans out
 * to a card list, `single` to one record card, `none` renders nothing.
 */
export type ChatActionKind = 'list' | 'single' | 'none'

/**
 * `tool` is `null` only when the turn made no successful tool call at
 * all. A tool outside the phase-1 set produces `kind: 'none'` with the
 * tool still named, so a card that gains support later has the payload
 * waiting for it.
 *
 * `result` never carries a presigned `url` / `uploadUrl` — see
 * `main/chat/action.ts`. Cards re-fetch images by id (TD-058).
 */
export interface ChatAction {
  kind: ChatActionKind
  tool: string | null
  args: Record<string, unknown>
  title: string
  result: unknown
}

/**
 * Why a turn failed, as a field the renderer can branch on rather than
 * a message it has to string-match.
 *
 * `bedrock_access_denied` is deliberately separate from `unauthorized`:
 * the fix is granting model access in the AWS console for that region,
 * not signing in again, and a retry will never clear it.
 */
export type ChatErrorKind =
  | 'unauthorized'
  | 'unreachable'
  | 'bedrock_access_denied'
  | 'rate_limited'
  | 'refusal'
  | 'loop_limit'
  | 'cancelled'
  | 'unknown'

export interface ChatAskSuccess {
  ok: true
  text: string
  action: ChatAction
  /** The model hit `max_tokens`; `text` is what it managed to say. */
  truncated: boolean
}

export interface ChatAskFailure {
  ok: false
  error: ChatErrorKind
  message: string
}

export type ChatAskResult = ChatAskSuccess | ChatAskFailure

/** One prior turn, replayed as plain text — no tool blocks are kept. */
export interface ChatHistoryTurn {
  role: 'user' | 'assistant'
  text: string
}

export interface ChatAskRequest {
  question: string
  history?: ChatHistoryTurn[]
}

/**
 * Drives the design's "Running catalogue query…" spinner. `calling-tool`
 * carries the tool name so the spinner can say what it is waiting on.
 */
export type ChatStatus =
  | { state: 'idle' }
  | { state: 'thinking' }
  | { state: 'calling-tool'; tool: string }
