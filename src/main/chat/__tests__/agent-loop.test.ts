/**
 * TD-054: drives the loop against a scripted model and a stubbed MCP
 * surface, so every branch of the turn — parallel tool calls, a tool
 * that failed, a refusal, the iteration cap, a cancel — is exercised
 * without Bedrock or a running halo-mcp.
 */

import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js'
import type { ContentBlock, MessageParam } from '@anthropic-ai/sdk/resources/messages/index'
import { McpFailureError } from '../../mcp/errors'
import {
  MAX_TOOL_ITERATIONS,
  createAgentLoop,
  type AgentLoop,
  type ModelRequest,
  type ModelTurn
} from '../agent-loop'

const TOOLS = [
  { name: 'list_entities', inputSchema: { type: 'object' } },
  { name: 'get_record', inputSchema: { type: 'object' } }
] as unknown as Tool[]

/**
 * The loop treats `content` as an opaque block it echoes back, so the
 * fixtures build only the fields it reads and hand them over as
 * `ContentBlock` rather than filling in the SDK's every field.
 */
function blocks(values: Record<string, unknown>[]): ContentBlock[] {
  return values as unknown as ContentBlock[]
}

function textTurn(text: string): ModelTurn {
  return { stopReason: 'end_turn', content: blocks([{ type: 'text', text }]), text, toolUses: [] }
}

interface ScriptedToolUse {
  id: string
  name: string
  input?: Record<string, unknown>
}

function toolTurn(...uses: ScriptedToolUse[]): ModelTurn {
  const toolUses = uses.map((use) => ({ id: use.id, name: use.name, input: use.input ?? {} }))
  return {
    stopReason: 'tool_use',
    content: blocks(toolUses.map((use) => ({ type: 'tool_use', ...use }))),
    text: '',
    toolUses
  }
}

function structured(payload: Record<string, unknown>): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(payload) }], structuredContent: payload }
}

let turns: ModelTurn[]
let requests: ModelRequest[]
let send: Mock<(request: ModelRequest, signal?: AbortSignal) => Promise<ModelTurn>>
let listTools: Mock<() => Promise<Tool[]>>
let callTool: Mock<(name: string, args: Record<string, unknown>) => Promise<CallToolResult>>
let statuses: string[]

function build(): AgentLoop {
  return createAgentLoop({
    model: { send },
    tools: { listTools, callTool },
    onStatus: (status): void => {
      statuses.push(status.state === 'calling-tool' ? `calling-tool:${status.tool}` : status.state)
    }
  })
}

/** The `tool_result` blocks the loop sent back, per user message. */
function toolResultMessages(request: ModelRequest): MessageParam[] {
  return request.messages.filter(
    (message) => message.role === 'user' && Array.isArray(message.content)
  ) as MessageParam[]
}

beforeEach(() => {
  turns = []
  requests = []
  statuses = []
  send = vi.fn(async (request: ModelRequest) => {
    requests.push({ ...request, messages: structuredClone([...request.messages]) })
    const next = turns.shift()
    if (next === undefined)
      throw new Error('the model was called more times than the test scripted')
    return next
  })
  listTools = vi.fn(async () => TOOLS)
  callTool = vi.fn(async () => structured({ ok: true }))
})

