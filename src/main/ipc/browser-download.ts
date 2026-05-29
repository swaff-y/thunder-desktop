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
import { writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { THUNDER_BROWSER_PARTITION } from '../../shared/browser'
import { DEFAULT_API_URL, type ThunderSettings } from '../../shared/settings'
import { THUNDER_IPC_CHANNELS } from '../../preload/thunder-api'
import { resolveCollisionSafePath } from './browser-download-path'
import {
  buildFfmpegHeadersString,
  isHlsManifest,
  rewriteM3u8ToMp4
} from './browser-download-hls-helpers'
import {
  resolveBundledFfmpegPath,
  startHlsDownload,
  type HlsDownloadHandle
} from './browser-download-hls'
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

// TD-046: cap on concurrent in-flight downloads (plain + HLS combined).
// Chromium's per-host socket pool is 6; downloads, the video proxy, and
// HLS segment fetches all hit the same API origin. With downloads
// allowed to saturate the pool, the renderer's `<video>` request for
// `v1/proxy/:id` stalls (pending) until one finishes. Cap = 2 leaves
// at least 4 sockets free for the renderer (Watch + MultiWatch cells).
const CONCURRENCY_CAP = 2

interface PendingStart {
  id: string
  targetPath: string
  timeoutHandle: NodeJS.Timeout
}

interface QueuedDownload {
  id: string
  start: () => void
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

export interface BrowserDownloadStartArgs {
  assetUrl: string
  suggestedFilename: string
  mimeType?: string
  referer?: string
}

export interface BrowserDownloadHandlers {
  /**
   * TD-047: same dispatch surface as the `browserDownloadStart` IPC
   * channel, callable from inside main so other features (the image
   * context menu) can enqueue downloads without round-tripping through
   * the renderer. Args are already trusted at this point — the caller
   * is in-process — but http(s)-only / basename-only validations still
   * run so the trust boundary against `assetUrl` is uniform whether it
   * came from the renderer or a sibling main-process module.
   */
  startBrowserDownload: (args: BrowserDownloadStartArgs) => Promise<{ id: string; queued: boolean }>
  /**
   * TD-047: write already-resolved bytes (a decoded `data:` image or a
   * blob fetched from the webview) straight to the download folder,
   * reusing the collision-safe path resolver and the drawer
   * `complete` fan-out. There is no network transfer, so it emits a
   * single `completed` event rather than a progress stream.
   */
  saveImageBytes: (args: { bytes: Buffer; suggestedFilename: string }) => Promise<{ id: string }>
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

export function registerBrowserDownloadHandlers(): BrowserDownloadHandlers {
  const sess: Session = session.fromPartition(THUNDER_BROWSER_PARTITION)

  // URL → FIFO queue of starts awaiting their `will-download` event.
  const pendingByUrl = new Map<string, PendingStart[]>()
  // In-flight items only — pruned on `done`. Cancel needs a live
  // DownloadItem; show-in-folder reads from `savePathById` instead so
  // it keeps working after completion (when the item is gone).
  const itemsById = new Map<string, DownloadItem>()
  // TD-037: in-flight HLS remuxes — same lifetime semantics as
  // `itemsById` but the cancel surface is the `HlsDownloadHandle`.
  // `savePathById` is shared across both, so show-in-folder doesn't
  // need to know which transport produced the file.
  const hlsHandlesById = new Map<string, HlsDownloadHandle>()
  // Retained past completion so `show-in-folder` can resolve a
  // completed download by id. Bounded in practice by the renderer's
  // download-history surface; no eviction in v1.
  const savePathById = new Map<string, string>()
  const lastProgressAt = new Map<string, number>()
  // TD-046: FIFO queue of starts held back by CONCURRENCY_CAP. Each
  // entry's `start()` performs the physical dispatch (sess.downloadURL
  // for plain, startHlsDownload for HLS) and assumes activeCount was
  // already incremented before the call.
  const downloadQueue: QueuedDownload[] = []
  let activeCount = 0

  function tryDequeue(): void {
    while (activeCount < CONCURRENCY_CAP) {
      const entry = downloadQueue.shift()
      if (!entry) return
      activeCount++
      entry.start()
    }
  }

  function releaseSlot(): void {
    activeCount--
    tryDequeue()
  }

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

  function sendProgress(payload: DownloadProgressPayload, opts: { throttle: boolean }): void {
    if (opts.throttle) {
      const now = Date.now()
      const prev = lastProgressAt.get(payload.id) ?? 0
      if (now - prev < PROGRESS_THROTTLE_MS) return
      lastProgressAt.set(payload.id, now)
    }
    sendToFocused(THUNDER_IPC_CHANNELS.browserDownloadProgress, payload)
  }

  function sendComplete(
    id: string,
    state: DownloadCompletePayload['state'],
    savePath: string
  ): void {
    // No file on disk → no point keeping its path around for show-in-folder.
    if (state !== 'completed') savePathById.delete(id)
    const payload: DownloadCompletePayload = { id, state, savePath }
    sendToFocused(THUNDER_IPC_CHANNELS.browserDownloadComplete, payload)
    lastProgressAt.delete(id)
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
      sendProgress(
        {
          id,
          receivedBytes: item.getReceivedBytes(),
          totalBytes: item.getTotalBytes(),
          state
        },
        { throttle: true }
      )
    })

    item.once('done', (_e, state) => {
      const savePath = item.getSavePath()
      // For a successful completion, push one final progress event
      // with the actual byte counts before the complete fan-out.
      // The 250ms throttle suppresses `updated` events that arrive
      // close together — for fast/cached downloads, that means the
      // first `updated` (typically `receivedBytes=0`, headers-only)
      // is the only one the renderer ever sees, and `done` arrives
      // before the next throttle window opens. Without this final
      // emit, the renderer's progress bar is pinned at 0%.
      if (state === 'completed') {
        sendProgress(
          {
            id,
            receivedBytes: item.getReceivedBytes(),
            totalBytes: item.getTotalBytes(),
            state: 'progressing'
          },
          { throttle: false }
        )
      }
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
      }
      sendComplete(id, state, savePath)
      itemsById.delete(id)
      releaseSlot()
    })
  })

  function startPlainDispatch(
    id: string,
    assetUrl: string,
    targetPath: string,
    optionalReferer: string | undefined
  ): void {
    const queue = pendingByUrl.get(assetUrl) ?? []
    // Bound the leak if `will-download` never fires (network failed
    // before headers): drop our queue entry after a timeout so the
    // map doesn't grow per orphaned start. The slot we reserved when
    // dispatching also needs releasing — otherwise an orphaned start
    // leaks one CONCURRENCY_CAP slot permanently.
    const timeoutHandle = setTimeout(() => {
      const q = pendingByUrl.get(assetUrl)
      if (!q) return
      const idx = q.findIndex((p) => p.id === id)
      if (idx === -1) return
      q.splice(idx, 1)
      if (q.length === 0) pendingByUrl.delete(assetUrl)
      sendComplete(id, 'interrupted', '')
      releaseSlot()
    }, WILL_DOWNLOAD_TIMEOUT_MS)
    // Don't keep the event loop alive solely for this cleanup —
    // app shutdown should still proceed cleanly.
    timeoutHandle.unref?.()
    queue.push({ id, targetPath, timeoutHandle })
    pendingByUrl.set(assetUrl, queue)

    // TD-047: forward the page URL as a Referer header so hotlink-
    // protected CDNs (which already accept the page's own image
    // requests) accept the download. Detected-asset downloads that
    // don't supply a referer keep the prior no-header behaviour.
    if (optionalReferer !== undefined) {
      sess.downloadURL(assetUrl, { headers: { Referer: optionalReferer } })
    } else {
      sess.downloadURL(assetUrl)
    }
  }

  async function startHlsDispatch(
    id: string,
    assetUrl: string,
    targetPath: string,
    optionalReferer: string | undefined
  ): Promise<void> {
    try {
      // Cookies are scoped to the manifest URL and forwarded via
      // ffmpeg's `-headers` so a session-gated stream still
      // downloads. The User-Agent override (if set) matches what
      // the embedded webview already sends, in case the CDN
      // varies its 403 policy by UA. Fetched at dispatch time (not
      // enqueue) so a credential rotation while the entry sat in
      // the queue doesn't ship stale cookies to ffmpeg.
      const cookies = await sess.cookies.get({ url: assetUrl })
      const userAgent = getSetting(settingsPath(), defaults(), 'userAgent')
      const headers = buildFfmpegHeadersString(cookies, userAgent, optionalReferer)

      // Track the last progress pair so we can emit one final
      // unthrottled event on completion. Without this, a fast
      // HLS download whose only `total_size` line was suppressed
      // by the throttle leaves the drawer pinned at 0 bytes
      // before flipping to "Completed" — same pattern as the
      // TD-024 fix in the `done(completed)` branch above.
      let lastReceivedBytes = 0
      let lastTotalBytes = 0
      const handle = startHlsDownload({
        ffmpegPath: resolveBundledFfmpegPath(),
        assetUrl,
        targetPath,
        headers,
        onProgress: (receivedBytes, totalBytes) => {
          lastReceivedBytes = receivedBytes
          lastTotalBytes = totalBytes
          sendProgress({ id, receivedBytes, totalBytes, state: 'progressing' }, { throttle: true })
        },
        onDone: (state) => {
          if (state === 'completed') {
            // Snap the final emit to receivedBytes=totalBytes so
            // the bar fills to 100% even when ffmpeg stopped
            // emitting progress before reaching 100% of duration.
            sendProgress(
              {
                id,
                receivedBytes: lastReceivedBytes,
                totalBytes: Math.max(lastReceivedBytes, lastTotalBytes),
                state: 'progressing'
              },
              { throttle: false }
            )
          }
          sendComplete(id, state, targetPath)
          hlsHandlesById.delete(id)
          releaseSlot()
        }
      })
      hlsHandlesById.set(id, handle)
    } catch {
      // Cookie fetch or spawn failed — surface as an interrupted
      // download and free the slot so the next queued entry can run.
      sendComplete(id, 'interrupted', '')
      releaseSlot()
    }
  }

  async function startBrowserDownload(
    args: BrowserDownloadStartArgs
  ): Promise<{ id: string; queued: boolean }> {
    const {
      assetUrl,
      suggestedFilename,
      mimeType: optionalMimeType,
      referer: optionalReferer
    } = args

    // Restrict to web protocols. The URL flows into ffmpeg's `-i`
    // argument for the HLS branch, where `file://` or `pipe:` would
    // turn a renderer-provided string into a local-FS read or a
    // protocol injection vector. The non-HLS path uses Electron's
    // network stack which already gates protocols, but applying
    // the same check up front keeps the trust boundary uniform.
    let parsedAssetUrl: URL
    try {
      parsedAssetUrl = new URL(assetUrl)
    } catch {
      throw new Error('[browser-download] assetUrl is not a valid URL')
    }
    if (parsedAssetUrl.protocol !== 'http:' && parsedAssetUrl.protocol !== 'https:') {
      throw new Error('[browser-download] assetUrl protocol must be http or https')
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

    // TD-037: HLS manifests can't be saved as-is — ffmpeg remuxes
    // the segments into a single .mp4. Force the extension before
    // collision resolution so `clip.m3u8` and an existing
    // `clip.mp4` get suffixed correctly (`clip (2).mp4`).
    const hls = isHlsManifest({ url: assetUrl, mimeType: optionalMimeType })
    const effectiveFilename = hls ? rewriteM3u8ToMp4(safeFilename) : safeFilename
    const targetPath = resolveCollisionSafePath(folder, effectiveFilename)

    const id = randomUUID()

    // Save path is remembered up front for HLS so show-in-folder
    // resolves the future .mp4 even if the entry is still queued.
    // Plain downloads register their save path inside `will-download`.
    if (hls) rememberSavePath(id, targetPath)

    // TD-046: if the cap is reached, defer the physical dispatch
    // until a slot opens. Renderer learns it was queued from the
    // `queued: true` flag and labels the row "Queued" until the
    // first progress event flips it to "Downloading".
    if (activeCount < CONCURRENCY_CAP) {
      activeCount++
      if (hls) {
        await startHlsDispatch(id, assetUrl, targetPath, optionalReferer)
      } else {
        startPlainDispatch(id, assetUrl, targetPath, optionalReferer)
      }
      return { id, queued: false }
    }

    downloadQueue.push({
      id,
      start: hls
        ? (): void => void startHlsDispatch(id, assetUrl, targetPath, optionalReferer)
        : (): void => startPlainDispatch(id, assetUrl, targetPath, optionalReferer)
    })
    return { id, queued: true }
  }

  async function saveImageBytes(args: {
    bytes: Buffer
    suggestedFilename: string
  }): Promise<{ id: string }> {
    // Same basename hardening as the streamed path: strip every path
    // component so a MIME-derived name can never escape the folder.
    const safeFilename = basename(args.suggestedFilename)
    if (safeFilename.length === 0 || safeFilename === '.' || safeFilename === '..') {
      throw new Error('[browser-download] suggestedFilename has no usable basename')
    }
    const folder = getSetting(settingsPath(), defaults(), 'downloadFolder')
    mkdirSync(folder, { recursive: true })
    const targetPath = resolveCollisionSafePath(folder, safeFilename)
    const id = randomUUID()
    rememberSavePath(id, targetPath)
    try {
      await writeFile(targetPath, args.bytes)
    } catch (error) {
      // Surface the failure in the drawer (interrupted) and rethrow so
      // the caller can log — mirrors a failed network download, minus
      // the partial file (writeFile either wrote nothing or we don't
      // claim success).
      sendComplete(id, 'interrupted', '')
      throw error
    }
    sendComplete(id, 'completed', targetPath)
    return { id }
  }

  ipcMain.handle(
    THUNDER_IPC_CHANNELS.browserDownloadStart,
    async (_event, args: unknown): Promise<{ id: string; queued: boolean }> => {
      if (!args || typeof args !== 'object') {
        throw new Error('[browser-download] start requires { assetUrl, suggestedFilename }')
      }
      const { assetUrl, suggestedFilename, mimeType, referer } = args as {
        assetUrl?: unknown
        suggestedFilename?: unknown
        mimeType?: unknown
        referer?: unknown
      }
      if (typeof assetUrl !== 'string' || assetUrl.length === 0) {
        throw new Error('[browser-download] assetUrl must be a non-empty string')
      }
      if (typeof suggestedFilename !== 'string' || suggestedFilename.length === 0) {
        throw new Error('[browser-download] suggestedFilename must be a non-empty string')
      }
      // Protocol + basename sanitisation runs inside `startBrowserDownload`
      // — both call sites (this IPC handler and the in-process context-menu
      // dispatcher) share the same validation, so an untrusted assetUrl is
      // never forwarded to the network or to ffmpeg without it.
      return startBrowserDownload({
        assetUrl,
        suggestedFilename,
        mimeType: typeof mimeType === 'string' ? mimeType : undefined,
        referer: typeof referer === 'string' && referer.length > 0 ? referer : undefined
      })
    }
  )

  ipcMain.handle(
    THUNDER_IPC_CHANNELS.browserDownloadCancel,
    async (_event, args: unknown): Promise<void> => {
      if (!args || typeof args !== 'object') return
      const { id } = args as { id?: unknown }
      if (typeof id !== 'string') return
      // TD-046: a cancel for a still-queued entry never touched ffmpeg
      // or the network — splice it out, fan out `cancelled`, and leave
      // activeCount alone (no slot was ever reserved for it).
      const queuedIdx = downloadQueue.findIndex((e) => e.id === id)
      if (queuedIdx !== -1) {
        downloadQueue.splice(queuedIdx, 1)
        sendComplete(id, 'cancelled', '')
        return
      }
      const hlsHandle = hlsHandlesById.get(id)
      if (hlsHandle) {
        // HLS branch: `cancel()` SIGTERMs ffmpeg, the wrapper's
        // `onDone` callback handles the fan-out and map cleanup.
        hlsHandle.cancel()
        return
      }
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

  return { startBrowserDownload, saveImageBytes }
}
