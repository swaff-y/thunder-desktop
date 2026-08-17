/**
 * TD-054: pins the two rules the card layer depends on — the last
 * successful call is the one that gets rendered, and no presigned URL
 * survives into the payload TD-055 persists to `sessionStorage`.
 */

import { describe, expect, it } from 'vitest'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import {
  NO_ACTION,
  actionKindFor,
  deriveAction,
  stripPresignedUrls,
  toolResultPayload,
  type ToolCallRecord
} from '../action'

function structured(payload: unknown): CallToolResult {
  return { content: [], structuredContent: payload as Record<string, unknown> }
}

function textResult(text: string): CallToolResult {
  return { content: [{ type: 'text', text }] }
}

function call(
  tool: string,
  result: CallToolResult,
  args: Record<string, unknown> = {}
): ToolCallRecord {
  return { tool, args, result }
}

describe('actionKindFor', () => {
  it.each(['search_records', 'list_entities', 'get_related_records', 'get_top_entities'])(
    'maps %s to a list',
    (tool) => {
      expect(actionKindFor(tool)).toBe('list')
    }
  )

  it.each(['get_record', 'get_entity'])('maps %s to a single record', (tool) => {
    expect(actionKindFor(tool)).toBe('single')
  })

  it('maps anything else to none', () => {
    expect(actionKindFor('describe_catalogue')).toBe('none')
  })
})

describe('stripPresignedUrls', () => {
  it('removes url and uploadUrl at the top level', () => {
    expect(
      stripPresignedUrls({ id: 'r1', url: 'https://s3/x', uploadUrl: 'https://s3/y' })
    ).toEqual({ id: 'r1' })
  })

  it('removes them inside a record image slot, several levels down', () => {
    const record = {
      id: 'r1',
      images: {
        poster: { key: 'p.jpg', url: 'https://s3/p', uploadUrl: 'https://s3/pu' },
        thumb: { key: 't.jpg', url: 'https://s3/t' },
        banner: { key: 'b.jpg', url: 'https://s3/b' },
        still: { key: 's.jpg', url: 'https://s3/s' }
      }
    }

    expect(stripPresignedUrls(record)).toEqual({
      id: 'r1',
      images: {
        poster: { key: 'p.jpg' },
        thumb: { key: 't.jpg' },
        banner: { key: 'b.jpg' },
        still: { key: 's.jpg' }
      }
    })
  })

  it('walks arrays, including arrays nested in arrays', () => {
    const value = {
      records: [[{ id: 'a', url: 'https://s3/a' }], [{ id: 'b', url: 'https://s3/b' }]]
    }
    expect(stripPresignedUrls(value)).toEqual({ records: [[{ id: 'a' }], [{ id: 'b' }]] })
  })

  it('leaves the source object untouched', () => {
    const source = { id: 'r1', url: 'https://s3/x' }
    stripPresignedUrls(source)
    expect(source.url).toBe('https://s3/x')
  })

  it('passes primitives and null through', () => {
    expect(stripPresignedUrls(null)).toBeNull()
    expect(stripPresignedUrls('url')).toBe('url')
    expect(stripPresignedUrls(7)).toBe(7)
  })
})

describe('toolResultPayload', () => {
  it('prefers structuredContent', () => {
    expect(toolResultPayload(structured({ total: 3 }))).toEqual({ total: 3 })
  })

  it('parses JSON text blocks', () => {
    expect(toolResultPayload(textResult('{"total":3}'))).toEqual({ total: 3 })
  })

  it('falls back to the raw text when it is not JSON', () => {
    expect(toolResultPayload(textResult('no matches'))).toBe('no matches')
  })

  it('returns null for an empty result', () => {
    expect(toolResultPayload({ content: [] })).toBeNull()
  })
})

describe('deriveAction', () => {
  it('returns the empty action when nothing ran', () => {
    expect(deriveAction([])).toEqual(NO_ACTION)
  })

  it('lets the last successful call win over an earlier one', () => {
    const action = deriveAction([
      call('search_records', structured({ records: [{ id: 'r1' }] }), { query: 'mar' }),
      call('get_record', structured({ id: 'r1' }), { id: 'r1' })
    ])

    expect(action).toEqual({
      kind: 'single',
      tool: 'get_record',
      args: { id: 'r1' },
      title: 'Get record',
      result: { id: 'r1' }
    })
  })

  it('strips presigned URLs out of the rendered result', () => {
    const action = deriveAction([
      call(
        'get_record',
        structured({ id: 'r1', url: 'https://s3/x', poster: { url: 'https://s3/p' } })
      )
    ])

    expect(action.result).toEqual({ id: 'r1', poster: {} })
  })

  it('still names a tool outside the phase-1 set, with kind none', () => {
    const action = deriveAction([call('describe_catalogue', textResult('ok'))])
    expect(action).toMatchObject({ kind: 'none', tool: 'describe_catalogue' })
  })

  it('lets a chart win over the list the source tool would have derived', () => {
    const action = deriveAction(
      [
        call('get_top_entities', structured({ items: [{ entity_id: 'a1', count: 40 }] }), {
          entity_type: 'movie'
        })
      ],
      {
        title: 'Top movies by clicks',
        metricLabel: 'Clicks',
        bars: [{ name: 'Alpha', value: 40 }]
      }
    )

    expect(action).toEqual({
      kind: 'chart',
      tool: 'get_top_entities',
      args: { entity_type: 'movie' },
      title: 'Top movies by clicks',
      metricLabel: 'Clicks',
      bars: [{ name: 'Alpha', value: 40 }],
      result: { items: [{ entity_id: 'a1', count: 40 }] }
    })
  })

  it('discards a chart that no tool call backs', () => {
    expect(
      deriveAction([], {
        title: 'Invented',
        metricLabel: 'Clicks',
        bars: [{ name: 'Alpha', value: 40 }]
      })
    ).toEqual(NO_ACTION)
  })
})
