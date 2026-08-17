/**
 * TD-054: the tool-use loop.
 *
 * Anthropic's server-side MCP connector is not available on Bedrock, so
 * we are the MCP client: list halo-mcp's tools, pass them as ordinary
 * `tools`, and execute the `tool_use` blocks ourselves.
 *
 * Electron-free and Bedrock-free by design. The model arrives as a
 * {@link ChatModel} port and the tools as {@link ChatToolSurface}, so
 * the tests drive the whole loop without an AWS client or a running
 * halo-mcp — the same shape TD-053 used for its MCP session.
 */

import type {
  ContentBlock,
  MessageParam,
  StopReason,
  ToolResultBlockParam
} from '@anthropic-ai/sdk/resources/messages/index'
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js'
import type { ChatAskResult, ChatHistoryTurn, ChatStatus } from '../../shared/chat'
import { contentText, toolResultFailure } from '../mcp/errors'
import { toAnthropicTools, type AnthropicToolDefinition } from '../mcp/tool-schema'
import { deriveAction, type ToolCallRecord } from './action'
import { classifyChatError } from './chat-errors'
import { CHAT_SYSTEM_PROMPT } from './system-prompt'
import {
  INVALID_INPUT_MESSAGE,
  NO_DATA_MESSAGE,
  SHOW_CHART_ACK,
  SHOW_CHART_TOOL,
  SHOW_CHART_TOOL_NAME,
  parseChartRequest,
  type ChartRequest
} from './tools/show-chart'

/**
 * Bounds a turn that keeps asking for tools. halo-mcp's deepest phase-1
 * path is find → read, so anything past a handful of rounds is the
 * model looping rather than making progress.
 */
export const MAX_TOOL_ITERATIONS = 8

export interface ModelRequest {
  system: string
  tools: readonly AnthropicToolDefinition[]
  messages: readonly MessageParam[]
}

export interface ModelToolUse {
  id: string
  name: string
  input: Record<string, unknown>
}

export interface ModelTurn {
  stopReason: StopReason | null
  /**
   * The assistant content verbatim. Echoed back unchanged as the next
   * assistant turn — thinking blocks included, which the API rejects if
   * they are rebuilt rather than replayed.
   */
  content: ContentBlock[]
  text: string
  toolUses: ModelToolUse[]
}

export interface ChatModel {
  send(request: ModelRequest, signal?: AbortSignal): Promise<ModelTurn>
}

