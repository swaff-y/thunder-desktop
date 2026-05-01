/**
 * TD-024: integration tests for the download manager IPC layer.
 *
 * `electron` is mocked at the module boundary so we can drive the
 * `will-download` event manually and observe `webContents.send` /
 * `shell.showItemInFolder`. The fake `DownloadItem` is a plain
 * EventEmitter with the small subset of `DownloadItem` methods the
 * production code exercises.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const sendSpy = vi.fn()
const showItemInFolderSpy = vi.fn()
const ipcHandlers = new Map<
  string,
  (event: unknown, ...args: unknown[]) => unknown | Promise<unknown>
>()

let mockSession: EventEmitter & { downloadURL: ReturnType<typeof vi.fn> }
let tempUserData = ''
let tempDownloads = ''

vi.mock('electron', () => {
  const sess = Object.assign(new EventEmitter(), { downloadURL: vi.fn() })
  mockSession = sess as typeof mockSession
  return {
    app: {
      getPath: (key: string): string => {
        if (key === 'userData') return tempUserData
        if (key === 'downloads') return tempDownloads
        return tmpdir()
      }
    },
    BrowserWindow: {
      getFocusedWindow: () => ({
        isDestroyed: () => false,
        webContents: {
          isDestroyed: () => false,
          send: sendSpy
        }
      }),
      getAllWindows: () => []
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
      fromPartition: () => mockSession
    },
    shell: {
      showItemInFolder: showItemInFolderSpy
    }
  }
})

// Channel constants are pure — import once.
const { THUNDER_IPC_CHANNELS } = await import('../../../preload/thunder-api')

// `browser-download` memoises `cachedSettingsPath` / `cachedDefaults`
// at module scope (legitimate in production, tied to `app.getPath`).
// Re-imported per test so each test gets fresh module state pointing
// at its own temp dirs.
let registerBrowserDownloadHandlers: () => void

interface FakeItem extends EventEmitter {
  getURL: () => string
  setSavePath: (p: string) => void
  getSavePath: () => string
  getReceivedBytes: () => number
  getTotalBytes: () => number
  cancel: ReturnType<typeof vi.fn>
  __setBytes: (received: number, total: number) => void
}

function makeFakeItem(url: string, totalBytes = 100): FakeItem {
  const item = new EventEmitter() as FakeItem
  let savePath = ''
  let received = 0
  let total = totalBytes
  item.getURL = (): string => url
  item.setSavePath = (p): void => {
    savePath = p
  }
  item.getSavePath = (): string => savePath
  item.getReceivedBytes = (): number => received
  item.getTotalBytes = (): number => total
  item.cancel = vi.fn()
  item.__setBytes = (r, t): void => {
    received = r
    total = t
  }
  return item
}

function downloadFolder(): string {
  return join(tempDownloads, 'Thunder')
}

async function callStart(args: { assetUrl: string; suggestedFilename: string }): Promise<{
  id: string
}> {
  const handler = ipcHandlers.get(THUNDER_IPC_CHANNELS.browserDownloadStart)
  if (!handler) throw new Error('start handler not registered')
  return (await handler({}, args)) as { id: string }
}

async function callCancel(args: { id: string }): Promise<void> {
  const handler = ipcHandlers.get(THUNDER_IPC_CHANNELS.browserDownloadCancel)
  if (!handler) throw new Error('cancel handler not registered')
  await handler({}, args)
}

async function callShowInFolder(args: { id: string }): Promise<void> {
  const handler = ipcHandlers.get(THUNDER_IPC_CHANNELS.browserDownloadShowInFolder)
  if (!handler) throw new Error('show-in-folder handler not registered')
  await handler({}, args)
}

describe('browser-download IPC (TD-024)', () => {
  beforeEach(async () => {
    tempUserData = mkdtempSync(join(tmpdir(), 'thunder-dl-userdata-'))
    tempDownloads = mkdtempSync(join(tmpdir(), 'thunder-dl-downloads-'))
    sendSpy.mockReset()
    showItemInFolderSpy.mockReset()
    ipcHandlers.clear()
    // Reset module state — including the path/defaults memoisation.
    // The vi.mock factory is shared across resetModules in vitest, so
    // `mockSession` persists; clear its listeners before the handler
    // re-attaches to avoid a MaxListenersExceededWarning across tests.
    vi.resetModules()
    const mod = await import('../browser-download')
    mockSession.removeAllListeners()
    mockSession.downloadURL.mockReset()
    registerBrowserDownloadHandlers = mod.registerBrowserDownloadHandlers
    registerBrowserDownloadHandlers()
  })

  afterEach(() => {
    rmSync(tempUserData, { recursive: true, force: true })
    rmSync(tempDownloads, { recursive: true, force: true })
  })

  // ─── start: validation ────────────────────────────────────────────

  it('throws when assetUrl is missing or empty', async () => {
    await expect(callStart({ assetUrl: '', suggestedFilename: 'a.mp4' })).rejects.toThrow(
      /assetUrl/
    )
  })

  it('throws when suggestedFilename is missing or empty', async () => {
    await expect(callStart({ assetUrl: 'https://x/a', suggestedFilename: '' })).rejects.toThrow(
      /suggestedFilename/
    )
  })

  // ─── start: path traversal hardening ──────────────────────────────

  it('strips path components from suggestedFilename (prevents traversal)', async () => {
    await callStart({
      assetUrl: 'https://x/evil',
      suggestedFilename: '../../etc/evil.sh'
    })
    const item = makeFakeItem('https://x/evil')
    mockSession.emit('will-download', {}, item)
    // basename('../../etc/evil.sh') === 'evil.sh' — so the file lands
    // inside the configured download folder, not in `/etc`.
    expect(item.getSavePath()).toBe(join(downloadFolder(), 'evil.sh'))
  })

  it('rejects suggestedFilenames whose basename is "/" or "." or ".."', async () => {
    await expect(callStart({ assetUrl: 'https://x/a', suggestedFilename: '/' })).rejects.toThrow(
      /no usable basename/
    )
    await expect(callStart({ assetUrl: 'https://x/a', suggestedFilename: '..' })).rejects.toThrow(
      /no usable basename/
    )
    await expect(callStart({ assetUrl: 'https://x/a', suggestedFilename: '.' })).rejects.toThrow(
      /no usable basename/
    )
  })

  // ─── start: collision safety + downloadURL ────────────────────────

  it('resolves a collision-safe path and triggers session.downloadURL', async () => {
    mkdirSync(downloadFolder(), { recursive: true })
    writeFileSync(join(downloadFolder(), 'clip.mp4'), '')
    const { id } = await callStart({
      assetUrl: 'https://x/clip.mp4',
      suggestedFilename: 'clip.mp4'
    })
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
    expect(mockSession.downloadURL).toHaveBeenCalledWith('https://x/clip.mp4')

    const item = makeFakeItem('https://x/clip.mp4')
    mockSession.emit('will-download', {}, item)
    expect(item.getSavePath()).toBe(join(downloadFolder(), 'clip (2).mp4'))
  })

  // ─── will-download: correlation ───────────────────────────────────

  it('correlates concurrent same-URL starts to DownloadItems in FIFO order', async () => {
    const url = 'https://x/clip.mp4'
    const a = await callStart({ assetUrl: url, suggestedFilename: 'a.mp4' })
    const b = await callStart({ assetUrl: url, suggestedFilename: 'b.mp4' })
    const itemA = makeFakeItem(url)
    const itemB = makeFakeItem(url)
    mockSession.emit('will-download', {}, itemA)
    mockSession.emit('will-download', {}, itemB)
    expect(itemA.getSavePath()).toBe(join(downloadFolder(), 'a.mp4'))
    expect(itemB.getSavePath()).toBe(join(downloadFolder(), 'b.mp4'))
    expect(a.id).not.toBe(b.id)
  })

  it('ignores will-download events for URLs we never started', async () => {
    const item = makeFakeItem('https://other/orphan.mp4')
    mockSession.emit('will-download', {}, item)
    expect(item.getSavePath()).toBe('') // setSavePath never called
  })

  // ─── progress throttling ──────────────────────────────────────────

  it('throttles progress events to ≤4/sec', async () => {
    let now = 1_000_000
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => now)
    try {
      await callStart({ assetUrl: 'https://x/c.mp4', suggestedFilename: 'c.mp4' })
      const item = makeFakeItem('https://x/c.mp4')
      mockSession.emit('will-download', {}, item)

      // 5 events at the same instant — only the first should fan out.
      for (let i = 0; i < 5; i++) item.emit('updated', {}, 'progressing')
      const progressCalls = (): number =>
        sendSpy.mock.calls.filter((c) => c[0] === THUNDER_IPC_CHANNELS.browserDownloadProgress)
          .length
      expect(progressCalls()).toBe(1)

      // 100ms later — still within the 250ms window.
      now += 100
      item.emit('updated', {}, 'progressing')
      expect(progressCalls()).toBe(1)

      // 300ms after the original — past the window.
      now += 200
      item.emit('updated', {}, 'progressing')
      expect(progressCalls()).toBe(2)
    } finally {
      spy.mockRestore()
    }
  })

  it('progress payload carries id, byte counts, and state', async () => {
    await callStart({ assetUrl: 'https://x/c.mp4', suggestedFilename: 'c.mp4' })
    const item = makeFakeItem('https://x/c.mp4', 1000)
    mockSession.emit('will-download', {}, item)
    item.__setBytes(250, 1000)
    item.emit('updated', {}, 'progressing')
    expect(sendSpy).toHaveBeenCalledWith(
      THUNDER_IPC_CHANNELS.browserDownloadProgress,
      expect.objectContaining({
        receivedBytes: 250,
        totalBytes: 1000,
        state: 'progressing'
      })
    )
  })

  // ─── done: completed ──────────────────────────────────────────────

  it('fans out complete event and retains savePath after done(completed)', async () => {
    const { id } = await callStart({
      assetUrl: 'https://x/c.mp4',
      suggestedFilename: 'c.mp4'
    })
    const item = makeFakeItem('https://x/c.mp4')
    mockSession.emit('will-download', {}, item)
    item.emit('done', {}, 'completed')

    expect(sendSpy).toHaveBeenCalledWith(
      THUNDER_IPC_CHANNELS.browserDownloadComplete,
      expect.objectContaining({ id, state: 'completed', savePath: item.getSavePath() })
    )

    // show-in-folder still resolves post-completion via the savePath cache
    await callShowInFolder({ id })
    expect(showItemInFolderSpy).toHaveBeenCalledTimes(1)
    expect(showItemInFolderSpy).toHaveBeenCalledWith(item.getSavePath())
  })

  // ─── done: cancelled ──────────────────────────────────────────────

  it('removes partial file and drops savePath on done(cancelled)', async () => {
    const { id } = await callStart({
      assetUrl: 'https://x/c.mp4',
      suggestedFilename: 'c.mp4'
    })
    const item = makeFakeItem('https://x/c.mp4')
    mockSession.emit('will-download', {}, item)
    writeFileSync(item.getSavePath(), 'partial-bytes')
    expect(existsSync(item.getSavePath())).toBe(true)

    item.emit('done', {}, 'cancelled')
    expect(existsSync(item.getSavePath())).toBe(false)
    expect(sendSpy).toHaveBeenCalledWith(
      THUNDER_IPC_CHANNELS.browserDownloadComplete,
      expect.objectContaining({ id, state: 'cancelled' })
    )

    // show-in-folder is a no-op for cancelled downloads
    await callShowInFolder({ id })
    expect(showItemInFolderSpy).not.toHaveBeenCalled()
  })

  it('survives a missing partial file on done(cancelled) (ENOENT swallowed)', async () => {
    await callStart({ assetUrl: 'https://x/c.mp4', suggestedFilename: 'c.mp4' })
    const item = makeFakeItem('https://x/c.mp4')
    mockSession.emit('will-download', {}, item)
    // No file written. done(cancelled) should still fan out, not throw.
    expect(() => item.emit('done', {}, 'cancelled')).not.toThrow()
  })

  // ─── cancel ───────────────────────────────────────────────────────

  it('cancel forwards to item.cancel() for in-flight downloads', async () => {
    const { id } = await callStart({
      assetUrl: 'https://x/c.mp4',
      suggestedFilename: 'c.mp4'
    })
    const item = makeFakeItem('https://x/c.mp4')
    mockSession.emit('will-download', {}, item)
    await callCancel({ id })
    expect(item.cancel).toHaveBeenCalledTimes(1)
  })

  it('cancel is a no-op for unknown ids', async () => {
    await expect(callCancel({ id: 'nope' })).resolves.toBeUndefined()
  })

  // ─── pendingByUrl timeout ─────────────────────────────────────────

  it('prunes pendingByUrl entry when will-download never fires', async () => {
    vi.useFakeTimers()
    try {
      await callStart({ assetUrl: 'https://x/orphan.mp4', suggestedFilename: 'o.mp4' })
      // Advance past the will-download timeout — pending entry should
      // be cleaned up so a late will-download won't bind to a stale id.
      vi.advanceTimersByTime(31_000)
      const item = makeFakeItem('https://x/orphan.mp4')
      mockSession.emit('will-download', {}, item)
      expect(item.getSavePath()).toBe('') // setSavePath never called
    } finally {
      vi.useRealTimers()
    }
  })

  // ─── savePathById cap ─────────────────────────────────────────────

  it('evicts the oldest savePath entry once the cache exceeds its cap', async () => {
    // SAVE_PATH_CACHE_MAX is 256 in the impl; this exercises that
    // boundary without exporting the constant.
    const CAP = 256
    const ids: string[] = []
    for (let i = 0; i <= CAP; i++) {
      const url = `https://x/file-${i}.mp4`
      const { id } = await callStart({ assetUrl: url, suggestedFilename: `f-${i}.mp4` })
      ids.push(id)
      const item = makeFakeItem(url)
      mockSession.emit('will-download', {}, item)
      item.emit('done', {}, 'completed')
    }
    showItemInFolderSpy.mockReset()
    // Oldest id should have been evicted (the cache holds the most
    // recent CAP entries).
    await callShowInFolder({ id: ids[0] })
    expect(showItemInFolderSpy).not.toHaveBeenCalled()
    // Most recent id is still resolvable.
    await callShowInFolder({ id: ids[ids.length - 1] })
    expect(showItemInFolderSpy).toHaveBeenCalledTimes(1)
  })
})
