/**
 * TD-026: integration tests for the dialog IPC layer.
 *
 * `electron` is mocked at the module boundary so we can drive
 * `dialog.showOpenDialog` returns and assert the handler picks the
 * right branch (canceled / writable / not-writable). Writability is
 * exercised against real filesystem temp dirs — picking a path under
 * a chmod 0o555 directory is the cheapest cross-platform stand-in
 * for `/System` that doesn't require root.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chmodSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const showOpenDialogMock = vi.fn()
const showItemInFolderSpy = vi.fn()
const ipcHandlers = new Map<
  string,
  (event: unknown, ...args: unknown[]) => unknown | Promise<unknown>
>()

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: () => null
  },
  dialog: {
    showOpenDialog: (...args: unknown[]) => showOpenDialogMock(...args)
  },
  ipcMain: {
    handle: (
      channel: string,
      handler: (event: unknown, ...args: unknown[]) => unknown | Promise<unknown>
    ): void => {
      ipcHandlers.set(channel, handler)
    }
  },
  shell: {
    showItemInFolder: showItemInFolderSpy
  }
}))

const { THUNDER_IPC_CHANNELS } = await import('../../../preload/thunder-api')

type OpenDirResult =
  | { canceled: true }
  | { canceled: false; error: 'not-writable' }
  | { canceled: false; path: string }

async function callOpenDirectory(): Promise<OpenDirResult> {
  const handler = ipcHandlers.get(THUNDER_IPC_CHANNELS.dialogOpenDirectory)
  if (!handler) throw new Error('open-directory handler not registered')
  // The handler pulls `event.sender` for window attachment; pass a
  // stub so the call doesn't blow up reaching for a missing field.
  return (await handler({ sender: {} })) as OpenDirResult
}

async function callShowItemInFolder(args: unknown): Promise<void> {
  const handler = ipcHandlers.get(THUNDER_IPC_CHANNELS.dialogShowItemInFolder)
  if (!handler) throw new Error('show-item-in-folder handler not registered')
  await handler({}, args)
}

describe('dialog IPC (TD-026)', () => {
  let tempDir = ''

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'thunder-dialog-'))
    showOpenDialogMock.mockReset()
    showItemInFolderSpy.mockReset()
    ipcHandlers.clear()
    vi.resetModules()
    const mod = await import('../dialog')
    mod.registerDialogHandlers()
  })

  afterEach(() => {
    // chmod back so rmSync can recurse into any read-only fixtures.
    try {
      chmodSync(tempDir, 0o755)
    } catch {
      /* already writable / already gone */
    }
    rmSync(tempDir, { recursive: true, force: true })
  })

  // ─── open-directory: cancel path ──────────────────────────────────

  it('returns { canceled: true } when the user dismisses the picker', async () => {
    showOpenDialogMock.mockResolvedValue({ canceled: true, filePaths: [] })
    const result = await callOpenDirectory()
    expect(result).toEqual({ canceled: true })
  })

  it('returns { canceled: true } when filePaths is empty even with canceled=false', async () => {
    // Defensive: Electron's contract is canceled XOR filePaths, but a
    // future Electron change shouldn't accidentally hand the renderer
    // an `undefined` path.
    showOpenDialogMock.mockResolvedValue({ canceled: false, filePaths: [] })
    const result = await callOpenDirectory()
    expect(result).toEqual({ canceled: true })
  })

  // ─── open-directory: writable path ────────────────────────────────

  it('returns the chosen path when the folder is writable', async () => {
    showOpenDialogMock.mockResolvedValue({ canceled: false, filePaths: [tempDir] })
    const result = await callOpenDirectory()
    expect(result).toEqual({ canceled: false, path: tempDir })
  })

  it('cleans up the write-probe file on success', async () => {
    showOpenDialogMock.mockResolvedValue({ canceled: false, filePaths: [tempDir] })
    await callOpenDirectory()
    // No .thunder-write-probe-* files should remain.
    const leftovers = readdirSync(tempDir).filter((f) => f.startsWith('.thunder-write-probe-'))
    expect(leftovers).toEqual([])
  })

  // ─── open-directory: non-writable path ────────────────────────────

  it("returns { error: 'not-writable' } when the folder rejects writes", async () => {
    // chmod 0o555 = r-x for owner: writeFile inside fails on macOS/Linux.
    // Skip-equivalent on platforms where chmod is a no-op (Windows in CI):
    // we still want the negative path covered so use a non-existent
    // subdir as a second fallback that fails on every platform.
    chmodSync(tempDir, 0o555)
    showOpenDialogMock.mockResolvedValue({ canceled: false, filePaths: [tempDir] })
    let result = await callOpenDirectory()
    if ('path' in result) {
      // chmod didn't take (likely Windows) — retry with a path that
      // can't possibly accept a write.
      const bogus = join(tempDir, 'does-not-exist')
      showOpenDialogMock.mockResolvedValue({ canceled: false, filePaths: [bogus] })
      result = await callOpenDirectory()
    }
    expect(result).toEqual({ canceled: false, error: 'not-writable' })
  })

  // ─── show-item-in-folder: validation ──────────────────────────────

  it('throws when args is not an object', async () => {
    await expect(callShowItemInFolder(null)).rejects.toThrow(/show-item-in-folder/)
    expect(showItemInFolderSpy).not.toHaveBeenCalled()
  })

  it('throws when path is missing or empty', async () => {
    await expect(callShowItemInFolder({})).rejects.toThrow(/non-empty string/)
    await expect(callShowItemInFolder({ path: '' })).rejects.toThrow(/non-empty string/)
    await expect(callShowItemInFolder({ path: 42 })).rejects.toThrow(/non-empty string/)
    expect(showItemInFolderSpy).not.toHaveBeenCalled()
  })

  it('forwards a valid path to shell.showItemInFolder', async () => {
    await callShowItemInFolder({ path: '/Users/example/Downloads/clip.mp4' })
    expect(showItemInFolderSpy).toHaveBeenCalledWith('/Users/example/Downloads/clip.mp4')
  })
})
