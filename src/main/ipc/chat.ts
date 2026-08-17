/**
 * TD-054: Electron wiring for the AI chat. Everything that touches
 * Bedrock, AWS credentials or the Halo bearer token stays here and in
 * `main/chat/` — the sandboxed renderer sends a question and gets the
 * finished turn back.
 *
 * `chatEnabled` is checked on every invocation rather than at
 * registration: the handlers have to exist before the renderer can call
 * them, and the toggle can flip at any point after that.
 */

import { ipcMain } from 'electron'
import { THUNDER_IPC_CHANNELS } from '../../preload/thunder-api'
import type { ChatAskResult, ChatHistoryTurn, ChatStatus } from '../../shared/chat'
import { createAgentLoop } from '../chat/agent-loop'
import { createBedrockModel } from '../chat/bedrock-client'
import { HaloMcpClient } from '../mcp/halo-mcp-client'
import { resolveAuthToken } from './auth'
import { resolveCredentials } from './aws-creds'
import { resolveChatSettings, resolveMcpUrl } from './settings'
import { sendToFocused } from './window-send'

/**
 * Bounds what a compromised or buggy renderer can push through a single
 * turn. Neither limit is a product rule — they exist so an unbounded
 * payload can't be laundered into Bedrock token spend.
 */
const MAX_QUESTION_LENGTH = 4_000
const MAX_HISTORY_TURNS = 40

const DISABLED_RESULT: ChatAskResult = {
  ok: false,
  error: 'unknown',
  message: 'AI chat is turned off in Settings.'
}

const INVALID_REQUEST: ChatAskResult = {
  ok: false,
  error: 'unknown',
  message: 'The chat request was malformed.'
}

/**
 * Memoised for the process lifetime. The URL and token arrive as
 * getters, so a Settings change or a silent reauth is picked up on the
 * next request without rebuilding the client.
 */
let mcpClient: HaloMcpClient | null = null

function haloMcp(): HaloMcpClient {
  mcpClient ??= new HaloMcpClient({ getUrl: resolveMcpUrl, getToken: resolveAuthToken })
  return mcpClient
}

/** One turn at a time — `cancel` has exactly one thing to abort. */
let inFlight: AbortController | null = null

function isHistoryTurn(value: unknown): value is ChatHistoryTurn {
  if (typeof value !== 'object' || value === null) return false
  const turn = value as Record<string, unknown>
  if (turn.role !== 'user' && turn.role !== 'assistant') return false
  // Bounded per turn, not just per conversation — 40 unbounded turns is
  // the same unbounded payload the count cap is meant to prevent.
  return typeof turn.text === 'string' && turn.text.length <= MAX_QUESTION_LENGTH
}

interface ParsedAskRequest {
  question: string
  history: ChatHistoryTurn[]
}

function parseAskRequest(payload: unknown): ParsedAskRequest | null {
  if (typeof payload !== 'object' || payload === null) return null
  const { question, history } = payload as Record<string, unknown>

  if (typeof question !== 'string') return null
  const trimmed = question.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_QUESTION_LENGTH) return null

  if (history === undefined) return { question: trimmed, history: [] }
  if (!Array.isArray(history) || history.length > MAX_HISTORY_TURNS) return null
  if (!history.every(isHistoryTurn)) return null

  return { question: trimmed, history }
}

export function registerChatHandlers(): void {
  ipcMain.handle(THUNDER_IPC_CHANNELS.chatAsk, async (_event, payload: unknown) => {
    const { chatEnabled, bedrockRegion, bedrockModelId } = resolveChatSettings()
    if (!chatEnabled) return DISABLED_RESULT

    const request = parseAskRequest(payload)
    if (request === null) return INVALID_REQUEST

    // A second question supersedes the first rather than racing it —
    // otherwise `cancel` would only ever reach the newest turn and the
    // older one would keep spending tokens.
    inFlight?.abort()
    const controller = new AbortController()
    inFlight = controller

    const loop = createAgentLoop({
      model: createBedrockModel({
        region: bedrockRegion,
        modelId: bedrockModelId,
        credentials: resolveCredentials()
      }),
      tools: haloMcp(),
      onStatus: (status: ChatStatus) => sendToFocused(THUNDER_IPC_CHANNELS.chatStatus, status)
    })

    try {
      return await loop.ask({ ...request, signal: controller.signal })
    } finally {
      if (inFlight === controller) inFlight = null
    }
  })

  ipcMain.handle(THUNDER_IPC_CHANNELS.chatCancel, async () => {
    if (!resolveChatSettings().chatEnabled) return
    inFlight?.abort()
  })
}