describe('createAgentLoop', () => {
  it('returns text and no action for a turn that calls no tool', async () => {
    turns = [textTurn('I can answer questions about your catalogue.')]

    const result = await build().ask({ question: 'what can you do?' })

    expect(result).toEqual({
      ok: true,
      text: 'I can answer questions about your catalogue.',
      action: { kind: 'none', tool: null, args: {}, title: '', result: null },
      truncated: false
    })
    expect(callTool).not.toHaveBeenCalled()
  })

  it('passes the halo-mcp tool list to the model', async () => {
    turns = [textTurn('ok')]
    await build().ask({ question: 'hi' })

    expect(requests[0].tools.map((tool) => tool.name)).toEqual(['list_entities', 'get_record'])
    expect(requests[0].system).toContain('Halo video catalogue')
  })

  it('replays history ahead of the question', async () => {
    turns = [textTurn('ok')]
    await build().ask({
      question: 'and the second?',
      history: [
        { role: 'user', text: 'first record?' },
        { role: 'assistant', text: 'Alpha.' }
      ]
    })

    expect(requests[0].messages).toEqual([
      { role: 'user', content: 'first record?' },
      { role: 'assistant', content: 'Alpha.' },
      { role: 'user', content: 'and the second?' }
    ])
  })

  it('executes a one-tool turn and returns the follow-up answer', async () => {
    callTool.mockResolvedValueOnce(structured({ entities: [{ id: 'a1', name: 'Marla' }] }))
    turns = [
      toolTurn({ id: 'tu_1', name: 'list_entities', input: { type: 'actor', startsWith: 'mar' } }),
      textTurn('One actor starts with "mar".')
    ]

    const result = await build().ask({ question: "list actors starting with 'mar'" })

    expect(callTool).toHaveBeenCalledWith(
      'list_entities',
      { type: 'actor', startsWith: 'mar' },
      undefined
    )
    expect(result).toMatchObject({
      ok: true,
      text: 'One actor starts with "mar".',
      action: {
        kind: 'list',
        tool: 'list_entities',
        result: { entities: [{ id: 'a1', name: 'Marla' }] }
      }
    })
  })

  it('returns both results of a two-block turn in a single user message', async () => {
    turns = [
      toolTurn({ id: 'tu_1', name: 'list_entities' }, { id: 'tu_2', name: 'get_record' }),
      textTurn('done')
    ]

    await build().ask({ question: 'both' })

    const results = toolResultMessages(requests[1])
    expect(results).toHaveLength(1)
    expect(results[0].content).toEqual([
      { type: 'tool_result', tool_use_id: 'tu_1', content: '{"ok":true}' },
      { type: 'tool_result', tool_use_id: 'tu_2', content: '{"ok":true}' }
    ])
  })

  it('performs a find-then-read sequence and reports the final get_record', async () => {
    callTool
      .mockResolvedValueOnce(structured({ records: [{ id: 'r1' }] }))
      .mockResolvedValueOnce(structured({ id: 'r1', title: 'Alpha' }))
    turns = [
      toolTurn({ id: 'tu_1', name: 'search_records', input: { query: 'Marla' } }),
      toolTurn({ id: 'tu_2', name: 'get_record', input: { id: 'r1' } }),
      textTurn('The first record is Alpha.')
    ]

    const result = await build().ask({ question: 'Show me the first record for Marla' })

    expect(callTool).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({
      ok: true,
      action: { kind: 'single', tool: 'get_record', result: { id: 'r1', title: 'Alpha' } }
    })
  })

  it('hands a failed tool back as is_error and keeps going', async () => {
    callTool.mockResolvedValueOnce({
      isError: true,
      content: [{ type: 'text', text: 'limit must be between 1 and 100' }]
    } as CallToolResult)
    turns = [
      toolTurn({ id: 'tu_1', name: 'list_entities' }),
      textTurn('That limit is out of range.')
    ]

    const result = await build().ask({ question: 'list 5000 actors' })

    expect(toolResultMessages(requests[1])[0].content).toEqual([
      {
        type: 'tool_result',
        tool_use_id: 'tu_1',
        content: 'limit must be between 1 and 100',
        is_error: true
      }
    ])
    // A tool that errored is not a result worth rendering.
    expect(result).toMatchObject({ ok: true, action: { kind: 'none', tool: null } })
  })

  it('returns unauthorized when the Halo token has expired', async () => {
    callTool.mockRejectedValueOnce(
      new McpFailureError({ kind: 'unauthorized', message: 'The session has expired.' })
    )
    turns = [toolTurn({ id: 'tu_1', name: 'list_entities' })]

    await expect(build().ask({ question: 'list actors' })).resolves.toEqual({
      ok: false,
      error: 'unauthorized',
      message: 'The session has expired.'
    })
  })

  it('returns bedrock_access_denied when the region lacks model access', async () => {
    send.mockRejectedValueOnce(
      Object.assign(new Error('AccessDeniedException: model access not granted'), { status: 403 })
    )

    await expect(build().ask({ question: 'hi' })).resolves.toMatchObject({
      ok: false,
      error: 'bedrock_access_denied'
    })
  })

  it('reports a refusal without reading the content blocks', async () => {
    turns = [{ stopReason: 'refusal', content: [], text: '', toolUses: [] }]

    await expect(build().ask({ question: 'something disallowed' })).resolves.toMatchObject({
      ok: false,
      error: 'refusal'
    })
  })

  it('flags a truncated answer rather than failing it', async () => {
    turns = [{ ...textTurn('As far as I got'), stopReason: 'max_tokens' }]

    await expect(build().ask({ question: 'everything' })).resolves.toMatchObject({
      ok: true,
      truncated: true
    })
  })

  it('gives up with loop_limit rather than spinning', async () => {
    turns = Array.from({ length: MAX_TOOL_ITERATIONS }, (_unused, index) =>
      toolTurn({ id: `tu_${index}`, name: 'list_entities' })
    )

    await expect(build().ask({ question: 'go forever' })).resolves.toMatchObject({
      ok: false,
      error: 'loop_limit'
    })
    expect(send).toHaveBeenCalledTimes(MAX_TOOL_ITERATIONS)
  })

  it('returns cancelled for a signal that is already aborted, before any call', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      build().ask({ question: 'never mind', signal: controller.signal })
    ).resolves.toMatchObject({ ok: false, error: 'cancelled' })
    expect(listTools).not.toHaveBeenCalled()
    expect(statuses).toEqual([])
  })

  it('returns cancelled when the stream is aborted mid-turn, and pushes no further status', async () => {
    const controller = new AbortController()
    send.mockImplementationOnce(async () => {
      controller.abort()
      throw Object.assign(new Error('Request was aborted.'), { name: 'APIUserAbortError' })
    })

    const result = await build().ask({ question: 'long question', signal: controller.signal })

    expect(result).toMatchObject({ ok: false, error: 'cancelled' })
    expect(statuses).toEqual(['thinking', 'thinking'])
  })

  it('hands the signal to the tool call so an in-flight request stops too', async () => {
    const controller = new AbortController()
    turns = [toolTurn({ id: 'tu_1', name: 'list_entities' }), textTurn('done')]

    await build().ask({ question: 'list actors', signal: controller.signal })

    expect(callTool).toHaveBeenCalledWith('list_entities', {}, controller.signal)
  })

  it('pushes thinking, the tool name, then idle', async () => {
    turns = [toolTurn({ id: 'tu_1', name: 'list_entities' }), textTurn('done')]

    await build().ask({ question: 'list actors' })

    expect(statuses).toEqual([
      'thinking',
      'thinking',
      'calling-tool:list_entities',
      'thinking',
      'idle'
    ])
  })
})
