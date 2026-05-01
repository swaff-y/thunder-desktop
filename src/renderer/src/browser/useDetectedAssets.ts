import { useEffect, useState } from 'react'
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
 */

export function useDetectedAssets(nav: BrowserNav): ThunderAssetDetectedPayload[] {
  const { url, webContentsId } = nav
  const [assets, setAssets] = useState<ThunderAssetDetectedPayload[]>([])
  const [trackedUrl, setTrackedUrl] = useState(url)
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
  }, [url, webContentsId])

  useEffect(() => {
    // TD-024: subscription is partition-wide, not scoped to this
    // webview's `webContentsId`. Single-webview today so it's fine, but
    // when the download manager lands and routing needs to know which
    // webview originated an asset, the IPC payload will need to carry
    // `webContentsId` and this filter against `nav.webContentsId`.
    const browser = window.thunder?.browser
    if (!browser) return
    const unsubscribe = browser.onAssetDetected((payload) => {
      setAssets((prev) => {
        if (prev.some((a) => a.id === payload.id)) return prev
        return [payload, ...prev]
      })
    })
    return unsubscribe
  }, [])

  return assets
}
