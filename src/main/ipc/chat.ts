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
import { MAX_TURN_TEXT_LENGTH } from '@swaff-y/thunder-chat-core/headless'
import type {
  Capabilities,
  ChatAskResult,
  ChatHistoryTurn,
  ChatStatus,
  TurnUsage,
  ViewContext
} from '@swaff-y/thunder-chat-core/headless'
import { createContextClient } from '@swaff-y/thunder-chat-core/headless'
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
/** An id or a halo type; anything longer is not one of ours. */
const MAX_VIEW_FIELD_LENGTH = 200

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
 * TD-072: what the service is while the toggle is off. Named rather than
 * `null`, because `null` is reserved for "we could not read it" — a
 * consumer that gated on a fabricated `false` would hide a working chat
 * over one failed fetch.
 */
const DISABLED_CAPABILITIES: Capabilities = { chat_enabled: false, tools: [] }

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

function isViewField(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_VIEW_FIELD_LENGTH
}

/**
 * TD-070: the view is rebuilt field by field rather than forwarded, for the
 * same reason the rest of the payload is — whatever the renderer sends,
 * only the fields named here reach the server. That drops `label`, which
 * this client deliberately never sets.
 *
 * `null` means "the renderer sent something that is not a view", and the
 * whole request is rejected: a view the server would have ignored is a bug
 * here, and silently dropping it is how this feature fails invisibly.
 */
function parseView(value: unknown): ViewContext | null {
  if (typeof value !== 'object' || value === null) return null
  const { kind, type, id } = value as Record<string, unknown>

  switch (kind) {
    case 'record':
      return isViewField(id) ? { kind: 'record', id } : null
    case 'entity':
      return isViewField(type) && isViewField(id) ? { kind: 'entity', type, id } : null
    case 'list':
      return isViewField(type) ? { kind: 'list', type } : null
    case 'other':
      return { kind: 'other' }
    default:
      return null
  }
}

interface ParsedAskRequest {
  question: string
  history: ChatHistoryTurn[]
  view?: ViewContext
}

function parseAskRequest(payload: unknown): ParsedAskRequest | null {
  if (typeof payload !== 'object' || payload === null) return null
  const { question, history, view } = payload as Record<string, unknown>

  if (typeof question !== 'string') return null
  const trimmed = question.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_QUESTION_LENGTH) return null

  let turns: ChatHistoryTurn[] = []
  if (history !== undefined) {
    if (!Array.isArray(history) || history.length > MAX_HISTORY_TURNS) return null
    if (!history.every(isHistoryTurn)) return null
    turns = history
  }

  // Most pages have no view, and an absent one is the normal case rather
  // than a missing field.
  if (view === undefined || view === null) return { question: trimmed, history: turns }

  const parsed = parseView(view)
  if (parsed === null) return null

  return { question: trimmed, history: turns, view: parsed }
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
        // TD-070: the page the question was asked from. The client omits it
        // from the body entirely when absent — `null` is a different request.
        view: request.view,
        signal: controller.signal,
        // A superseded or cancelled turn must not drive the spinner for
        // the question that replaced it.
        onStatus: (status: ChatStatus) => {
          if (!controller.signal.aborted) {
            sendToFocused(THUNDER_IPC_CHANNELS.chatStatus, status)
          }
        },
        // TD-072: same guard, for a different reason. A superseded turn did
        // spend its tokens and the server has already counted them into the
        // conversation total, so the turn that replaced it will report them.
        // What is dropped here is a stale snapshot, not the money.
        onUsage: (usage: TurnUsage) => {
          if (!controller.signal.aborted) {
            sendToFocused(THUNDER_IPC_CHANNELS.chatUsage, usage)
          }
        }
      })
    } finally {
      if (inFlight === controller) inFlight = null
    }
  })

  // TD-072: the model the summary line names on an empty chat, before any
  // turn exists to carry one.
  ipcMain.handle(THUNDER_IPC_CHANNELS.chatCapabilities, async () => {
    if (!resolveChatSettings().chatEnabled) return DISABLED_CAPABILITIES
    return context.capabilities()
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
