/**
 * TD-054: turns the turn's tool calls into the single action the
 * renderer draws beside the answer.
 *
 * Two rules do most of the work. The last successful call wins — a
 * "find then read" turn should show the record it ended on, not the
 * search that got it there. And every presigned `url` / `uploadUrl` is
 * stripped: they are regenerated per read, expire shortly after, and
 * dominate the payload TD-055 persists to `sessionStorage`. Cards
 * re-fetch their images by id (TD-058).
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { LIST_TOOLS } from '../../shared/chat'
import type { ChatAction, ChatActionKind } from '../../shared/chat'
import { isPlainObject } from '../lib/json'
import { contentText } from '../mcp/errors'

/** One tool call that ran and did not report an error. */
export interface ToolCallRecord {
  tool: string
  args: Record<string, unknown>
  result: CallToolResult
}

const LIST_TOOL_NAMES: ReadonlySet<string> = new Set(LIST_TOOLS)

const SINGLE_TOOLS: ReadonlySet<string> = new Set(['get_record', 'get_entity'])

/**
 * Presigned fields, by name. A key match rather than a value match:
 * halo-mcp names these consistently, and sniffing values for anything
 * that looks like a signed URL would strip legitimate catalogue data
 * that merely happens to contain a link.
 */
const PRESIGNED_KEYS: ReadonlySet<string> = new Set(['url', 'uploadUrl'])

export const NO_ACTION: ChatAction = {
  kind: 'none',
  tool: null,
  args: {},
  title: '',
  result: null
}

export function actionKindFor(tool: string): ChatActionKind {
  if (LIST_TOOL_NAMES.has(tool)) return 'list'
  if (SINGLE_TOOLS.has(tool)) return 'single'
  return 'none'
}

/**
 * Rebuilds the value without the presigned keys rather than deleting in
 * place — `HaloMcpClient` hands its result back verbatim and TD-055
 * reads the same object, so mutating it would strip URLs out from under
 * a caller that never asked.
 */
export function stripPresignedUrls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripPresignedUrls)
  if (!isPlainObject(value)) return value

  const kept: Record<string, unknown> = {}
  for (const [key, nested] of Object.entries(value)) {
    if (PRESIGNED_KEYS.has(key)) continue
    kept[key] = stripPresignedUrls(nested)
  }
  return kept
}

/**
 * Prefers `structuredContent` when halo-mcp sends it, else parses the
 * text blocks as JSON. Falls back to the raw text — a tool that answers
 * in prose is still worth showing, and a parse failure should not cost
 * the card its payload.
 */
export function toolResultPayload(result: CallToolResult): unknown {
  if (result.structuredContent !== undefined) return result.structuredContent

  const text = contentText(result.content)
  if (text.length === 0) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

/**
 * Humanised tool name, and nothing more. A richer title would have to
 * know which argument matters per tool, which is exactly the domain
 * knowledge that belongs in halo-mcp's descriptions — the card has
 * `args` and can label itself.
 */
function titleFor(tool: string): string {
  const words = tool.replace(/_/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export function deriveAction(calls: readonly ToolCallRecord[]): ChatAction {
  const last = calls.at(-1)
  if (last === undefined) return NO_ACTION

  return {
    kind: actionKindFor(last.tool),
    tool: last.tool,
    args: last.args,
    title: titleFor(last.tool),
    result: stripPresignedUrls(toolResultPayload(last.result))
  }
}
