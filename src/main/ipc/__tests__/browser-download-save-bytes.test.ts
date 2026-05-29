/**
 * TD-047: tests for `saveImageBytes` — the raw-bytes save path used by
 * the context menu for decoded `data:` images and blob bytes fetched
 * from the webview. It reuses the download folder, the collision-safe
 * path resolver, and the drawer `complete` fan-out, but writes bytes
 * directly instead of streaming over the network.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const sendSpy = vi.fn()
const ipcHandlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()

let mockSession: EventEmitter & { downloadURL: ReturnType<typeof vi.fn> }
let tempUserData = ''
let tempDownloads = ''

vi.mock('electron', () => {
  const cookies = { get: vi.fn(async () => []) }
  const sess = Object.assign(new EventEmitter(), { downloadURL: vi.fn(), cookies })
  mockSession = sess as typeof mockSession
  return {
    app: {
      getPath: (key: string): string => {
        if (key === 'userData') return tempUserData
        if (key === 'downloads') return tempDownloads
        return tmpdir()
      },
      isPackaged: false
    },
    BrowserWindow: {
      getFocusedWindow: () => ({
        isDestroyed: () => false,
        webContents: { isDestroyed: () => false, send: sendSpy }
      }),
      getAllWindows: () => []
    },
    ipcMain: {
      handle: (channel: string, handler: (event: unknown, ...args: unknown[]) => unknown) => {
        ipcHandlers.set(channel, handler)
      }
    },
    session: { fromPartition: () => mockSession },
    shell: { showItemInFolder: vi.fn() }
  }
})

vi.mock('../browser-download-hls', () => ({
  resolveBundledFfmpegPath: () => '/fake/ffmpeg',
  startHlsDownload: () => ({ cancel: vi.fn() })
}))

const { THUNDER_IPC_CHANNELS } = await import('../../../preload/thunder-api')

interface DownloadHandlers {
  saveImageBytes: (args: { bytes: Buffer; suggestedFilename: string }) => Promise<{ id: string }>
}
let handlers: DownloadHandlers

function downloadFolder(): string {
  return join(tempDownloads, 'Thunder')
}

function completeCalls(): Array<{ id: string; state: string; savePath: string }> {
  return sendSpy.mock.calls
    .filter((c) => c[0] === THUNDER_IPC_CHANNELS.browserDownloadComplete)
    .map((c) => c[1] as { id: string; state: string; savePath: string })
}

describe('saveImageBytes (TD-047)', () => {
  beforeEach(async () => {
    tempUserData = mkdtempSync(join(tmpdir(), 'thunder-bytes-userdata-'))
    tempDownloads = mkdtempSync(join(tmpdir(), 'thunder-bytes-downloads-'))
    sendSpy.mockReset()
    ipcHandlers.clear()
    vi.resetModules()
    const mod = await import('../browser-download')
    mockSession.removeAllListeners()
    handlers = mod.registerBrowserDownloadHandlers()
  })

  afterEach(() => {
    rmSync(tempUserData, { recursive: true, force: true })
    rmSync(tempDownloads, { recursive: true, force: true })
  })

  it('writes the bytes to the configured download folder', async () => {
    const bytes = Buffer.from([0x47, 0x49, 0x46, 0x38])
    const { id } = await handlers.saveImageBytes({ bytes, suggestedFilename: 'image.gif' })
    const expectedPath = join(downloadFolder(), 'image.gif')
    expect(existsSync(expectedPath)).toBe(true)
    expect(readFileSync(expectedPath).equals(bytes)).toBe(true)
    expect(typeof id).toBe('string')
  })

  it('fans out a single completed event with the save path', async () => {
    const bytes = Buffer.from([1, 2, 3])
    const { id } = await handlers.saveImageBytes({ bytes, suggestedFilename: 'image.png' })
    const completes = completeCalls()
    expect(completes).toHaveLength(1)
    expect(completes[0]).toMatchObject({
      id,
      state: 'completed',
      savePath: join(downloadFolder(), 'image.png')
    })
  })

  it('resolves a collision-safe path when the name is taken', async () => {
    mkdirSync(downloadFolder(), { recursive: true })
    writeFileSync(join(downloadFolder(), 'image.gif'), '')
    await handlers.saveImageBytes({ bytes: Buffer.from([9]), suggestedFilename: 'image.gif' })
    expect(existsSync(join(downloadFolder(), 'image (2).gif'))).toBe(true)
  })

  it('strips path components from the suggested filename (no traversal)', async () => {
    await handlers.saveImageBytes({
      bytes: Buffer.from([0]),
      suggestedFilename: '../../evil.png'
    })
    expect(existsSync(join(downloadFolder(), 'evil.png'))).toBe(true)
  })

  it('rejects a filename with no usable basename', async () => {
    await expect(
      handlers.saveImageBytes({ bytes: Buffer.from([0]), suggestedFilename: '..' })
    ).rejects.toThrow(/no usable basename/)
  })
})
