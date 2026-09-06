import { describe, expect, it, vi } from 'vitest'
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
  emit: (type: string) => void
  loadURL: ReturnType<typeof vi.fn>
} {
  const listeners = new Map<string, EventListener>()
  const loadURL = vi.fn()
  const el = {
    addEventListener: (type: string, listener: EventListener) => listeners.set(type, listener),
    removeEventListener: (type: string) => listeners.delete(type),
    getWebContentsId: () => 7,
    getURL: () => SUSPENDED_FROM,
    isAudioMuted: () => false,
    setAudioMuted: vi.fn(),
    stop: vi.fn(),
    canGoBack: () => false,
    canGoForward: () => false,
    loadURL
  } as unknown as WebviewTag

  return {
    el,
    emit: (type) => listeners.get(type)?.(new Event(type)),
    loadURL
  }
}

function renderNav(el: WebviewTag): { nav: () => BrowserNav } {
  let latest: BrowserNav | null = null

  function Harness(): null {
    latest = useBrowserNav(INITIAL_URL)
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
