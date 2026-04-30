import { useCallback, useEffect, useRef, useState } from 'react'
import type { WebviewTag, DidFailLoadEvent } from 'electron'

/**
 * TD-021: state + actions for the embedded browser.
 *
 * The hook owns a ref to the underlying `<webview>` element and
 * attaches its lifecycle listeners through the `attachWebview` ref
 * callback (rather than a `useEffect` keyed on `webviewRef.current`,
 * which doesn't actually re-run when refs change). The element is the
 * source of truth for history — `goBack` / `goForward` / `reload`
 * delegate to it, and `did-navigate(-in-page)` events sync the React
 * `url` / `inputUrl` mirror back so the address bar stays in step.
 *
 * `loadURL` does the URL massaging the chrome's Go button needs:
 * prepends `https://` to scheme-less input and rejects anything that
 * isn't `http(s)` (so typing `chrome://settings` surfaces a
 * validation error instead of attempting the navigation).
 */

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i

export interface BrowserNav {
  url: string
  inputUrl: string
  setInputUrl: (value: string) => void
  loading: boolean
  loadError: string | null
  validationError: string | null
  canGoBack: boolean
  canGoForward: boolean
  goBack: () => void
  goForward: () => void
  reload: () => void
  loadURL: (raw: string) => void
  attachWebview: (el: WebviewTag | null) => void
}

interface NewWindowEvent extends Event {
  url: string
}

interface DidNavigateEvent extends Event {
  url: string
}

interface DidNavigateInPageEvent extends Event {
  url: string
  isMainFrame: boolean
}

export function useBrowserNav(initialUrl: string): BrowserNav {
  const [url, setUrl] = useState(initialUrl)
  const [inputUrl, setInputUrl] = useState(initialUrl)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)

  const webviewRef = useRef<WebviewTag | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  const refreshHistoryFlags = useCallback(() => {
    const el = webviewRef.current
    if (!el) return
    try {
      setCanGoBack(el.canGoBack())
      setCanGoForward(el.canGoForward())
    } catch {
      // `canGoBack` throws before the webview's webContents is ready;
      // the next `did-navigate` will re-trigger this so it self-heals.
    }
  }, [])

  const attachWebview = useCallback(
    (el: WebviewTag | null) => {
      if (cleanupRef.current) {
        cleanupRef.current()
        cleanupRef.current = null
      }
      webviewRef.current = el
      if (!el) return

      const onDidStartLoading = (): void => {
        setLoading(true)
        setLoadError(null)
      }
      const onDidStopLoading = (): void => {
        setLoading(false)
        refreshHistoryFlags()
      }
      const onDidFailLoad = (event: Event): void => {
        const e = event as DidFailLoadEvent
        // -3 (ABORTED) fires for user-cancelled navigations and for the
        // duplicate event Chromium emits when a redirect supersedes the
        // original request — neither is a "page failed" condition.
        if (e.errorCode === -3) return
        setLoading(false)
        setLoadError(e.errorDescription || `Error ${e.errorCode}`)
      }
      const onDidFinishLoad = (): void => {
        setLoadError(null)
        refreshHistoryFlags()
      }
      const onDidNavigate = (event: Event): void => {
        const e = event as DidNavigateEvent
        setUrl(e.url)
        setInputUrl(e.url)
        refreshHistoryFlags()
      }
      const onDidNavigateInPage = (event: Event): void => {
        const e = event as DidNavigateInPageEvent
        if (e.isMainFrame) {
          setUrl(e.url)
          setInputUrl(e.url)
        }
        refreshHistoryFlags()
      }
      const onNewWindow = (event: Event): void => {
        const e = event as NewWindowEvent
        const target = e.url
        try {
          const parsed = new URL(target)
          if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            // Same-webview navigation rather than a popup.
            el.loadURL(target)
            return
          }
          // mailto: / tel: / extension schemes — main process applies the
          // allowlist before handing off to the OS handler.
          window.thunder?.shell.openExternal(target).catch(() => {
            // openExternal rejects only on transport errors; the
            // allowlist check is silent on the renderer side.
          })
        } catch {
          // Unparseable URL — drop silently; nothing safe to do with it.
        }
      }

      el.addEventListener('did-start-loading', onDidStartLoading)
      el.addEventListener('did-stop-loading', onDidStopLoading)
      el.addEventListener('did-fail-load', onDidFailLoad)
      el.addEventListener('did-finish-load', onDidFinishLoad)
      el.addEventListener('did-navigate', onDidNavigate)
      el.addEventListener('did-navigate-in-page', onDidNavigateInPage)
      el.addEventListener('new-window', onNewWindow)

      cleanupRef.current = (): void => {
        el.removeEventListener('did-start-loading', onDidStartLoading)
        el.removeEventListener('did-stop-loading', onDidStopLoading)
        el.removeEventListener('did-fail-load', onDidFailLoad)
        el.removeEventListener('did-finish-load', onDidFinishLoad)
        el.removeEventListener('did-navigate', onDidNavigate)
        el.removeEventListener('did-navigate-in-page', onDidNavigateInPage)
        el.removeEventListener('new-window', onNewWindow)
      }
    },
    [refreshHistoryFlags]
  )

  useEffect(() => {
    return () => {
      cleanupRef.current?.()
      cleanupRef.current = null
    }
  }, [])

  const goBack = useCallback(() => {
    const el = webviewRef.current
    if (!el) return
    try {
      if (el.canGoBack()) el.goBack()
    } catch {
      // webContents not ready yet
    }
  }, [])

  const goForward = useCallback(() => {
    const el = webviewRef.current
    if (!el) return
    try {
      if (el.canGoForward()) el.goForward()
    } catch {
      // webContents not ready yet
    }
  }, [])

  const reload = useCallback(() => {
    const el = webviewRef.current
    if (!el) return
    setLoadError(null)
    try {
      el.reload()
    } catch {
      // If reload throws (no current entry), fall back to re-loading
      // the last known URL.
      if (url) el.loadURL(url)
    }
  }, [url])

  const loadURL = useCallback((raw: string) => {
    const trimmed = raw.trim()
    if (trimmed.length === 0) {
      setValidationError('Enter a URL.')
      return
    }
    const candidate = SCHEME_RE.test(trimmed) ? trimmed : `https://${trimmed}`
    let parsed: URL
    try {
      parsed = new URL(candidate)
    } catch {
      setValidationError('Not a valid URL.')
      return
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      setValidationError(`Unsupported scheme: ${parsed.protocol}`)
      return
    }
    setValidationError(null)
    setLoadError(null)
    const next = parsed.toString()
    setUrl(next)
    setInputUrl(next)
    webviewRef.current?.loadURL(next)
  }, [])

  return {
    url,
    inputUrl,
    setInputUrl,
    loading,
    loadError,
    validationError,
    canGoBack,
    canGoForward,
    goBack,
    goForward,
    reload,
    loadURL,
    attachWebview
  }
}
