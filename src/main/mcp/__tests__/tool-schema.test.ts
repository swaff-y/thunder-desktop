/**
 * TD-053: the MCP → Anthropic tool rename is a 1:1 field map, so the
 * assertions here are mostly about what must NOT change — a schema body
 * the model was trained to read, passed through untouched.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Tool } from '@modelcontextprotocol/sdk/types.js'
import { toAnthropicTools } from '../tool-schema'

// halo-mcp's real `search_records` shape, trimmed to the fields that
// matter here.
const SEARCH_RECORDS = {
  name: 'search_records',
  description: 'Search the Halo catalogue by prefix.',
  inputSchema: {
    type: 'object',
    properties: {
      filter: { type: 'string', description: 'Prefix to match.' },
      limit: { type: 'number' },
      sort: { type: 'string', enum: ['relevance', 'recent', 'popular'] }
    },
    required: ['filter']
  }
} as unknown as Tool

afterEach(() => {
  vi.restoreAllMocks()
})

describe('toAnthropicTools (TD-053)', () => {
  it('renames inputSchema to input_schema and keeps name and description', () => {
    expect(toAnthropicTools([SEARCH_RECORDS])).toEqual([
      {
        name: 'search_records',
        description: 'Search the Halo catalogue by prefix.',
        input_schema: SEARCH_RECORDS.inputSchema
      }
    ])
  })

  it('passes enum and required through untouched', () => {
    const [mapped] = toAnthropicTools([SEARCH_RECORDS])
    expect(mapped.input_schema).toEqual(SEARCH_RECORDS.inputSchema)
    expect(mapped.input_schema).toMatchObject({
      properties: { sort: { enum: ['relevance', 'recent', 'popular'] } },
      required: ['filter']
    })
  })

  it('omits description entirely when the tool has none', () => {
    const [mapped] = toAnthropicTools([
      { name: 'get_stats_summary', inputSchema: { type: 'object' } } as unknown as Tool
    ])
    expect(mapped).toEqual({ name: 'get_stats_summary', input_schema: { type: 'object' } })
    expect('description' in mapped).toBe(false)
  })

  // ─── Malformed definitions ────────────────────────────────────────

  it.each([
    ['a missing inputSchema', undefined],
    ['a null inputSchema', null],
    ['an array inputSchema', []],
    ['a string inputSchema', 'object']
  ])('drops a tool with %s and logs it', (_label, inputSchema) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const tools = [{ name: 'broken', inputSchema }, SEARCH_RECORDS] as unknown as Tool[]

    expect(toAnthropicTools(tools).map((tool) => tool.name)).toEqual(['search_records'])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('broken'))
  })

  it('returns an empty list for an empty tool list', () => {
    expect(toAnthropicTools([])).toEqual([])
  })
})
