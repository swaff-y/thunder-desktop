/**
 * TD-059: the schema is a request, not a guarantee — these pin what
 * `parseChartRequest` refuses, because everything it lets through is
 * drawn as fact.
 */

import { describe, expect, it } from 'vitest'
import {
  MAX_CHART_BARS,
  SHOW_CHART_TOOL,
  SHOW_CHART_TOOL_NAME,
  parseChartRequest
} from '../show-chart'

function bars(count: number): { name: string; value: number }[] {
  return Array.from({ length: count }, (_unused, index) => ({
    name: `Row ${index}`,
    value: index
  }))
}

describe('SHOW_CHART_TOOL', () => {
  it('caps the schema at twelve bars and says when to call it', () => {
    expect(SHOW_CHART_TOOL.name).toBe(SHOW_CHART_TOOL_NAME)
    expect(SHOW_CHART_TOOL.description).toMatch(/chart, graph, plot, compare or visualise/)
    expect(SHOW_CHART_TOOL.input_schema).toMatchObject({
      required: ['title', 'metric_label', 'bars'],
      properties: { bars: { maxItems: MAX_CHART_BARS, minItems: 1 } }
    })
  })
})

describe('parseChartRequest', () => {
  it('renames the snake_case input to the action shape', () => {
    expect(
      parseChartRequest({
        title: 'Top movies by clicks',
        metric_label: 'Clicks',
        bars: [{ name: 'Alpha', value: 40 }]
      })
    ).toEqual({
      title: 'Top movies by clicks',
      metricLabel: 'Clicks',
      bars: [{ name: 'Alpha', value: 40 }]
    })
  })

  it('accepts exactly the maximum number of bars', () => {
    const request = parseChartRequest({
      title: 'Twelve',
      metric_label: 'Views',
      bars: bars(MAX_CHART_BARS)
    })
    expect(request?.bars).toHaveLength(MAX_CHART_BARS)
  })

  it('rejects more than the maximum number of bars', () => {
    expect(
      parseChartRequest({
        title: 'Too many',
        metric_label: 'Views',
        bars: bars(MAX_CHART_BARS + 1)
      })
    ).toBeNull()
  })

  it('rejects an empty chart', () => {
    expect(parseChartRequest({ title: 'Nothing', metric_label: 'Views', bars: [] })).toBeNull()
  })

  it.each([
    ['a numeric string value', [{ name: 'Alpha', value: '40' }]],
    ['a missing value', [{ name: 'Alpha' }]],
    ['a non-finite value', [{ name: 'Alpha', value: Number.NaN }]],
    ['a blank name', [{ name: '   ', value: 40 }]],
    ['a bar that is not an object', ['Alpha']]
  ])('rejects %s', (_label, rows) => {
    expect(parseChartRequest({ title: 'Bad', metric_label: 'Views', bars: rows })).toBeNull()
  })

  it.each([
    ['no title', { metric_label: 'Views', bars: [{ name: 'Alpha', value: 1 }] }],
    ['no metric label', { title: 'Bad', bars: [{ name: 'Alpha', value: 1 }] }],
    ['no bars array', { title: 'Bad', metric_label: 'Views', bars: 'Alpha' }]
  ])('rejects input with %s', (_label, input) => {
    expect(parseChartRequest(input)).toBeNull()
  })

  it('rejects anything that is not an object', () => {
    expect(parseChartRequest(null)).toBeNull()
    expect(parseChartRequest('chart it')).toBeNull()
  })

  it('keeps a zero value rather than treating it as missing', () => {
    const request = parseChartRequest({
      title: 'Quiet catalogue',
      metric_label: 'Clicks',
      bars: [{ name: 'Alpha', value: 0 }]
    })
    expect(request?.bars).toEqual([{ name: 'Alpha', value: 0 }])
  })
})
