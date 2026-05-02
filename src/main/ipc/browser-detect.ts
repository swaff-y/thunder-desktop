/**
 * TD-022: video-asset detection for the embedded browser.
 *
 * Detection runs against the partitioned session (`persist:thunder-browser`)
 * via a single `webRequest.onResponseStarted` listener — DOM scraping
 * misses HLS / DASH segments, lazy-loaded sources, and dynamically
 * injected `<video>` tags. The session listener sees every response
 * the embedded view receives, so it catches all of those uniformly.
 *
 * State is keyed by the webview's `webContents.id`: dedup window,
 * "current page" snapshot for IPC reads, and the page URL we tag onto
 * each event. Cleared on `did-navigate` (top-level) and on
 * `webContents` destruction so a long-lived app doesn't leak.
 */

import { app, ipcMain, session, webContents } from 'electron'
import { THUNDER_BROWSER_PARTITION } from '../../shared/browser'
import { THUNDER_IPC_CHANNELS, type ThunderAssetDetectedPayload } from '../../preload/thunder-api'
import { getContentLength, getMimeType, isVideoAsset } from './browser-detect-rules'

const DEDUP_WINDOW_MS = 30_000

// Hard cap on dedup entries per webview. Pages that fetch unique
// signed-URL manifests on a tight loop (rotating tokens read as
// distinct `assetUrl`s) would otherwise grow the map without bound.
// 512 leaves plenty of headroom for legitimate concurrent video
// elements while keeping a worst-case footprint trivial.
const DEDUP_MAX_ENTRIES = 512

interface WebviewState {
  pageUrl: string
  // (pageUrl + LF + assetUrl) → last-seen timestamp (ms).
  // Cleared on top-level navigation; entries older than the sliding
  // window are also recognised as stale on next hit.
  dedup: Map<string, number>
  assets: ThunderAssetDetectedPayload[]
}

const states = new Map<number, WebviewState>()

function getState(wcId: number): WebviewState {
  let state = states.get(wcId)
  if (!state) {
    state = { pageUrl: '', dedup: new Map(), assets: [] }
    states.set(wcId, state)
  }
  return state
}

function dedupKey(pageUrl: string, assetUrl: string): string {
  // `\n` can't appear unescaped in a URL, so the join is
  // unambiguous: (a, b) and (a+b, '') won't collide.
  return `${pageUrl}\n${assetUrl}`
}

function makeId(): string {
  return `asset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function clearForNewPage(wcId: number, newUrl: string): void {
  const state = getState(wcId)
  state.pageUrl = newUrl
  state.dedup.clear()
  state.assets = []
}

/**
 * Drop dedup entries that can no longer suppress a duplicate (older
 * than the window) and, as a final safety net, evict the oldest
 * insertion-order entries if the map is still over the size cap. Both
 * passes are O(n); the prune only runs on a detection that's about to
 * write, so it's bounded by the rate of unique video responses.
 */
function pruneDedup(dedup: Map<string, number>, now: number): void {
  const cutoff = now - DEDUP_WINDOW_MS
  for (const [k, ts] of dedup) {
    if (ts < cutoff) dedup.delete(k)
  }
  if (dedup.size < DEDUP_MAX_ENTRIES) return
  const overflow = dedup.size - DEDUP_MAX_ENTRIES + 1
  let removed = 0
  for (const k of dedup.keys()) {
    if (removed >= overflow) break
    dedup.delete(k)
    removed++
  }
}

export function registerBrowserDetectHandlers(): void {
  const sess = session.fromPartition(THUNDER_BROWSER_PARTITION)

  sess.webRequest.onResponseStarted((details) => {
    if (
      !isVideoAsset({
        url: details.url,
        headers: details.responseHeaders ?? {}
      })
    ) {
      return
    }

    // `webContentsId` can be absent for service-worker / DevTools
    // initiated requests; without it we have nowhere to deliver the
    // event, so drop it.
    const wcId = details.webContentsId
    if (typeof wcId !== 'number') return
    const wc = webContents.fromId(wcId)
    if (!wc || wc.isDestroyed()) return

    const state = getState(wcId)
    // First request can land before `did-navigate` fires (request goes
    // out before the navigation completes), so seed pageUrl from the
    // live webContents URL when we don't have one yet.
    const pageUrl = state.pageUrl || wc.getURL()
    if (state.pageUrl === '') state.pageUrl = pageUrl

    const key = dedupKey(pageUrl, details.url)
    const now = Date.now()
    const last = state.dedup.get(key)
    if (last !== undefined && now - last < DEDUP_WINDOW_MS) return
    pruneDedup(state.dedup, now)
    state.dedup.set(key, now)

    const mime = getMimeType(details.responseHeaders ?? {})
    const sizeBytes = getContentLength(details.responseHeaders ?? {})
    const payload: ThunderAssetDetectedPayload = {
      id: makeId(),
      pageUrl,
      assetUrl: details.url,
      mimeType: mime ?? 'application/octet-stream',
      ...(sizeBytes !== undefined ? { sizeBytes } : {}),
      detectedAt: now
    }
    state.assets.push(payload)

    // Forward to the embedder window. `hostWebContents` is the
    // `<webview>`'s parent (our renderer); falling back to the webview
    // itself keeps the channel alive in test fixtures where there's no
    // host (e.g. a top-level BrowserView used standalone).
    const host = wc.hostWebContents ?? wc
    if (!host.isDestroyed()) {
      host.send(THUNDER_IPC_CHANNELS.browserAssetDetected, payload)
    }
  })

  app.on('web-contents-created', (_event, wc) => {
    if (wc.getType() !== 'webview') return
    const wcId = wc.id

    // `did-navigate` fires for top-level navigations only (not in-page
    // hash changes), which is exactly the boundary we want for
    // clearing dedup state. Reloads also fire it, so the AC of
    // "reloading re-fires detection" falls out for free.
    wc.on('did-navigate', (_e, url) => {
      clearForNewPage(wcId, url)
    })

    wc.once('destroyed', () => {
      states.delete(wcId)
    })
  })

  ipcMain.handle(
    THUNDER_IPC_CHANNELS.browserAssetsGetCurrent,
    async (_event, webContentsId: unknown) => {
      if (typeof webContentsId !== 'number') return []
      const state = states.get(webContentsId)
      return state ? [...state.assets] : []
    }
  )

  // TD-035: wipe partition storage (cookies, localStorage, cache) and
  // the in-memory detection map so the next login session can't see
  // the previous one's pages or assets. Called from `useAuth.logout`
  // before `setState(EMPTY_STATE)` triggers the webview unmount, so the
  // partition is cleared while the `<webview>` is still attached —
  // page JS could in theory write to localStorage in the gap, but the
  // unmount cancels any further activity within the same render cycle.
  ipcMain.handle(THUNDER_IPC_CHANNELS.browserSessionClear, async () => {
    states.clear()
    await sess.clearStorageData()
  })
}
