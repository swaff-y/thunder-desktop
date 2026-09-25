/**
 * TD-047 / TD-091: tests for the context-menu IPC handler. The Electron
 * `Menu` / `webContents` / `session` surfaces are mocked so we can
 * observe what template would be built, whether `popup` is called, what
 * the invoke resolves with, and which arguments make it through to the
 * download pipeline (streamed http(s)) or the raw-bytes path
 * (data:/blob:).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const browserSession = { __tag: 'browser' as const }
const otherSession = { __tag: 'other' as const }

interface MockGuest {
  isDestroyed: () => boolean
  session: object
  executeJavaScript: ReturnType<typeof vi.fn>
}
let mockGuest: MockGuest | undefined
let focusedWindow: { isDestroyed: () => boolean } | null = {
  isDestroyed: (): boolean => false
}

const popupSpy = vi.fn()
const buildFromTemplateSpy = vi.fn()
let lastTemplate: Array<{ label?: string; type?: string; click?: () => void }> = []
/**
 * Label of the item to click while the menu is open, mirroring
 * Electron's ordering: the click handler runs, then `popup`'s close
 * callback. Null means the user dismissed the menu without choosing.
 */
let clickWhileOpen: string | null = null

const ipcHandlers = new Map<
  string,
  (event: unknown, ...args: unknown[]) => unknown | Promise<unknown>
>()

