import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import type { WebviewTag } from 'electron'
import { useBrowserNav, type BrowserNav } from '../useBrowserNav'

const INITIAL_URL = 'https://www.google.com'
const SUSPENDED_FROM = 'https://example.com/gallery'
const NEXT_URL = 'https://example.com/cat.gif'

/**
 * Enough of Electron's `<webview>` for the hook to attach to: the history
 * and audio calls it makes, plus a listener registry so `did-attach` can be
 * fired (the hook won't suspend until it knows the guest's webContents id).
 */
function fakeWebview(): {
  el: WebviewTag
  emit: (type: string, props?: Record<string, unknown>) => void
  isMuted: () => boolean
  loadURL: ReturnType<typeof vi.fn>
} {
  const listeners = new Map<string, EventListener>()
  const loadURL = vi.fn()
  let muted = false
  const el = {
    addEventListener: (type: string, listener: EventListener) => listeners.set(type, listener),
    removeEventListener: (type: string) => listeners.delete(type),
    getWebContentsId: () => 7,
    getURL: () => SUSPENDED_FROM,
    isAudioMuted: () => muted,
    setAudioMuted: (next: boolean) => {
      muted = next
    },
    stop: vi.fn(),
    canGoBack: () => false,
    canGoForward: () => false,
    loadURL
  } as unknown as WebviewTag

  return {
    el,
    emit: (type, props) => listeners.get(type)?.(Object.assign(new Event(type), props)),
    isMuted: () => muted,
    loadURL
  }
}

function renderNav(
  el: WebviewTag,
  onNewWindow?: (url: string, options?: { background?: boolean }) => void
): { nav: () => BrowserNav } {
  let latest: BrowserNav | null = null

  function Harness(): null {
    latest = useBrowserNav(INITIAL_URL, onNewWindow)
    return null
  }

  render(<Harness />)
  act(() => {
    latest?.attachWebview(el)
  })

  return {
    nav: () => {
      if (!latest) throw new Error('harness did not render')
      return latest
    }
  }
}

describe('loadURL while the tab is suspended', () => {
  it('holds the URL for the resume instead of loading into the parked guest', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0)
      return 0
    })
    const { el, emit, loadURL } = fakeWebview()
    const { nav } = renderNav(el)

    act(() => {
      emit('did-attach')
    })
    // TD-039: shown once, then hidden — the guest is parked on about:blank.
    act(() => {
      nav().setVisible(true)
    })
    act(() => {
      nav().setVisible(false)
    })
    expect(loadURL).toHaveBeenLastCalledWith('about:blank')

    act(() => {
      nav().loadURL(NEXT_URL)
    })

    expect(loadURL).toHaveBeenLastCalledWith('about:blank')
    expect(nav().url).toBe(NEXT_URL)

    act(() => {
      nav().setVisible(true)
    })

    expect(loadURL).toHaveBeenLastCalledWith(NEXT_URL)
  })

  it('loads straight into the guest when the tab was never suspended', () => {
    const { el, emit, loadURL } = fakeWebview()
    const { nav } = renderNav(el)

    act(() => {
      emit('did-attach')
    })
    act(() => {
      nav().loadURL(NEXT_URL)
    })

    expect(loadURL).toHaveBeenCalledWith(NEXT_URL)
  })
})

/**
 * TD-089: a popup used to be rewritten into a same-webview `loadURL`
 * because there was nowhere else for it to go. There is now.
 */
describe('a target=_blank link', () => {
  it('hands an http(s) popup to the tab strip instead of loading it in place', () => {
    const onNewWindow = vi.fn()
    const { el, emit, loadURL } = fakeWebview()
    renderNav(el, onNewWindow)

    act(() => {
      emit('did-attach')
    })
    act(() => {
      emit('new-window', { url: NEXT_URL })
    })

    expect(onNewWindow).toHaveBeenCalledWith(NEXT_URL)
    expect(loadURL).not.toHaveBeenCalled()
  })

  it('loads in place when nothing else will take it', () => {
    const { el, emit, loadURL } = fakeWebview()
    renderNav(el)

    act(() => {
      emit('did-attach')
    })
    act(() => {
      emit('new-window', { url: NEXT_URL })
    })

    expect(loadURL).toHaveBeenCalledWith(NEXT_URL)
  })
})

