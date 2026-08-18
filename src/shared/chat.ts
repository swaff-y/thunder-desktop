/**
 * TD-054: the AI chat contract shared by main, preload and renderer.
 *
 * Lives beside `settings.ts` and under the same rule: no `electron` and
 * no runtime imports that aren't safe in a sandboxed renderer.
 *
 * TD-065: these shapes are now the thunder-context wire contract too
 * (`docs/wire-contract.md` in that repo reproduces them). Changing one
 * is a change to three clients and a Ruby service, not a local edit.
 */

/**
 * What the renderer should render beside the answer. Picked from the
 * tool the model actually called, not from the prose — `list` fans out
 * to a card list, `single` to one record card, `none` renders nothing.
 *
 * `chart` is the exception: `get_top_entities` backs both a list and a
 * chart, so TD-059 has the model say which it meant by calling the
 * `show_chart` tool rather than guessing from the question.
 */
export type ChatActionKind = 'list' | 'single' | 'chart' | 'none'

/**
 * The halo-mcp tools that answer with a page of rows. Shared because
 * both sides must agree: main derives `kind: 'list'` from this set and
 * the renderer's list card maps a row shape per name, so a tool added
 * to one copy and not the other renders an empty card.
 */
export const LIST_TOOLS = [
  'search_records',
  'list_entities',
  'get_related_records',
  'get_top_entities'
] as const

export type ListTool = (typeof LIST_TOOLS)[number]

/**
 * The halo-mcp tools that answer with one row. Shared for the same
 * reason as `LIST_TOOLS`: main derives `kind: 'single'` from this set and
 * the renderer's record card reads a different shape per name.
 */
export const SINGLE_TOOLS = ['get_record', 'get_entity'] as const

export type SingleTool = (typeof SINGLE_TOOLS)[number]

/**
 * `tool` is `null` only when the turn made no successful tool call at
 * all. A tool outside the phase-1 set produces `kind: 'none'` with the
 * tool still named, so a card that gains support later has the payload
 * waiting for it.
 *
 * `result` never carries a presigned `url` / `uploadUrl` — thunder-context
 * strips them at every depth. Cards re-fetch images by id (TD-058).
 */
export interface ChatAction {
  kind: ChatActionKind
  tool: string | null
  args: Record<string, unknown>
  title: string
  result: unknown
  /** TD-059: the model's own bars, present only on `kind: 'chart'`. */
  metricLabel?: string
  bars?: ChartBar[]
}

/** One row of a TD-059 chart, as the model named and measured it. */
export interface ChartBar {
  name: string
  value: number
}

/**
 * Why a turn failed, as a field the renderer can branch on rather than
 * a message it has to string-match.
 *
 * `bedrock_access_denied` is deliberately separate from `unauthorized`:
 * the fix is granting model access in the AWS console for that region,
 * not signing in again, and a retry will never clear it.
 *
 * Every kind but `interrupted` is a thunder-context wire code, verbatim.
 * `interrupted` never travels over HTTP: the renderer has always
 * synthesised it for a turn whose request died with the old renderer,
 * and TD-065 lets main say the same thing when a poll 404s because the
 * server swept the turn.
 */
export type ChatErrorKind =
  | 'unauthorized'
  | 'unreachable'
  | 'bedrock_access_denied'
  | 'rate_limited'
  | 'refusal'
  | 'loop_limit'
  | 'cancelled'
  | 'interrupted'
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

/**
 * The cap main enforces on a question and on each replayed history
 * turn. Shared so the renderer can build history that fits rather than
 * having the whole request rejected — TD-056 appends the most recent
 * tool result to its turn and needs to know the room it has.
 */
export const MAX_TURN_TEXT_LENGTH = 4_000

/**
 * One prior turn, replayed as plain text — no tool blocks are kept.
 *
 * The newest answered turn carries its tool result appended to `text`,
 * because the prose alone doesn't let the model answer a follow-up like
 * "show me the first one" without re-running the tool and describing a
 * different result set.
 */
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
