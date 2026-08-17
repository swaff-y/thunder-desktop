/**
 * TD-059: `show_chart` — the one tool the loop executes itself.
 *
 * The chart is not derivable from the tool name: `get_top_entities`
 * backs both "show me the most popular actors" (a list) and "chart the
 * clicks by movie" (a chart). Guessing from the question text misfires
 * on anything phrased unusually, so the model states its intent instead
 * by calling this after it has the numbers.
 *
 * It fetches nothing. Its whole job is to carry the render instruction
 * back to `deriveAction`, which discards it unless a halo-mcp tool
 * supplied the data — the model must not be able to chart numbers it
 * invented.
 */

import type { ChartBar } from '../../../shared/chat'
import { isPlainObject } from '../../lib/json'
import type { AnthropicToolDefinition } from '../../mcp/tool-schema'

export const SHOW_CHART_TOOL_NAME = 'show_chart'

/** Six rows is the design; twelve is where the card stops being readable. */
export const MAX_CHART_BARS = 12

/** What the model reads back. There is nothing else to tell it. */
export const SHOW_CHART_ACK = 'Chart shown to the user.'

export const NO_DATA_MESSAGE =
  'Call a catalogue tool and chart the numbers it returns — show_chart cannot be used on numbers you worked out yourself.'

export const INVALID_INPUT_MESSAGE = `show_chart needs a title, a metric_label, and 1 to ${MAX_CHART_BARS} bars, each with a name and a numeric value.`

export const SHOW_CHART_TOOL: AnthropicToolDefinition = {
  name: SHOW_CHART_TOOL_NAME,
  description: [
    'Draw the ranked data you just fetched as a horizontal bar chart.',
    'Call this after a catalogue tool has returned the numbers, when the user asked to chart, graph, plot, compare or visualise them.',
    'Do not call it otherwise — an ordinary ranking is already shown as a list.',
    'Do not call it for numbers you worked out yourself; chart only what a catalogue tool returned.'
  ].join(' '),
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Heading for the chart, e.g. "Top movies by clicks".' },
      metric_label: {
        type: 'string',
        description: 'What the values measure, e.g. "Clicks" or "Views".'
      },
      bars: {
        type: 'array',
        minItems: 1,
        maxItems: MAX_CHART_BARS,
        description: 'The rows to draw, already in the order they should appear.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Row label — the entity or record name.' },
            value: { type: 'number', description: 'The metric for this row.' }
          },
          required: ['name', 'value']
        }
      }
    },
    required: ['title', 'metric_label', 'bars']
  }
}

export interface ChartRequest {
  title: string
  metricLabel: string
  bars: ChartBar[]
}

function nonEmptyText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Re-checks what `input_schema` already asks for. The schema is a
 * request, not a guarantee — an over-long or half-filled `bars` array
 * arrives as an ordinary tool call, and a chart drawn from it would be
 * wrong rather than merely ugly.
 */
export function parseChartRequest(input: unknown): ChartRequest | null {
  if (!isPlainObject(input)) return null

  const title = nonEmptyText(input.title)
  const metricLabel = nonEmptyText(input.metric_label)
  if (title === null || metricLabel === null) return null

  const { bars } = input
  if (!Array.isArray(bars) || bars.length === 0 || bars.length > MAX_CHART_BARS) return null

  const parsed: ChartBar[] = []
  for (const bar of bars) {
    if (!isPlainObject(bar)) return null
    const name = nonEmptyText(bar.name)
    if (name === null || typeof bar.value !== 'number' || !Number.isFinite(bar.value)) return null
    parsed.push({ name, value: bar.value })
  }

  return { title, metricLabel, bars: parsed }
}
