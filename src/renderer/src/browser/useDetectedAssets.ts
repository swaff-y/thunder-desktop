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
 * Navigation handling: we key the seed effect on `nav.url`, which
 * `useBrowserNav` updates on `did-navigate`. The main process clears
 * its per-webContents state on the same event, so a fresh
 * `getCurrentAssets` after a navigation returns `[]` until the new
 * page's responses land.
 */

export function useDetectedAssets(nav: BrowserNav): ThunderAssetDetectedPayload[] {
  const { url, webContentsId } = nav
  const [assets, setAssets] = useState<ThunderAssetDetectedPayload[]>([])

  useEffect(() => {
    let cancelled = false
    const seed = async (): Promise<void> => {
      // Clear inside the async path rather than synchronously up-front:
      // the `react-hooks/set-state-in-effect` lint flags a sync setState
      // here, and the user-visible difference (one extra microtask) is
      // immaterial — the list is empty between navigation and the next
      // detection event regardless.
      if (cancelled) return
      if (webContentsId === null) {
        setAssets([])
        return
      }
      let current: ThunderAssetDetectedPayload[] | undefined
      try {
        current = await window.thunder?.browser.getCurrentAssets(webContentsId)
      } catch {
        // Snapshot failure isn't fatal — push events will still populate
        // the list as new responses land.
      }
      if (cancelled) return
      // Newest at top — main returns insertion order, so reverse.
      setAssets(current ? [...current].reverse() : [])
    }
    void seed()
    return () => {
      cancelled = true
    }
  }, [url, webContentsId])

  useEffect(() => {
    const unsubscribe = window.thunder?.browser.onAssetDetected((payload) => {
      setAssets((prev) => {
        if (prev.some((a) => a.id === payload.id)) return prev
        return [payload, ...prev]
      })
    })
    return () => {
      unsubscribe?.()
    }
  }, [])

  return assets
}
