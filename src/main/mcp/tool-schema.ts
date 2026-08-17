/**
 * TD-053: renames MCP tool definitions into the shape Bedrock's
 * Anthropic API expects. `inputSchema` → `input_schema` and nothing
 * else — both sides speak JSON Schema, so transforming the body would
 * only introduce drift. TD-054 passes the output straight to the model.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js'
import { isPlainObject } from '../lib/json'

export interface AnthropicToolDefinition {
  name: string
  description?: string
  input_schema: Record<string, unknown>
}

/**
 * TD-061: the Messages API rejects these at the root of an
 * `input_schema`, and it rejects the whole request — one tool's schema
 * 400s every turn, whichever tool the model actually wanted.
 *
 * halo-mcp uses them to tie fields together: `record_interaction` pairs
 * `entity_type` with `interaction`, `update_record` demands at least one
 * updatable field. Both pairings are already spelled out in the property
 * descriptions, and an invalid combination comes back as an ordinary
 * tool error the model can retry — so stripping the constraint costs
 * less than dropping the tool.
 *
 * Nested occurrences are legal and left alone.
 */
const TOP_LEVEL_UNIONS = ['oneOf', 'allOf', 'anyOf'] as const

function stripTopLevelUnions(
  schema: Record<string, unknown>,
  name: string
): Record<string, unknown> {
  const present = TOP_LEVEL_UNIONS.filter((keyword) => keyword in schema)
  if (present.length === 0) return schema

  console.warn(`[tool-schema] stripping top-level ${present.join(', ')} from "${name}"`)
  return Object.fromEntries(
    Object.entries(schema).filter(([key]) => !present.includes(key as (typeof present)[number]))
  )
}

/**
 * Drops any tool without a usable `inputSchema` rather than forwarding
 * it: one malformed definition 400s the whole Bedrock turn, so losing a
 * single tool is strictly better than losing the conversation.
 */
export function toAnthropicTools(mcpTools: readonly Tool[]): AnthropicToolDefinition[] {
  return mcpTools.flatMap((tool) => {
    if (!isPlainObject(tool.inputSchema)) {
      console.warn(
        `[tool-schema] dropping "${tool.name}" — inputSchema is missing or not an object`
      )
      return []
    }
    return [
      {
        name: tool.name,
        ...(tool.description !== undefined && { description: tool.description }),
        input_schema: stripTopLevelUnions(tool.inputSchema, tool.name)
      }
    ]
  })
}
