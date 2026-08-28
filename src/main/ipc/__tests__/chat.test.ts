/**
 * TD-070: main-side validation for the chat `ask` payload.
 *
 * `parseAskRequest` destructures and rebuilds, so a field nobody named is
 * not "passed through" — it is dropped, silently, with the feature failing
 * and nothing logged. These tests exist so the view cannot go that way
 * again, and so a hostile renderer cannot use it as a free-text channel to
 * the model.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AskOptions,
  Capabilities,
  ChatAskResult,
  TurnUsage
} from '@swaff-y/thunder-chat-core/headless'

const ipcHandlers = new Map<
  string,
  (event: unknown, ...args: unknown[]) => unknown | Promise<unknown>
>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (
      channel: string,
      handler: (event: unknown, ...args: unknown[]) => unknown | Promise<unknown>
    ): void => {
      ipcHandlers.set(channel, handler)
    }
  }
}))

const OK: ChatAskResult = {
  ok: true,
  text: 'ok',
  action: { kind: 'none', tool: null, args: {}, title: '', result: null },
  truncated: false
}

const CAPABILITIES: Capabilities = {
  chat_enabled: true,
  tools: [],
  model: {
    id: 'deepseek.v3.2',
    input_price_per_mtok: 0.28,
    output_price_per_mtok: 0.42,
    currency: 'USD'
  }
}

const ask = vi.fn<(options: AskOptions) => Promise<ChatAskResult>>(async () => OK)
const clearConversation = vi.fn(async () => {})
const capabilities = vi.fn<() => Promise<Capabilities | null>>(async () => CAPABILITIES)

vi.mock('@swaff-y/thunder-chat-core/headless', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@swaff-y/thunder-chat-core/headless')>()
  return { ...actual, createContextClient: () => ({ ask, clearConversation, capabilities }) }
})

let chatEnabled = true

vi.mock('../settings', () => ({
  resolveChatSettings: () => ({ chatEnabled }),
  resolveContextUrl: () => 'https://context.example'
}))

vi.mock('../auth', () => ({ resolveAuthToken: () => 'token' }))

vi.mock('../window-send', () => ({ sendToFocused: vi.fn() }))

const { sendToFocused } = await import('../window-send')

const { THUNDER_IPC_CHANNELS } = await import('../../../preload/thunder-api')
const { registerChatHandlers } = await import('../chat')

registerChatHandlers()

function invokeAsk(payload: unknown): Promise<ChatAskResult> {
  const handler = ipcHandlers.get(THUNDER_IPC_CHANNELS.chatAsk)
  if (!handler) throw new Error('chat ask handler not registered')
  return Promise.resolve(handler({}, payload)) as Promise<ChatAskResult>
}

const askedView = (call = 0): unknown => ask.mock.calls[call]?.[0]?.view

describe('chat ask: the view (TD-070)', () => {
  beforeEach(() => {
    chatEnabled = true
    ask.mockClear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('forwards a record view', async () => {
    await invokeAsk({ question: 'who is on this?', view: { kind: 'record', id: '1234' } })
    expect(askedView()).toEqual({ kind: 'record', id: '1234' })
  })

  it('forwards an entity view', async () => {
    await invokeAsk({ question: 'how many?', view: { kind: 'entity', type: 'actor', id: '77' } })
    expect(askedView()).toEqual({ kind: 'entity', type: 'actor', id: '77' })
  })

  it('forwards a list view', async () => {
    await invokeAsk({ question: 'how many?', view: { kind: 'list', type: 'actor' } })
    expect(askedView()).toEqual({ kind: 'list', type: 'actor' })
  })

  it('forwards an "other" view with nothing attached to it', async () => {
    await invokeAsk({ question: 'hi', view: { kind: 'other', id: 'ignored' } })
    expect(askedView()).toEqual({ kind: 'other' })
  })

  it('sends no view when the renderer sends none', async () => {
    await invokeAsk({ question: 'hi' })
    expect(askedView()).toBeUndefined()
  })

  it('sends no view when the renderer sends null — most pages have none', async () => {
    await invokeAsk({ question: 'hi', view: null })
    expect(askedView()).toBeUndefined()
  })

  it('drops a label the renderer had no business sending', async () => {
    await invokeAsk({
      question: 'hi',
      view: { kind: 'entity', type: 'actor', id: '77', label: 'Nick Cage' }
    })
    expect(askedView()).toEqual({ kind: 'entity', type: 'actor', id: '77' })
  })

  it.each([
    ['an unknown kind', { kind: 'wat', id: '1' }],
    ['no kind at all', { id: '1' }],
    ['a record with no id', { kind: 'record' }],
    ['a record with a non-string id', { kind: 'record', id: 7 }],
    ['a record with an empty id', { kind: 'record', id: '' }],
    ['an entity with no type', { kind: 'entity', id: '7' }],
    ['a list with no type', { kind: 'list' }],
    ['an over-long id', { kind: 'record', id: 'x'.repeat(201) }],
    ['a view that is not an object', 'record'],
    ['a view that is an array', []]
  ])('rejects the whole request for %s', async (_name, view) => {
    const result = await invokeAsk({ question: 'hi', view })
    expect(result.ok).toBe(false)
    expect(ask).not.toHaveBeenCalled()
  })

  it('still rejects a malformed question before it looks at the view', async () => {
    const result = await invokeAsk({ question: '   ', view: { kind: 'record', id: '1' } })
    expect(result.ok).toBe(false)
    expect(ask).not.toHaveBeenCalled()
  })

  it('sends nothing at all while chat is turned off', async () => {
    chatEnabled = false
    const result = await invokeAsk({ question: 'hi', view: { kind: 'record', id: '1' } })
    expect(result.ok).toBe(false)
    expect(ask).not.toHaveBeenCalled()
  })
})


/**
 * TD-072: main polls the turn, so the usage reaches the renderer as a push
 * or not at all.
 */