/** The slice of {@link HaloMcpClient} the loop needs. */
export interface ChatToolSurface {
  listTools(): Promise<Tool[]>
  callTool(
    name: string,
    args: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<CallToolResult>
}

export interface AgentLoopOptions {
  model: ChatModel
  tools: ChatToolSurface
  onStatus?: (status: ChatStatus) => void
}

export interface AskOptions {
  question: string
  history?: readonly ChatHistoryTurn[]
  signal?: AbortSignal
}

export interface AgentLoop {
  ask(options: AskOptions): Promise<ChatAskResult>
}

const REFUSAL_MESSAGE = 'The model declined to answer that question.'
const LOOP_LIMIT_MESSAGE = `The model kept calling tools without reaching an answer (${MAX_TOOL_ITERATIONS} rounds).`
const CANCELLED_MESSAGE = 'The request was cancelled.'

function cancelled(): ChatAskResult {
  return { ok: false, error: 'cancelled', message: CANCELLED_MESSAGE }
}

/** Flattens a tool result to the string the model reads back. */
function toolResultText(result: CallToolResult): string {
  const text = contentText(result.content)
  if (text.length > 0) return text
  if (result.structuredContent !== undefined) return JSON.stringify(result.structuredContent)
  return 'The tool returned no content.'
}

function errorBlock(toolUseId: string, message: string): ToolResultBlockParam {
  return { type: 'tool_result', tool_use_id: toolUseId, content: message, is_error: true }
}

export function createAgentLoop({ model, tools, onStatus }: AgentLoopOptions): AgentLoop {
  async function ask({ question, history = [], signal }: AskOptions): Promise<ChatAskResult> {
    // A function, not an inline `signal?.aborted` check: the flag is a
    // readonly property, so TypeScript narrows it to `false` after the
    // first test and every later one would be compiled away.
    const isCancelled = (): boolean => signal?.aborted === true

    // Once the user cancels, the turn is dead and its spinner updates
    // are noise — the `ask` result is what the renderer acts on.
    const emit = (status: ChatStatus): void => {
      if (isCancelled()) return
      onStatus?.(status)
    }

    const calls: ToolCallRecord[] = []
    // The chart belongs to the call it was drawn from, so it survives
    // only until the next one. Last one wins if the model re-charts;
    // a later halo-mcp call drops it rather than leaving the card's
    // header describing one result and its bars another.
    let chart: ChartRequest | null = null

    /**
     * TD-059's client-side tool. Runs here rather than over MCP — it
     * fetches nothing, so there is no server to ask — and is refused
     * outright until a halo-mcp call has put real numbers in `calls`.
     */
    function runShowChart(use: ModelToolUse): ToolResultBlockParam {
      if (calls.length === 0) return errorBlock(use.id, NO_DATA_MESSAGE)

      const request = parseChartRequest(use.input)
      if (request === null) return errorBlock(use.id, INVALID_INPUT_MESSAGE)

      chart = request
      return { type: 'tool_result', tool_use_id: use.id, content: SHOW_CHART_ACK }
    }

    /**
     * A tool that ran and failed is a normal outcome: hand the message
     * straight back as an errored `tool_result` so the model can adapt,
     * which is what halo-mcp's tool descriptions are written for.
     *
     * A tool that could not run at all — dead session, unreachable
     * server, malformed JSON-RPC — throws instead. There is nothing for
     * the model to adapt to, and an expired token has to reach the
     * renderer's `reauthenticate()`.
     */
    async function runTool(use: ModelToolUse): Promise<ToolResultBlockParam> {
      if (use.name === SHOW_CHART_TOOL_NAME) return runShowChart(use)

      const result = await tools.callTool(use.name, use.input, signal)
      const failure = toolResultFailure(result)
      if (failure !== null) return errorBlock(use.id, failure.message)

      calls.push({ tool: use.name, args: use.input, result })
      chart = null
      return { type: 'tool_result', tool_use_id: use.id, content: toolResultText(result) }
    }

    try {
      if (isCancelled()) return cancelled()

      emit({ state: 'thinking' })
      const toolDefinitions = [...toAnthropicTools(await tools.listTools()), SHOW_CHART_TOOL]

      const messages: MessageParam[] = [
        ...history.map((turn) => ({ role: turn.role, content: turn.text })),
        { role: 'user', content: question }
      ]

      for (let round = 0; round < MAX_TOOL_ITERATIONS; round += 1) {
        if (isCancelled()) return cancelled()

        emit({ state: 'thinking' })
        const turn = await model.send(
          { system: CHAT_SYSTEM_PROMPT, tools: toolDefinitions, messages },
          signal
        )

        // Checked before `content` is read: a refusal carries no answer
        // to index into, and treating it as an empty turn would report
        // a blank success.
        if (turn.stopReason === 'refusal') {
          return { ok: false, error: 'refusal', message: REFUSAL_MESSAGE }
        }

        if (turn.stopReason === 'tool_use') {
          messages.push({ role: 'assistant', content: turn.content })

          // Every result goes back in ONE user message. Splitting them
          // across messages trains the model out of parallel tool calls.
          const results: ToolResultBlockParam[] = []
          for (const use of turn.toolUses) {
            if (isCancelled()) return cancelled()
            emit({ state: 'calling-tool', tool: use.name })
            results.push(await runTool(use))
          }
          messages.push({ role: 'user', content: results })
          continue
        }

        return {
          ok: true,
          text: turn.text,
          action: deriveAction(calls, chart),
          truncated:
            turn.stopReason === 'max_tokens' || turn.stopReason === 'model_context_window_exceeded'
        }
      }

      return { ok: false, error: 'loop_limit', message: LOOP_LIMIT_MESSAGE }
    } catch (error) {
      // An abort mid-stream surfaces here rather than at the checks
      // above, and how it surfaces depends on who noticed first — so
      // the signal is more reliable than the error that reached us.
      if (isCancelled()) return cancelled()
      const { error: kind, message } = classifyChatError(error)
      return { ok: false, error: kind, message }
    } finally {
      emit({ state: 'idle' })
    }
  }

  return { ask }
}
