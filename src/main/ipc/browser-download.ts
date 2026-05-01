/**
 * TD-024: main-process download manager for the embedded Browser tab.
 *
 * Renderer asks `start({ assetUrl, suggestedFilename })`, main resolves
 * a collision-safe path under the configured download folder and calls
 * `session.fromPartition(THUNDER_BROWSER_PARTITION).downloadURL(url)`
 * — same partition the embedded webview uses, so cookies / auth ride
 * along automatically. Progress and completion events fan out via
 * `webContents.send` to the focused main window, mirroring
 * halo-desktop's auto-updater pattern.
 *
 * Correlating IDs to `DownloadItem`s: Electron's `will-download` event
 * doesn't carry a correlator from `downloadURL`. We maintain a small
 * URL-keyed FIFO queue (`pendingByUrl`): `start` enqueues, the single
 * persistent `will-download` listener dequeues. Multiple concurrent
 * downloads of the *same* URL are handled by FIFO order; concurrent
 * downloads of *different* URLs are independent. `will-download`
 * events for URLs we haven't queued (e.g., a future webview-initiated
 * download) are ignored — Electron falls back to its default
 * Save-As dialog, which is fine until that's a real use case.
 */

import { app, BrowserWindow, ipcMain, session, shell } from 'electron'
import type { DownloadItem, Event, Session } from 'electron'
import { mkdirSync, unlinkSync } from 'node:fs'
import { basename, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { THUNDER_BROWSER_PARTITION } from '../../shared/browser'
import { DEFAULT_API_URL, type ThunderSettings } from '../../shared/settings'
import { THUNDER_IPC_CHANNELS } from '../../preload/thunder-api'
import { resolveCollisionSafePath } from './browser-download-path'
import { getSetting } from './settings-io'

// Throttle progress events: at most one per item per window. The `done`
// event always fires separately and carries final state, so a missed
// trailing `updated` near the end of the transfer doesn't cost us
// information.
const PROGRESS_THROTTLE_MS = 250

// If `will-download` hasn't fired this long after `downloadURL`, the
// request almost certainly failed pre-headers (DNS, TCP reset, TLS
// error). Prune the queue entry so a long-running session doesn't
// accumulate orphaned `PendingStart`s. Generous enough to tolerate a
// slow proxy without false-positive cleanup.
const WILL_DOWNLOAD_TIMEOUT_MS = 30_000

// Soft cap on the savePath cache. `show-in-folder` needs savePath
// retained past `done`, but unbounded retention turns the map into a
// slow leak across long sessions with heavy download history. FIFO
// eviction is sufficient — older completed downloads drop out of the
// renderer's UI list anyway.
const SAVE_PATH_CACHE_MAX = 256

interface PendingStart {
  id: string
  targetPath: string
  timeoutHandle: NodeJS.Timeout
}

interface DownloadProgressPayload {
  id: string
  receivedBytes: number
  totalBytes: number
  state: 'progressing' | 'interrupted'
}

interface DownloadCompletePayload {
  id: string
  state: 'completed' | 'cancelled' | 'interrupted'
  savePath: string
}

let cachedSettingsPath: string | null = null
let cachedDefaults: ThunderSettings | null = null

function settingsPath(): string {
  if (cachedSettingsPath === null) {
    cachedSettingsPath = join(app.getPath('userData'), 'thunder-desktop-settings.json')
  }
  return cachedSettingsPath
}

function defaults(): ThunderSettings {
  if (cachedDefaults === null) {
    cachedDefaults = {
      apiUrl: DEFAULT_API_URL,
      downloadFolder: join(app.getPath('downloads'), 'Thunder')
    }
  }
  return cachedDefaults
}

function sendToFocused(channel: string, payload: unknown): void {
  // Mirrors halo-desktop's updater fan-out: prefer the focused window,
  // but fall back to the first available so events still land if the
  // user clicked away (e.g., onto a video player) mid-download.
  const target = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
  if (target && !target.isDestroyed() && !target.webContents.isDestroyed()) {
    target.webContents.send(channel, payload)
  }
}

export function registerBrowserDownloadHandlers(): void {
  const sess: Session = session.fromPartition(THUNDER_BROWSER_PARTITION)

  // URL → FIFO queue of starts awaiting their `will-download` event.
  const pendingByUrl = new Map<string, PendingStart[]>()
  // In-flight items only — pruned on `done`. Cancel needs a live
  // DownloadItem; show-in-folder reads from `savePathById` instead so
  // it keeps working after completion (when the item is gone).
  const itemsById = new Map<string, DownloadItem>()
  // Retained past completion so `show-in-folder` can resolve a
  // completed download by id. Bounded in practice by the renderer's
  // download-history surface; no eviction in v1.
  const savePathById = new Map<string, string>()
  const lastProgressAt = new Map<string, number>()

  function rememberSavePath(id: string, path: string): void {
    // Insertion-order Map: re-setting an existing key keeps its
    // original position, but we want completed downloads to refresh
    // their freshness — delete-then-set so eviction skips them.
    savePathById.delete(id)
    savePathById.set(id, path)
    if (savePathById.size > SAVE_PATH_CACHE_MAX) {
      const oldest = savePathById.keys().next().value
      if (oldest !== undefined) savePathById.delete(oldest)
    }
  }

  sess.on('will-download', (_event: Event, item: DownloadItem) => {
    const url = item.getURL()
    const queue = pendingByUrl.get(url)
    if (!queue || queue.length === 0) return // not initiated by us
    const next = queue.shift() as PendingStart
    if (queue.length === 0) pendingByUrl.delete(url)

    const { id, targetPath, timeoutHandle } = next
    clearTimeout(timeoutHandle)
    item.setSavePath(targetPath)
    itemsById.set(id, item)
    rememberSavePath(id, targetPath)

    item.on('updated', (_e, state) => {
      const now = Date.now()
      const prev = lastProgressAt.get(id) ?? 0
      if (now - prev < PROGRESS_THROTTLE_MS) return
      lastProgressAt.set(id, now)
      const payload: DownloadProgressPayload = {
        id,
        receivedBytes: item.getReceivedBytes(),
        totalBytes: item.getTotalBytes(),
        state
      }
      sendToFocused(THUNDER_IPC_CHANNELS.browserDownloadProgress, payload)
    })

    item.once('done', (_e, state) => {
      const savePath = item.getSavePath()
      // `cancel()` and most interruptions leave a partial file behind;
      // the AC mandates we clean it up so a half-downloaded mp4 doesn't
      // masquerade as a completed asset on disk.
      if (state === 'cancelled' || state === 'interrupted') {
        try {
          unlinkSync(savePath)
        } catch {
          // File may already be absent (cancel before any bytes
          // landed) or permission-denied — neither is worth surfacing
          // since the user's intent was "stop this download".
        }
        // No file on disk → no point keeping its path around for
        // show-in-folder.
        savePathById.delete(id)
      }
      const payload: DownloadCompletePayload = { id, state, savePath }
      sendToFocused(THUNDER_IPC_CHANNELS.browserDownloadComplete, payload)
      itemsById.delete(id)
      lastProgressAt.delete(id)
    })
  })

  ipcMain.handle(
    THUNDER_IPC_CHANNELS.browserDownloadStart,
    async (_event, args: unknown): Promise<{ id: string }> => {
      if (!args || typeof args !== 'object') {
        throw new Error('[browser-download] start requires { assetUrl, suggestedFilename }')
      }
      const { assetUrl, suggestedFilename } = args as {
        assetUrl?: unknown
        suggestedFilename?: unknown
      }
      if (typeof assetUrl !== 'string' || assetUrl.length === 0) {
        throw new Error('[browser-download] assetUrl must be a non-empty string')
      }
      if (typeof suggestedFilename !== 'string' || suggestedFilename.length === 0) {
        throw new Error('[browser-download] suggestedFilename must be a non-empty string')
      }

      // `path.join` doesn't block traversal: a malicious or buggy
      // renderer could send `../../evil.sh` and write outside the
      // download folder. `basename` strips every path component, so
      // the resolved file always lands inside `folder`. Reject if the
      // result is empty (e.g., `/`) — there's nothing safe to write.
      const safeFilename = basename(suggestedFilename)
      if (safeFilename.length === 0 || safeFilename === '.' || safeFilename === '..') {
        throw new Error('[browser-download] suggestedFilename has no usable basename')
      }

      const folder = getSetting(settingsPath(), defaults(), 'downloadFolder')
      mkdirSync(folder, { recursive: true })
      const targetPath = resolveCollisionSafePath(folder, safeFilename)

      const id = randomUUID()
      const queue = pendingByUrl.get(assetUrl) ?? []
      // Bound the leak if `will-download` never fires (network failed
      // before headers): drop our queue entry after a timeout so the
      // map doesn't grow per orphaned start.
      const timeoutHandle = setTimeout(() => {
        const q = pendingByUrl.get(assetUrl)
        if (!q) return
        const idx = q.findIndex((p) => p.id === id)
        if (idx === -1) return
        q.splice(idx, 1)
        if (q.length === 0) pendingByUrl.delete(assetUrl)
      }, WILL_DOWNLOAD_TIMEOUT_MS)
      // Don't keep the event loop alive solely for this cleanup —
      // app shutdown should still proceed cleanly.
      timeoutHandle.unref?.()
      queue.push({ id, targetPath, timeoutHandle })
      pendingByUrl.set(assetUrl, queue)

      sess.downloadURL(assetUrl)
      return { id }
    }
  )

  ipcMain.handle(
    THUNDER_IPC_CHANNELS.browserDownloadCancel,
    async (_event, args: unknown): Promise<void> => {
      if (!args || typeof args !== 'object') return
      const { id } = args as { id?: unknown }
      if (typeof id !== 'string') return
      const item = itemsById.get(id)
      if (!item) return
      // `cancel()` triggers `done` with state `cancelled`; the cleanup
      // (map removal, partial-file delete, fan-out) all runs there.
      item.cancel()
    }
  )

  ipcMain.handle(
    THUNDER_IPC_CHANNELS.browserDownloadShowInFolder,
    async (_event, args: unknown): Promise<void> => {
      if (!args || typeof args !== 'object') return
      const { id } = args as { id?: unknown }
      if (typeof id !== 'string') return
      const savePath = savePathById.get(id)
      // No-op for unknown ids (e.g., a cancelled download whose
      // partial file we already deleted) rather than throwing —
      // surfacing an error here doesn't help the renderer recover.
      if (!savePath) return
      shell.showItemInFolder(savePath)
    }
  )
}