// TD-089: only the browser tab on screen makes noise, and TD-039's
// snapshot must not mistake that for the user's own mute.
describe('a muted background tab', () => {
  function suspendAndResume(nav: () => BrowserNav): void {
    act(() => {
      nav().setVisible(false)
    })
    act(() => {
      nav().setVisible(true)
    })
  }

  it('is still muted after the Browser tab has been away and come back', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0)
      return 0
    })
    const { el, emit, isMuted } = fakeWebview()
    const { nav } = renderNav(el)

    act(() => {
      emit('did-attach')
    })
    act(() => {
      nav().setVisible(true)
    })
    act(() => {
      nav().setMuted(true)
    })
    expect(isMuted()).toBe(true)

    suspendAndResume(nav)

    expect(isMuted()).toBe(true)

    act(() => {
      nav().setMuted(false)
    })

    expect(isMuted()).toBe(false)
  })

  it('leaves a tab that was never muted audible on resume', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0)
      return 0
    })
    const { el, emit, isMuted } = fakeWebview()
    const { nav } = renderNav(el)

    act(() => {
      emit('did-attach')
    })
    act(() => {
      nav().setVisible(true)
    })

    suspendAndResume(nav)

    expect(isMuted()).toBe(false)
  })
})

/**
 * TD-091: main builds the menu but can't open a tab, so the item the
 * user chose comes back here to be carried out.
 */
describe('a right-click on a link', () => {
  const PARAMS = {
    mediaType: 'none',
    srcURL: '',
    pageURL: SUSPENDED_FROM,
    linkURL: NEXT_URL
  }

  function stubContextMenu(result: unknown): ReturnType<typeof vi.fn> {
    const show = vi.fn(async () => result)
    Object.assign(window, {
      thunder: { browser: { contextMenu: { show } } }
    })
    return show
  }

  afterEach(() => {
    Reflect.deleteProperty(window, 'thunder')
  })

  it('forwards the link URL with the rest of the params', async () => {
    const show = stubContextMenu({ action: 'none' })
    const { el, emit } = fakeWebview()
    renderNav(el, vi.fn())

    await act(async () => {
      emit('context-menu', { params: PARAMS })
    })

    expect(show).toHaveBeenCalledWith({
      webContentsId: 7,
      mediaType: 'none',
      srcURL: '',
      pageURL: SUSPENDED_FROM,
      linkURL: NEXT_URL
    })
  })

  it('opens a background tab and leaves this page where it is', async () => {
    stubContextMenu({ action: 'open-in-new-tab', url: NEXT_URL })
    const onNewWindow = vi.fn()
    const { el, emit, loadURL } = fakeWebview()
    renderNav(el, onNewWindow)

    await act(async () => {
      emit('context-menu', { params: PARAMS })
    })

    expect(onNewWindow).toHaveBeenCalledWith(NEXT_URL, { background: true })
    expect(loadURL).not.toHaveBeenCalled()
  })

  it('does nothing when there is no tab strip to open into', async () => {
    stubContextMenu({ action: 'open-in-new-tab', url: NEXT_URL })
    const { el, emit, loadURL } = fakeWebview()
    renderNav(el)

    await act(async () => {
      emit('context-menu', { params: PARAMS })
    })

    expect(loadURL).not.toHaveBeenCalled()
  })

  it('opens nothing when main reports no choice', async () => {
    stubContextMenu({ action: 'none' })
    const onNewWindow = vi.fn()
    const { el, emit } = fakeWebview()
    renderNav(el, onNewWindow)

    await act(async () => {
      emit('context-menu', { params: PARAMS })
    })

    expect(onNewWindow).not.toHaveBeenCalled()
  })
})
