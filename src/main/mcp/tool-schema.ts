/**
 * TD-053: renames MCP tool definitions into the shape Bedrock's
 * Anthropic API expects. `inputSchema` → `input_schema` and nothing
 * else — both sides speak JSON Schema, so transforming the body would
 * only introduce drift. TD-054 passes the output straight to the model.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js'

export interface AnthropicToolDefinition {
  name: string
  description?: string
  input_schema: Record<string, unknown>
}

function isObjectSchema(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Drops any tool without a usable `inputSchema` rather than forwarding
 * it: one malformed definition 400s the whole Bedrock turn, so losing a
 * single tool is strictly better than losing the conversation.
 */
export function toAnthropicTools(mcpTools: readonly Tool[]): AnthropicToolDefinition[] {
  return mcpTools.flatMap((tool) => {
    if (!isObjectSchema(tool.inputSchema)) {
      console.warn(
        `[tool-schema] dropping "${tool.name}" — inputSchema is missing or not an object`
      )
      return []
    }
    return [
      {
        name: tool.name,
        ...(tool.description !== undefined && { description: tool.description }),
        input_schema: tool.inputSchema
      }
    ]
  })
}
