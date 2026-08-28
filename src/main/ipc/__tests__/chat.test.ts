/**
 * TD-070: main-side validation for the chat `ask` payload.
 *
 * `parseAskRequest` destructures and rebuilds, so a field nobody named is
 * not "passed through" — it is dropped, silently, with the feature failing
 * and nothing logged. These tests exist so the view cannot go that way
 * again, and so a hostile renderer cannot use it as a free-text channel to
 * the model.
 *
 * TD-072 adds the cost half: what reaches the renderer on `chatUsage`, and
 * what `chatCapabilities` answers with on either side of the toggle.
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
  tools: [{ name: 'search_records' }],
  model: {
    id: 'deepseek.v3.2',
    input_price_per_mtok: 0.28,
    output_price_per_mtok: 0.42,
    currency: 'USD'
  }
}

const USAGE: TurnUsage = {
  model: 'deepseek.v3.2',
  rounds: 2,
  input_tokens: 4000,
  output_tokens: 900,
  cache_read_input_tokens: 0,
  cache_write_input_tokens: 0,
  cost_usd: 0.0015,
  conversation: { turns: 3, input_tokens: 9000, output_tokens: 2100, cost_usd: 0.041 }
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

const sendToFocused = vi.fn<(channel: string, payload: unknown) => void>()

vi.mock('../window-send', () => ({ sendToFocused }))

const { THUNDER_IPC_CHANNELS } = await import('../../../preload/thunder-api')
const { registerChatHandlers } = await import('../chat')

registerChatHandlers()

function invokeAsk(payload: unknown): Promise<ChatAskResult> {
  const handler = ipcHandlers.get(THUNDER_IPC_CHANNELS.chatAsk)
  if (!handler) throw new Error('chat ask handler not registered')
  return Promise.resolve(handler({}, payload)) as Promise<ChatAskResult>
}

function invokeCapabilities(): Promise<Capabilities | null> {
  const handler = ipcHandlers.get(THUNDER_IPC_CHANNELS.chatCapabilities)
  if (!handler) throw new Error('chat capabilities handler not registered')
  return Promise.resolve(handler({})) as Promise<Capabilities | null>
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

describe('chat usage: what the turn cost (TD-072)', () => {
  beforeEach(() => {
    chatEnabled = true
    ask.mockReset()
    ask.mockImplementation(async () => OK)
    sendToFocused.mockClear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('pushes the usage of a turn that ran to the end', async () => {
    ask.mockImplementationOnce(async (options) => {
      options.onUsage?.(USAGE)
      return OK
    })

    await invokeAsk({ question: 'who is popular?' })

    expect(sendToFocused).toHaveBeenCalledWith(THUNDER_IPC_CHANNELS.chatUsage, USAGE)
  })

  it('drops the usage of a superseded turn — a stale total, not the money', async () => {
    let settleFirst: (result: ChatAskResult) => void = () => {}
    ask.mockImplementationOnce(
      () =>
        new Promise<ChatAskResult>((resolve) => {
          settleFirst = resolve
        })
    )

    const first = invokeAsk({ question: 'who is popular?' })
    // The second question aborts the first, exactly as it does for status.
    await invokeAsk({ question: 'and who is not?' })

    ask.mock.calls[0][0].onUsage?.(USAGE)
    settleFirst(OK)
    await first

    expect(sendToFocused).not.toHaveBeenCalledWith(THUNDER_IPC_CHANNELS.chatUsage, USAGE)
  })
})

describe('chat capabilities: which model would run the next turn (TD-072)', () => {
  beforeEach(() => {
    chatEnabled = true
    capabilities.mockClear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('names the model while chat is on', async () => {
    expect(await invokeCapabilities()).toEqual(CAPABILITIES)
  })

  it('answers with the disabled shape, and asks nothing, while chat is off', async () => {
    chatEnabled = false

    expect(await invokeCapabilities()).toEqual({ chat_enabled: false, tools: [] })
    expect(capabilities).not.toHaveBeenCalled()
  })

  it('passes a failed read through as null rather than as chat being off', async () => {
    capabilities.mockResolvedValueOnce(null)

    expect(await invokeCapabilities()).toBeNull()
  })
})
