/**
 * TD-054 / TD-065: Electron wiring for the AI chat. The IPC surface is
 * unchanged — the renderer still sends a question and gets the finished
 * turn back — but the loop behind it now runs in thunder-context. Main
 * holds the Halo token and the poll, which is why the poll stayed here
 * rather than moving to the renderer: a turn has to survive a navigation
 * away from Home.
 *
 * `chatEnabled` is checked on every invocation rather than at
 * registration: the handlers have to exist before the renderer can call
 * them, and the toggle can flip at any point after that.
 */

import { ipcMain } from 'electron'
import { THUNDER_IPC_CHANNELS } from '../../preload/thunder-api'
import { MAX_TURN_TEXT_LENGTH } from '../../shared/chat'
import type { ChatAskResult, ChatHistoryTurn, ChatStatus } from '../../shared/chat'
import { createContextClient } from '../context/context-client'
import { resolveAuthToken } from './auth'
import { resolveChatSettings, resolveContextUrl } from './settings'
import { sendToFocused } from './window-send'

/**
 * Bounds what a compromised or buggy renderer can push through a single
 * turn. Neither limit is a product rule — they exist so an unbounded
 * payload can't be laundered into model token spend.
 */
const MAX_QUESTION_LENGTH = MAX_TURN_TEXT_LENGTH
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
 * The URL and the token arrive as getters, so a Settings change or a
 * silent reauth is picked up on the next request without rebuilding the
 * client — and the conversation id it memoises survives across turns.
 */
const context = createContextClient({
  getBaseUrl: resolveContextUrl,
  getToken: resolveAuthToken
})

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
    if (!resolveChatSettings().chatEnabled) return DISABLED_RESULT

    // History is still validated but not forwarded: thunder-context
    // keeps the transcript against the conversation id, so replaying it
    // would send the same turns twice. The renderer keeps building it
    // for the browser and native clients that share the hook.
    const request = parseAskRequest(payload)
    if (request === null) return INVALID_REQUEST

    // A second question supersedes the first rather than racing it —
    // otherwise `cancel` would only ever reach the newest turn and the
    // older one would keep spending tokens.
    inFlight?.abort()
    const controller = new AbortController()
    inFlight = controller

    try {
      return await context.ask({
        question: request.question,
        signal: controller.signal,
        // A superseded or cancelled turn must not drive the spinner for
        // the question that replaced it.
        onStatus: (status: ChatStatus) => {
          if (!controller.signal.aborted) {
            sendToFocused(THUNDER_IPC_CHANNELS.chatStatus, status)
          }
        }
      })
    } finally {
      if (inFlight === controller) inFlight = null
    }
  })

  ipcMain.handle(THUNDER_IPC_CHANNELS.chatCancel, async () => {
    if (!resolveChatSettings().chatEnabled) return
    inFlight?.abort()
  })

  // Not gated on `chatEnabled`: logout has to drop the server-side
  // transcript whatever the toggle says.
  ipcMain.handle(THUNDER_IPC_CHANNELS.chatClear, async () => {
    inFlight?.abort()
    await context.clearConversation()
  })
}
