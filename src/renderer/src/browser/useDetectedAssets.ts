import { useCallback, useEffect, useState } from 'react'
import type { ThunderAssetDetectedPayload } from '../../../preload/thunder-api'
import type { BrowserNav } from './useBrowserNav'

/**
 * TD-023: detected-asset list state for the Browser tab right rail.
 *
 * Two inputs feed the list:
 *
 *   1. `getCurrentAssets(webContentsId)` — main-process snapshot for
 *      the current page. Used to seed on attach and to re-seed after a
 *      reload, where the renderer remounts but the main-process state
 *      already has the fresh detections from the response listener.
 *   2. `onAssetDetected` — push events from the same listener,
 *      delivered as they arrive. New events go to the top of the list
 *      and are de-duplicated against any existing payload by `id`
 *      (the main process already dedups within its sliding window, but
 *      a snapshot + a push for the same asset would otherwise double-up
 *      on the seed/event boundary).
 *
 * Navigation handling: we mirror `nav.url` into local state and reset
 * the list during render when it changes — the React-recommended
 * pattern for "reset state when a prop changes". This is synchronous
 * (no flicker of stale assets) and bypasses the
 * `react-hooks/set-state-in-effect` lint that a clear-inside-effect
 * would trip. Main clears its per-webContents state on the same
 * `did-navigate`, so the seed-effect's `getCurrentAssets` call after a
 * navigation returns `[]` until new responses land.
 *
 * Manual controls:
 *   - `clear` empties the displayed list. Main-process state is left
 *     intact, so subsequent push events still arrive normally.
 *   - `refresh` re-pulls the main-process snapshot for the current
 *     `webContentsId` and replaces local state with it.
 */

export interface DetectedAssets {
  assets: ThunderAssetDetectedPayload[]
  clear: () => void
  refresh: () => void
}

export function useDetectedAssets(nav: BrowserNav): DetectedAssets {
  const { url, webContentsId } = nav
  const [assets, setAssets] = useState<ThunderAssetDetectedPayload[]>([])
  const [trackedUrl, setTrackedUrl] = useState(url)
  const [seedNonce, setSeedNonce] = useState(0)
  if (url !== trackedUrl) {
    setTrackedUrl(url)
    setAssets([])
  }

  useEffect(() => {
    if (webContentsId === null) return
    const browser = window.thunder?.browser
    if (!browser) return
    let cancelled = false
    void (async (): Promise<void> => {
      let current: ThunderAssetDetectedPayload[] | undefined
      try {
        current = await browser.getCurrentAssets(webContentsId)
      } catch {
        // Snapshot failure isn't fatal — push events will still populate
        // the list as new responses land.
      }
      if (cancelled) return
      // Newest at top — main returns insertion order, so reverse.
      setAssets(current ? [...current].reverse() : [])
    })()
    return () => {
      cancelled = true
    }
  }, [url, webContentsId, seedNonce])

  useEffect(() => {
    // TD-089: the subscription is partition-wide, so with several browser
    // tabs open every one of them receives every other one's detections.
    // The payload now names the webview that saw it, which is what TD-024's
    // comment here predicted would be needed.
    const browser = window.thunder?.browser
    if (!browser) return
    const unsubscribe = browser.onAssetDetected((payload) => {
      if (payload.webContentsId !== webContentsId) return
      setAssets((prev) => {
        if (prev.some((a) => a.id === payload.id)) return prev
        return [payload, ...prev]
      })
    })
    return unsubscribe
  }, [webContentsId])

  const clear = useCallback(() => {
    setAssets([])
  }, [])

  const refresh = useCallback(() => {
    setSeedNonce((n) => n + 1)
  }, [])

  return { assets, clear, refresh }
}
