import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from 'react'
import React from 'react'
import type {
  ThunderDownloadCompletePayload,
  ThunderDownloadProgressPayload
} from '../../../preload/thunder-api'

/**
 * TD-025: renderer-side download tracking for the Browser tab drawer.
 *
 * State is keyed by the id returned by the main-process `start` call.
 * The hook layers two pieces of derived information on top of the raw
 * progress/complete payloads from TD-024:
 *
 *   - The original `assetUrl` and `filename` — main only echoes back
 *     `id`, `receivedBytes`, `totalBytes`, `state`, `savePath`. Without
 *     remembering them here, "Retry" couldn't re-issue `start` with the
 *     same args, and rows would have no label.
 *   - A sliding-window KB/s rate. Computing rate since-start would
 *     understate transient slowdowns near the end of a long download
 *     (a slow last chunk after a fast burst). The window is short
 *     enough (~3s) that the displayed rate tracks recent throughput,
 *     long enough that single throttled progress events don't make
 *     the number jitter wildly.
 *
 * TD-042: state lives in `DownloadsProvider` above the route tree, not
 * inside `BrowserPage`. `/multi-watch` is outside `ProtectedDesktopOutlet`
 * so navigating there unmounts `DesktopLayout` + `BrowserPage`; if the
 * hook lived in `BrowserPage` the IPC subscription would tear down and
 * the entries Map would reset, even though the main-process download
 * keeps writing to disk. Hoisting keeps the listener live across the
 * route swap so progress / complete / failure events still land.
 */

const RATE_WINDOW_MS = 3000
const RATE_MAX_SAMPLES = 20

export type DownloadState = 'started' | 'progressing' | 'completed' | 'cancelled' | 'interrupted'

export interface DownloadEntry {
  id: string
  assetUrl: string
  filename: string
  state: DownloadState
  receivedBytes: number
  totalBytes: number
  savePath?: string
  error?: string
  rateBytesPerSec?: number
}

export interface UseDownloads {
  entries: DownloadEntry[]
  start: (assetUrl: string, suggestedFilename: string) => Promise<void>
  cancel: (id: string) => void
  showInFolder: (id: string) => void
  retry: (id: string) => void
  dismiss: (id: string) => void
}

interface RateSample {
  t: number
  receivedBytes: number
}

function useDownloadsState(): UseDownloads {
  const [entries, setEntries] = useState<Map<string, DownloadEntry>>(() => new Map())
  // Mirror of `entries` for synchronous reads inside callbacks (e.g.
  // `retry`) without having to add `entries` to their dep arrays. The
  // ref is updated in an effect — stale by at most one commit, which
  // is fine because callbacks fire from user events long after render.
  const entriesRef = useRef(entries)
  useEffect(() => {
    entriesRef.current = entries
  }, [entries])
  // Per-id sliding window of (timestamp, receivedBytes) samples. Lives
  // in a ref so progress updates don't have to round-trip through React
  // state just to feed the next rate calculation.
  const rateSamplesRef = useRef<Map<string, RateSample[]>>(new Map())

  useEffect(() => {
    const browser = window.thunder?.browser
    if (!browser) return

    const offProgress = browser.download.onProgress((payload: ThunderDownloadProgressPayload) => {
      const now = Date.now()
      const samples = rateSamplesRef.current.get(payload.id) ?? []
      samples.push({ t: now, receivedBytes: payload.receivedBytes })
      const cutoff = now - RATE_WINDOW_MS
      // Drop samples older than the window. We keep at least the most
      // recent two so the rate is still defined for slow downloads
      // whose progress events arrive less often than the window.
      let firstFresh = 0
      while (firstFresh < samples.length - 1 && samples[firstFresh].t < cutoff) {
        firstFresh++
      }
      const pruned = samples.slice(firstFresh)
      if (pruned.length > RATE_MAX_SAMPLES) {
        pruned.splice(0, pruned.length - RATE_MAX_SAMPLES)
      }
      rateSamplesRef.current.set(payload.id, pruned)

      let rate: number | undefined
      if (pruned.length >= 2) {
        const first = pruned[0]
        const last = pruned[pruned.length - 1]
        const dt = last.t - first.t
        if (dt > 0) {
          rate = ((last.receivedBytes - first.receivedBytes) * 1000) / dt
        }
      }

      setEntries((prev) => {
        const existing = prev.get(payload.id)
        if (!existing) return prev
        const next = new Map(prev)
        next.set(payload.id, {
          ...existing,
          state: payload.state === 'progressing' ? 'progressing' : 'interrupted',
          receivedBytes: payload.receivedBytes,
          totalBytes: payload.totalBytes,
          rateBytesPerSec: rate
        })
        return next
      })
    })

    const offComplete = browser.download.onComplete((payload: ThunderDownloadCompletePayload) => {
      rateSamplesRef.current.delete(payload.id)
      setEntries((prev) => {
        const existing = prev.get(payload.id)
        if (!existing) return prev
        const next = new Map(prev)
        next.set(payload.id, {
          ...existing,
          state: payload.state,
          savePath: payload.savePath,
          rateBytesPerSec: undefined
        })
        return next
      })
    })

    return () => {
      offProgress()
      offComplete()
    }
  }, [])

  const start = useCallback(async (assetUrl: string, suggestedFilename: string): Promise<void> => {
    try {
      const { id } = await window.thunder.browser.download.start({
        assetUrl,
        suggestedFilename
      })
      setEntries((prev) => {
        const next = new Map(prev)
        next.set(id, {
          id,
          assetUrl,
          filename: suggestedFilename,
          state: 'started',
          receivedBytes: 0,
          totalBytes: 0
        })
        return next
      })
    } catch (err) {
      // Synth a local-only entry so the failure shows up in the
      // drawer with a Retry path; the id has no main-process
      // counterpart, so cancel/showInFolder for it would no-op.
      const id = `local-error-${Date.now()}-${Math.random().toString(36).slice(2)}`
      const message = err instanceof Error ? err.message : 'failed'
      setEntries((prev) => {
        const next = new Map(prev)
        next.set(id, {
          id,
          assetUrl,
          filename: suggestedFilename,
          state: 'interrupted',
          receivedBytes: 0,
          totalBytes: 0,
          error: message
        })
        return next
      })
    }
  }, [])

  const cancel = useCallback((id: string): void => {
    void window.thunder.browser.download.cancel({ id })
  }, [])

  const showInFolder = useCallback((id: string): void => {
    void window.thunder.browser.download.showInFolder({ id })
  }, [])

  const retry = useCallback(
    (id: string): void => {
      const existing = entriesRef.current.get(id)
      if (!existing) return
      setEntries((prev) => {
        if (!prev.has(id)) return prev
        const next = new Map(prev)
        next.delete(id)
        return next
      })
      void start(existing.assetUrl, existing.filename)
    },
    [start]
  )

  const dismiss = useCallback((id: string): void => {
    setEntries((prev) => {
      if (!prev.has(id)) return prev
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }, [])

  return {
    entries: Array.from(entries.values()),
    start,
    cancel,
    showInFolder,
    retry,
    dismiss
  }
}

const DownloadsContext = createContext<UseDownloads | null>(null)

export function DownloadsProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const value = useDownloadsState()
  return React.createElement(DownloadsContext.Provider, { value }, children)
}

export function useDownloads(): UseDownloads {
  const value = useContext(DownloadsContext)
  if (!value) throw new Error('useDownloads must be used within a DownloadsProvider')
  return value
}