vi.mock('electron', () => ({
  BrowserWindow: {
    getFocusedWindow: () => focusedWindow
  },
  Menu: {
    buildFromTemplate: (template: Array<{ label?: string; type?: string; click?: () => void }>) => {
      buildFromTemplateSpy(template)
      lastTemplate = template
      return {
        popup: (options: { window: unknown; callback?: () => void }) => {
          popupSpy(options)
          if (clickWhileOpen !== null) {
            lastTemplate.find((item) => item.label === clickWhileOpen)?.click?.()
          }
          options.callback?.()
        }
      }
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
type ThunderContextMenuResult = import('../../../preload/thunder-api').ThunderContextMenuResult

type StartBrowserDownload = (args: {
  assetUrl: string
  suggestedFilename: string
  mimeType?: string
  referer?: string
}) => Promise<{ id: string; queued: boolean }>

type SaveImageBytes = (args: {
  bytes: Buffer
  suggestedFilename: string
}) => Promise<{ id: string }>

let startBrowserDownload: ReturnType<typeof vi.fn<StartBrowserDownload>>
let saveImageBytes: ReturnType<typeof vi.fn<SaveImageBytes>>
let registerBrowserContextMenuHandlers: typeof import('../browser-context-menu').registerBrowserContextMenuHandlers
let deriveImageFilename: typeof import('../browser-context-menu').deriveImageFilename

async function callShow(args: unknown): Promise<ThunderContextMenuResult> {
  const handler = ipcHandlers.get(THUNDER_IPC_CHANNELS.browserContextMenuShow)
  if (!handler) throw new Error('context-menu show handler not registered')
  return (await handler({}, args)) as ThunderContextMenuResult
}

// Click handlers kick off async work (saveImage) via `void ...catch`.
// Flush the microtask/timer queue so the dispatch has run before we
// assert against it.
async function clickAndFlush(): Promise<void> {
  lastTemplate[0]?.click?.()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('browser-context-menu (TD-047, TD-091)', () => {
  beforeEach(async () => {
    popupSpy.mockReset()
    buildFromTemplateSpy.mockReset()
    lastTemplate = []
    clickWhileOpen = null
    ipcHandlers.clear()
    mockGuest = {
      isDestroyed: (): boolean => false,
      session: browserSession,
      executeJavaScript: vi.fn()
    }
    focusedWindow = { isDestroyed: (): boolean => false }
    startBrowserDownload = vi.fn<StartBrowserDownload>(async () => ({
      id: 'fake-id',
      queued: false
    }))
    saveImageBytes = vi.fn<SaveImageBytes>(async () => ({ id: 'bytes-id' }))
    vi.resetModules()
    const mod = await import('../browser-context-menu')
    registerBrowserContextMenuHandlers = mod.registerBrowserContextMenuHandlers
    deriveImageFilename = mod.deriveImageFilename
    registerBrowserContextMenuHandlers({ startBrowserDownload, saveImageBytes })
  })

  afterEach(async () => {
    // The menu "click" handler is fire-and-forget (`void saveImage(...)`),
    // so its async chain (decode / blob fetch → saveImageBytes) can still
    // be in flight when the test body finishes. Drain the microtask +
    // macrotask queues before the next test resets the shared spies, so a
    // straggler from one test can't land against the next test's mocks.
    await new Promise((resolve) => setTimeout(resolve, 0))
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
    mockGuest = {
      isDestroyed: (): boolean => false,
      session: otherSession,
      executeJavaScript: vi.fn()
    }
    await callShow({
      webContentsId: 42,
      mediaType: 'image',
      srcURL: 'https://cdn.example.com/p.jpg',
      pageURL: 'https://example.com/',
      linkURL: ''
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
      pageURL: 'https://example.com/',
      linkURL: ''
    })
    expect(buildFromTemplateSpy).not.toHaveBeenCalled()
  })

  it('does nothing when the resolved webContents is destroyed', async () => {
    // TOCTOU: guest tore down between the right-click and the IPC
    // landing. Don't try to interact with a dead webContents.
    mockGuest = {
      isDestroyed: (): boolean => true,
      session: browserSession,
      executeJavaScript: vi.fn()
    }
    await callShow({
      webContentsId: 42,
      mediaType: 'image',
      srcURL: 'https://cdn.example.com/p.jpg',
      pageURL: 'https://example.com/',
      linkURL: ''
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
      pageURL: 'https://x/',
      linkURL: ''
    })
    expect(buildFromTemplateSpy).not.toHaveBeenCalled()
  })

  // ─── AC3: non-image right-click ───────────────────────────────────

  it('does nothing when mediaType is not image', async () => {
    await callShow({
      webContentsId: 42,
      mediaType: 'none',
      srcURL: 'https://cdn.example.com/p.jpg',
      pageURL: 'https://example.com/',
      linkURL: ''
    })
    expect(buildFromTemplateSpy).not.toHaveBeenCalled()
    expect(startBrowserDownload).not.toHaveBeenCalled()
  })

  it('does nothing for an unsupported scheme (e.g. file:)', async () => {
    await callShow({
      webContentsId: 42,
      mediaType: 'image',
      srcURL: 'file:///etc/passwd',
      pageURL: 'https://example.com/',
      linkURL: ''
    })
    expect(buildFromTemplateSpy).not.toHaveBeenCalled()
  })

  // ─── AC1: native menu is built and popped ─────────────────────────

  it('builds a single "Save image" item and pops the menu on the focused window', async () => {
    await callShow({
      webContentsId: 42,
      mediaType: 'image',
      srcURL: 'https://cdn.example.com/photo.jpg',
      pageURL: 'https://example.com/page',
      linkURL: ''
    })
    expect(buildFromTemplateSpy).toHaveBeenCalledTimes(1)
    expect(lastTemplate).toHaveLength(1)
    expect(lastTemplate[0]?.label).toBe('Save image')
    expect(popupSpy).toHaveBeenCalledWith(expect.objectContaining({ window: focusedWindow }))
  })

  it('does not pop the menu when no window is focused', async () => {
    focusedWindow = null
    await callShow({
      webContentsId: 42,
      mediaType: 'image',
      srcURL: 'https://cdn.example.com/photo.jpg',
      pageURL: 'https://example.com/page',
      linkURL: ''
    })
    expect(popupSpy).not.toHaveBeenCalled()
  })

  it('does not pop the menu when the focused window is destroyed', async () => {
    focusedWindow = { isDestroyed: (): boolean => true }
    await callShow({
      webContentsId: 42,
      mediaType: 'image',
      srcURL: 'https://cdn.example.com/photo.jpg',
      pageURL: 'https://example.com/page',
      linkURL: ''
    })
    expect(popupSpy).not.toHaveBeenCalled()
  })

  // ─── AC2 + AC5: http(s) click triggers streamed download ──────────

  it('click invokes startBrowserDownload with derived filename + referer', async () => {
    await callShow({
      webContentsId: 42,
      mediaType: 'image',
      srcURL: 'https://cdn.example.com/photo.jpg',
      pageURL: 'https://example.com/page',
      linkURL: ''
    })
    await clickAndFlush()
    expect(startBrowserDownload).toHaveBeenCalledWith({
      assetUrl: 'https://cdn.example.com/photo.jpg',
      suggestedFilename: 'photo.jpg',
      referer: 'https://example.com/page'
    })
    expect(saveImageBytes).not.toHaveBeenCalled()
  })

  it('drops the referer when pageURL is not http(s)', async () => {
    await callShow({
      webContentsId: 42,
      mediaType: 'image',
      srcURL: 'https://cdn.example.com/photo.jpg',
      pageURL: 'about:blank',
      linkURL: ''
    })
    await clickAndFlush()
    expect(startBrowserDownload).toHaveBeenCalledWith({
      assetUrl: 'https://cdn.example.com/photo.jpg',
      suggestedFilename: 'photo.jpg',
      referer: undefined
    })
  })

  it('swallows rejections from the dispatch so a failed save does not crash main', async () => {
    startBrowserDownload.mockRejectedValueOnce(new Error('disk full'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await callShow({
        webContentsId: 42,
        mediaType: 'image',
        srcURL: 'https://cdn.example.com/photo.jpg',
        pageURL: 'https://example.com/',
        linkURL: ''
      })
      await clickAndFlush()
      expect(errorSpy).toHaveBeenCalledWith(
        '[browser-context-menu] save image failed:',
        expect.any(Error)
      )
    } finally {
      errorSpy.mockRestore()
    }
  })

  // ─── AC4: data: images save via decoded bytes ─────────────────────

  it('shows the menu for a data: image and saves the decoded bytes', async () => {
    const original = Buffer.from([0x47, 0x49, 0x46, 0x38]) // "GIF8"
    await callShow({
      webContentsId: 42,
      mediaType: 'image',
      srcURL: `data:image/gif;base64,${original.toString('base64')}`,
      pageURL: 'https://example.com/',
      linkURL: ''
    })
    expect(buildFromTemplateSpy).toHaveBeenCalledTimes(1)
    await clickAndFlush()
    expect(startBrowserDownload).not.toHaveBeenCalled()
    expect(saveImageBytes).toHaveBeenCalledTimes(1)
    const arg = saveImageBytes.mock.calls[0]?.[0]
    expect(arg?.suggestedFilename).toBe('image.gif')
    expect(Buffer.isBuffer(arg?.bytes)).toBe(true)
    expect(arg?.bytes.equals(original)).toBe(true)
  })

  it('does not save a data: URL with a non-image MIME (fail closed)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await callShow({
        webContentsId: 42,
        mediaType: 'image',
        srcURL: 'data:text/plain;base64,aGVsbG8=',
        pageURL: 'https://example.com/',
        linkURL: ''
      })
      // The menu still shows (scheme is data:), but the click writes
      // nothing because decode returns null.
      expect(buildFromTemplateSpy).toHaveBeenCalledTimes(1)
      await clickAndFlush()
      expect(saveImageBytes).not.toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
    }
  })

  // ─── AC4: blob: images save via webview fetch ─────────────────────

  it('shows the menu for a blob: image and saves bytes fetched from the webview', async () => {
    const original = Buffer.from([0x89, 0x50, 0x4e, 0x47]) // PNG magic
    mockGuest = {
      isDestroyed: (): boolean => false,
      session: browserSession,
      executeJavaScript: vi.fn(async () => ({
        base64: original.toString('base64'),
        mime: 'image/png'
      }))
    }
    await callShow({
      webContentsId: 42,
      mediaType: 'image',
      srcURL: 'blob:https://example.com/abc-123',
      pageURL: 'https://example.com/',
      linkURL: ''
    })
    expect(buildFromTemplateSpy).toHaveBeenCalledTimes(1)
    await clickAndFlush()
    expect(mockGuest.executeJavaScript).toHaveBeenCalledTimes(1)
    expect(saveImageBytes).toHaveBeenCalledTimes(1)
    const arg = saveImageBytes.mock.calls[0]?.[0]
    expect(arg?.suggestedFilename).toBe('image.png')
    expect(arg?.bytes.equals(original)).toBe(true)
  })

  it('does not save a blob: image when the webview fetch yields a non-image type', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGuest = {
      isDestroyed: (): boolean => false,
      session: browserSession,
      executeJavaScript: vi.fn(async () => ({ base64: 'AAAA', mime: 'application/json' }))
    }
    try {
      await callShow({
        webContentsId: 42,
        mediaType: 'image',
        srcURL: 'blob:https://example.com/abc-123',
        pageURL: 'https://example.com/',
        linkURL: ''
      })
      await clickAndFlush()
      expect(saveImageBytes).not.toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('does not save a blob: image when the webview fetch throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGuest = {
      isDestroyed: (): boolean => false,
      session: browserSession,
      executeJavaScript: vi.fn(async () => {
        throw new Error('CSP blocked')
      })
    }
    try {
      await callShow({
        webContentsId: 42,
        mediaType: 'image',
        srcURL: 'blob:https://example.com/abc-123',
        pageURL: 'https://example.com/',
        linkURL: ''
      })
      await clickAndFlush()
      expect(saveImageBytes).not.toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
    }
  })

  // ─── TD-091: "Open link in new tab" ───────────────────────────────

  describe('open link in new tab (TD-091)', () => {
    const LINK = {
      webContentsId: 42,
      mediaType: 'none' as const,
      srcURL: '',
      pageURL: 'https://example.com/page',
      linkURL: 'https://example.com/target'
    }

    it('builds a single link item and resolves with the parsed URL when clicked', async () => {
      clickWhileOpen = 'Open link in new tab'
      const result = await callShow(LINK)
      expect(lastTemplate).toHaveLength(1)
      expect(lastTemplate[0]?.label).toBe('Open link in new tab')
      expect(result).toEqual({
        action: 'open-in-new-tab',
        url: 'https://example.com/target'
      })
      expect(startBrowserDownload).not.toHaveBeenCalled()
    })

    it('resolves with the re-serialised URL rather than the raw string', async () => {
      clickWhileOpen = 'Open link in new tab'
      const result = await callShow({ ...LINK, linkURL: 'https://example.com' })
      expect(result).toEqual({ action: 'open-in-new-tab', url: 'https://example.com/' })
    })

    it('resolves none when the menu is dismissed without a choice', async () => {
      const result = await callShow(LINK)
      expect(popupSpy).toHaveBeenCalledTimes(1)
      expect(result).toEqual({ action: 'none' })
    })

    it('settles once when a click is followed by the close callback', async () => {
      clickWhileOpen = 'Open link in new tab'
      // The mock fires `callback` after the click, as Electron does; the
      // later `none` must not overwrite the choice already resolved.
      const result = await callShow(LINK)
      expect(result).toEqual({ action: 'open-in-new-tab', url: 'https://example.com/target' })
    })

    it('offers no item for a non-http(s) link and pops no menu', async () => {
      for (const linkURL of ['javascript:alert(1)', 'file:///etc/passwd', 'mailto:a@b.c']) {
        buildFromTemplateSpy.mockClear()
        const result = await callShow({ ...LINK, linkURL })
        expect(buildFromTemplateSpy).not.toHaveBeenCalled()
        expect(result).toEqual({ action: 'none' })
      }
    })

    it('pops no menu for a right-click with neither a link nor a saveable image', async () => {
      const result = await callShow({ ...LINK, linkURL: '' })
      expect(buildFromTemplateSpy).not.toHaveBeenCalled()
      expect(result).toEqual({ action: 'none' })
    })

    it('rejects a request with no linkURL field as malformed', async () => {
      const result = await callShow({
        webContentsId: 42,
        mediaType: 'image',
        srcURL: 'https://cdn.example.com/photo.jpg',
        pageURL: 'https://example.com/'
      })
      expect(buildFromTemplateSpy).not.toHaveBeenCalled()
      expect(result).toEqual({ action: 'none' })
    })

    it('offers the link first, then the image, for a linked image', async () => {
      const result = await callShow({
        ...LINK,
        mediaType: 'image',
        srcURL: 'https://cdn.example.com/photo.jpg'
      })
      expect(lastTemplate.map((item) => item.label ?? item.type)).toEqual([
        'Open link in new tab',
        'separator',
        'Save image'
      ])
      expect(result).toEqual({ action: 'none' })
    })

    it('saves the image without proposing a tab when the image item is chosen', async () => {
      clickWhileOpen = 'Save image'
      const result = await callShow({
        ...LINK,
        mediaType: 'image',
        srcURL: 'https://cdn.example.com/photo.jpg'
      })
      expect(result).toEqual({ action: 'none' })
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(startBrowserDownload).toHaveBeenCalledWith({
        assetUrl: 'https://cdn.example.com/photo.jpg',
        suggestedFilename: 'photo.jpg',
        referer: 'https://example.com/page'
      })
    })

    it('still resolves none when the partition gate rejects the request', async () => {
      mockGuest = {
        isDestroyed: (): boolean => false,
        session: otherSession,
        executeJavaScript: vi.fn()
      }
      expect(await callShow(LINK)).toEqual({ action: 'none' })
    })
  })
})
