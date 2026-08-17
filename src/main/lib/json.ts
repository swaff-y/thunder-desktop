/**
 * Guards for values that arrived as JSON — an MCP tool schema, a
 * model's `tool_use.input`, a tool result payload. All of them are
 * `unknown` at the boundary and all of them need the same "is this a
 * plain object, and not an array" question answered before they can be
 * indexed.
 */

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
