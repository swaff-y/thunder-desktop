/**
 * TD-047: tests for the "Save image" context-menu IPC handler. The
 * Electron `Menu` / `webContents` / `session` surfaces are mocked so
 * we can observe what template would be built, whether `popup` is
 * called, and which arguments make it through to the download
 * pipeline.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const browserSession = { __tag: 'browser' as const }
const otherSession = { __tag: 'other' as const }

let mockGuest: { isDestroyed: () => boolean; session: object } | undefined
let focusedWindow: { isDestroyed: () => boolean } | null = {
  isDestroyed: (): boolean => false
}

const popupSpy = vi.fn()
const buildFromTemplateSpy = vi.fn()
let lastTemplate: Array<{ label: string; click?: () => void }> = []

const ipcHandlers = new Map<
  string,
  (event: unknown, ...args: unknown[]) => unknown | Promise<unknown>
>()

vi.mock('electron', () => ({
  BrowserWindow: {
    getFocusedWindow: () => focusedWindow
  },
  Menu: {
    buildFromTemplate: (template: Array<{ label: string; click?: () => void }>) => {
      buildFromTemplateSpy(template)
      lastTemplate = template
      return { popup: popupSpy }
    }
  },
  ipcMain: {
    handle: (
      channel: string,
      handler: (event: unknown, ...args: unknown[]) => unknown | Promise<unknown>
    ) => {
      ipcHandlers.set(channel, handler)
    }
  },
  session: {
    fromPartition: (partition: string) => {
      if (partition === 'persist:thunder-browser') return browserSession
      return otherSession
    }
  },
  webContents: {
    fromId: () => mockGuest
  }
}))

const { THUNDER_IPC_CHANNELS } = await import('../../../preload/thunder-api')

type StartBrowserDownload = (args: {
  assetUrl: string
  suggestedFilename: string
  mimeType?: string
  referer?: string
}) => Promise<{ id: string; queued: boolean }>

let startBrowserDownload: ReturnType<typeof vi.fn<StartBrowserDownload>>
let registerBrowserContextMenuHandlers: typeof import('../browser-context-menu').registerBrowserContextMenuHandlers
let deriveImageFilename: typeof import('../browser-context-menu').deriveImageFilename

async function callShow(args: unknown): Promise<void> {
  const handler = ipcHandlers.get(THUNDER_IPC_CHANNELS.browserContextMenuShow)
  if (!handler) throw new Error('context-menu show handler not registered')
  await handler({}, args)
}

describe('browser-context-menu (TD-047)', () => {
  beforeEach(async () => {
    popupSpy.mockReset()
    buildFromTemplateSpy.mockReset()
    lastTemplate = []
    ipcHandlers.clear()
    mockGuest = { isDestroyed: (): boolean => false, session: browserSession }
    focusedWindow = { isDestroyed: (): boolean => false }
    startBrowserDownload = vi.fn<StartBrowserDownload>(async () => ({
      id: 'fake-id',
      queued: false
    }))
    vi.resetModules()
    const mod = await import('../browser-context-menu')
    registerBrowserContextMenuHandlers = mod.registerBrowserContextMenuHandlers
    deriveImageFilename = mod.deriveImageFilename
    registerBrowserContextMenuHandlers({ startBrowserDownload })
  })

  afterEach(() => {
    mockGuest = undefined
  })

  // ─── deriveImageFilename ──────────────────────────────────────────

  describe('deriveImageFilename', () => {
    it('returns the basename when the URL pathname has one with an extension', () => {
      expect(deriveImageFilename(new URL('https://cdn.example.com/img/photo.jpg'))).toBe(
        'photo.jpg'
      )
    })

    it('appends .jpg when the basename has no extension', () => {
      expect(deriveImageFilename(new URL('https://cdn.example.com/abc?x=1'))).toBe('abc.jpg')
    })

    it('falls back to image.jpg when the pathname is just "/"', () => {
      expect(deriveImageFilename(new URL('https://cdn.example.com/'))).toBe('image.jpg')
    })

    it('decodes percent-encoded basenames', () => {
      expect(deriveImageFilename(new URL('https://cdn.example.com/My%20Photo.png'))).toBe(
        'My Photo.png'
      )
    })
  })

  // ─── partition gate (AC5 / AC6) ───────────────────────────────────

  it('does nothing when the webContentsId resolves to a non-browser session', async () => {
    mockGuest = { isDestroyed: (): boolean => false, session: otherSession }
    await callShow({
      webContentsId: 42,
      mediaType: 'image',
      srcURL: 'https://cdn.example.com/p.jpg',
      pageURL: 'https://example.com/'
    })
    expect(buildFromTemplateSpy).not.toHaveBeenCalled()
    expect(popupSpy).not.toHaveBeenCalled()
    expect(startBrowserDownload).not.toHaveBeenCalled()
  })

  it('does nothing when the webContentsId resolves to no webContents', async () => {
    mockGuest = undefined
    await callShow({
      webContentsId: 999,
      mediaType: 'image',
      srcURL: 'https://cdn.example.com/p.jpg',
      pageURL: 'https://example.com/'
    })
    expect(buildFromTemplateSpy).not.toHaveBeenCalled()
  })

  it('does nothing when the resolved webContents is destroyed', async () => {
    // TOCTOU: guest tore down between the right-click and the IPC
    // landing. Don't try to interact with a dead webContents.
    mockGuest = { isDestroyed: (): boolean => true, session: browserSession }
    await callShow({
      webContentsId: 42,
      mediaType: 'image',
      srcURL: 'https://cdn.example.com/p.jpg',
      pageURL: 'https://example.com/'
    })
    expect(buildFromTemplateSpy).not.toHaveBeenCalled()
  })

  // ─── argument validation ──────────────────────────────────────────

  it('does nothing when args are missing', async () => {
    await callShow(undefined)
    expect(buildFromTemplateSpy).not.toHaveBeenCalled()
  })

  it('does nothing when webContentsId is not an integer', async () => {
    await callShow({
      webContentsId: '42',
      mediaType: 'image',
      srcURL: 'https://x/p.jpg',
      pageURL: 'https://x/'
    })
    expect(buildFromTemplateSpy).not.toHaveBeenCalled()
  })

  // ─── AC3: non-image right-click ───────────────────────────────────

  it('does nothing when mediaType is not image', async () => {
    await callShow({
      webContentsId: 42,
      mediaType: 'none',
      srcURL: 'https://cdn.example.com/p.jpg',
      pageURL: 'https://example.com/'
    })
    expect(buildFromTemplateSpy).not.toHaveBeenCalled()
    expect(startBrowserDownload).not.toHaveBeenCalled()
  })

  // ─── AC4: data: / blob: schemes ───────────────────────────────────

  it('does nothing for data: image URLs', async () => {
    await callShow({
      webContentsId: 42,
      mediaType: 'image',
      srcURL: 'data:image/png;base64,iVBORw0KGgo=',
      pageURL: 'https://example.com/'
    })
    expect(buildFromTemplateSpy).not.toHaveBeenCalled()
  })

  it('does nothing for blob: image URLs', async () => {
    await callShow({
      webContentsId: 42,
      mediaType: 'image',
      srcURL: 'blob:https://example.com/abc-123',
      pageURL: 'https://example.com/'
    })
    expect(buildFromTemplateSpy).not.toHaveBeenCalled()
  })

  // ─── AC1: native menu is built and popped ─────────────────────────

  it('builds a single "Save image" item and pops the menu on the focused window', async () => {
    await callShow({
      webContentsId: 42,
      mediaType: 'image',
      srcURL: 'https://cdn.example.com/photo.jpg',
      pageURL: 'https://example.com/page'
    })
    expect(buildFromTemplateSpy).toHaveBeenCalledTimes(1)
    expect(lastTemplate).toHaveLength(1)
    expect(lastTemplate[0]?.label).toBe('Save image')
    expect(popupSpy).toHaveBeenCalledWith({ window: focusedWindow })
  })

  it('does not pop the menu when no window is focused', async () => {
    focusedWindow = null
    await callShow({
      webContentsId: 42,
      mediaType: 'image',
      srcURL: 'https://cdn.example.com/photo.jpg',
      pageURL: 'https://example.com/page'
    })
    expect(popupSpy).not.toHaveBeenCalled()
  })

  it('does not pop the menu when the focused window is destroyed', async () => {
    focusedWindow = { isDestroyed: (): boolean => true }
    await callShow({
      webContentsId: 42,
      mediaType: 'image',
      srcURL: 'https://cdn.example.com/photo.jpg',
      pageURL: 'https://example.com/page'
    })
    expect(popupSpy).not.toHaveBeenCalled()
  })

  // ─── AC2 + AC5: click triggers download with referer ──────────────

  it('click invokes startBrowserDownload with derived filename + referer', async () => {
    await callShow({
      webContentsId: 42,
      mediaType: 'image',
      srcURL: 'https://cdn.example.com/photo.jpg',
      pageURL: 'https://example.com/page'
    })
    lastTemplate[0]?.click?.()
    expect(startBrowserDownload).toHaveBeenCalledWith({
      assetUrl: 'https://cdn.example.com/photo.jpg',
      suggestedFilename: 'photo.jpg',
      referer: 'https://example.com/page'
    })
  })

  it('drops the referer when pageURL is not http(s)', async () => {
    await callShow({
      webContentsId: 42,
      mediaType: 'image',
      srcURL: 'https://cdn.example.com/photo.jpg',
      pageURL: 'about:blank'
    })
    lastTemplate[0]?.click?.()
    expect(startBrowserDownload).toHaveBeenCalledWith({
      assetUrl: 'https://cdn.example.com/photo.jpg',
      suggestedFilename: 'photo.jpg',
      referer: undefined
    })
  })

  it('logs and swallows rejections from startBrowserDownload so a failed dispatch does not crash main', async () => {
    startBrowserDownload.mockRejectedValueOnce(new Error('disk full'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await callShow({
        webContentsId: 42,
        mediaType: 'image',
        srcURL: 'https://cdn.example.com/photo.jpg',
        pageURL: 'https://example.com/'
      })
      expect(() => lastTemplate[0]?.click?.()).not.toThrow()
      // Click fires startBrowserDownload synchronously, but the
      // rejection lands on the next microtask — flush it.
      await Promise.resolve()
      await Promise.resolve()
      expect(errorSpy).toHaveBeenCalledWith(
        '[browser-context-menu] save image failed:',
        expect.any(Error)
      )
    } finally {
      errorSpy.mockRestore()
    }
  })
})