const USAGE: TurnUsage = {
  model: 'deepseek.v3.2',
  rounds: 1,
  input_tokens: 1200,
  output_tokens: 300,
  cache_read_input_tokens: 0,
  cache_write_input_tokens: 0,
  cost_usd: 0.004,
  conversation: { turns: 3, input_tokens: 3600, output_tokens: 900, cost_usd: 0.041 }
}

function invokeCapabilities(): Promise<Capabilities | null> {
  const handler = ipcHandlers.get(THUNDER_IPC_CHANNELS.chatCapabilities)
  if (!handler) throw new Error('chat capabilities handler not registered')
  return Promise.resolve(handler({})) as Promise<Capabilities | null>
}

const usagePushes = (): unknown[] =>
  vi
    .mocked(sendToFocused)
    .mock.calls.filter(([channel]) => channel === THUNDER_IPC_CHANNELS.chatUsage)
    .map(([, payload]) => payload)

describe('chat usage (TD-072)', () => {
  beforeEach(() => {
    chatEnabled = true
    vi.clearAllMocks()
    ask.mockImplementation(async () => OK)
    capabilities.mockImplementation(async () => CAPABILITIES)
  })

  it('pushes what a settled turn spent', async () => {
    ask.mockImplementation(async (options) => {
      options.onUsage?.(USAGE)
      return OK
    })

    await invokeAsk({ question: 'hi' })

    expect(usagePushes()).toEqual([USAGE])
  })

  it('says nothing for a turn that was superseded', async () => {
    // The first turn has to still be running when the second arrives —
    // a turn that already settled is not the one `abort` reaches.
    let settleFirstTurn: (() => void) | undefined
    let reportFirstTurn: (() => void) | undefined
    ask.mockImplementationOnce(async (options) => {
      reportFirstTurn = () => options.onUsage?.(USAGE)
      await new Promise<void>((resolve) => {
        settleFirstTurn = resolve
      })
      return OK
    })

    const first = invokeAsk({ question: 'first' })
    await invokeAsk({ question: 'second' })
    reportFirstTurn?.()
    settleFirstTurn?.()
    await first

    expect(usagePushes()).toEqual([])
  })

  it('names the model that would run the next turn', async () => {
    expect(await invokeCapabilities()).toEqual(CAPABILITIES)
  })

  it('reports the disabled shape rather than the service while chat is off', async () => {
    chatEnabled = false

    expect(await invokeCapabilities()).toEqual({ chat_enabled: false, tools: [] })
    expect(capabilities).not.toHaveBeenCalled()
  })

  it('passes an unreadable service through as null rather than as disabled', async () => {
    capabilities.mockImplementation(async () => null)

    expect(await invokeCapabilities()).toBeNull()
  })
})
