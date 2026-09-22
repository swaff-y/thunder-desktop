import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ContextMenuEvent, DidFailLoadEvent, WebviewTag } from 'electron'

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

/**
 * What the address bar will accept, without a webview to load it into.
 * TD-089: `openInBrowserTab` has to reject a URL *before* a tab exists,
 * so the rule lives here rather than inside `loadURL`.
 */
export type UrlCheck = { url: string } | { error: string }

export function normaliseUrl(raw: string): UrlCheck {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return { error: 'Enter a URL.' }
  const candidate = SCHEME_RE.test(trimmed) ? trimmed : `https://${trimmed}`
  let parsed: URL
  try {
    parsed = new URL(candidate)
  } catch {
    return { error: 'Not a valid URL.' }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { error: `Unsupported scheme: ${parsed.protocol}` }
  }
  return { url: parsed.toString() }
}

export interface BrowserNav {
  url: string
  inputUrl: string
  setInputUrl: (value: string) => void
  loading: boolean
  loadError: string | null
  validationError: string | null
  canGoBack: boolean
  canGoForward: boolean
  /**
   * `webContents.id` of the guest, available once the webview's
   * `did-attach` event has fired. `null` before then — TD-023's
   * detected-assets panel keys its IPC reads on this value, so it must
   * defer the initial fetch until it's set.
   */
  webContentsId: number | null
  /** TD-089: what the tab strip shows. Null until `page-title-updated`
   *  fires for the current page, which is why the strip falls back to
   *  the URL's hostname. Both reset on a top-level navigation. */
  title: string | null
  favicon: string | null
  goBack: () => void
  goForward: () => void
  reload: () => void
  /**
   * Returns whether the URL was accepted. TD-080's `openInBrowserTab`
   * needs to know, because a rejected URL must leave the user where
   * they are with `validationError` showing rather than switching them
   * to a tab that never navigated.
   */
  loadURL: (raw: string) => boolean
  attachWebview: (el: WebviewTag | null) => void
  /**
   * TD-089: mutes a browser tab that is not the active one, so only the
   * page on screen makes noise. Kept apart from TD-039's snapshot — the
   * mute this applies is the app's, not the user's, and must not come
   * back on resume as though the user had set it.
   */
  setMuted: (muted: boolean) => void
  /**
   * TD-039: when the host (Browser tab) becomes hidden, cancel any
   * in-flight requests and mute audio so the embedded page doesn't
   * starve the renderer's socket pool while the user watches a video
   * on `/watch/:id`. The webview element stays attached so TD-035's
   * session/history preservation is unaffected.
   */
  setVisible: (visible: boolean) => void
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

interface PageTitleUpdatedEvent extends Event {
  title: string
}

interface PageFaviconUpdatedEvent extends Event {
  favicons: string[]
}

/**
 * TD-089: `onNewWindow` sends an `http(s)` `target=_blank` link somewhere
 * other than this webview — `BrowserTabView` passes the tabs context's
 * `open`, which is what makes a popup a new tab instead of a page the
 * user has to Back out of. Absent, the link loads in place as before.
 */
export function useBrowserNav(
  initialUrl: string,
  onNewWindow?: (url: string) => void
): BrowserNav {
  const [url, setUrl] = useState(initialUrl)
  const [inputUrl, setInputUrl] = useState(initialUrl)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const [webContentsId, setWebContentsId] = useState<number | null>(null)
  const [title, setTitle] = useState<string | null>(null)
  const [favicon, setFavicon] = useState<string | null>(null)

  const webviewRef = useRef<WebviewTag | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  // TD-039: snapshot of the page state captured on hide so it can be
  // restored on show. Null when the webview is currently visible.
  const suspendedStateRef = useRef<{ url: string; muted: boolean } | null>(null)
  // TD-040: id of the resume-path loadURL RAF, so a rapid
  // visible→invisible flip can cancel it before it fires against a
  // newly-suspended webview.
  const resumeRafRef = useRef<number | null>(null)
  // TD-048: the Browser tab mounts hidden (DesktopLayout keeps it
  // persistent), so the first setVisible(false) fires before the user
  // has ever opened the tab. Suspending then would swap the still-
  // loading initial page for about:blank and snapshot nothing real,
  // leaving about:blank on first open. Only suspend a tab that's been
  // shown at least once.
  const wasShownRef = useRef(false)
  // TD-089: the app's own mute for a background tab, tracked apart from
  // the element so the suspend snapshot can tell the two apart.
  const backgroundMutedRef = useRef(false)
  // Read at event time, so `attachWebview` keeps the stable identity the
  // `ref` callback needs — a new identity would detach and re-attach the
  // listeners, and `did-attach` never fires twice to restore
  // `webContentsId`.
  const onNewWindowRef = useRef(onNewWindow)
  useEffect(() => {
    onNewWindowRef.current = onNewWindow
  }, [onNewWindow])

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
      if (!el) {
        setWebContentsId(null)
        setTitle(null)
        setFavicon(null)
        return
      }

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
        // The new page has not announced a title yet, and keeping the old
        // one would leave the strip naming a page that is gone.
        setTitle(null)
        setFavicon(null)
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
      const onPageTitleUpdated = (event: Event): void => {
        const e = event as PageTitleUpdatedEvent
        setTitle(e.title.length > 0 ? e.title : null)
      }
      const onPageFaviconUpdated = (event: Event): void => {
        const e = event as PageFaviconUpdatedEvent
        setFavicon(e.favicons[0] ?? null)
      }
      const onDidAttach = (): void => {
        try {
          setWebContentsId(el.getWebContentsId())
        } catch {
          // `getWebContentsId` throws if the guest hasn't attached yet;
          // `did-attach` is the signal that it has, so this is defensive.
        }
      }
      const onNewWindow = (event: Event): void => {
        const e = event as NewWindowEvent
        const target = e.url
        try {
          const parsed = new URL(target)
          if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            const openElsewhere = onNewWindowRef.current
            if (openElsewhere) {
              // TD-089: a new tab, so the page the link came from survives.
              openElsewhere(target)
              return
            }
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
      // TD-047: forward image right-clicks to main so it can pop a
      // native "Save image" menu. Main applies the partition gate,
      // mediaType / scheme checks, and the actual menu construction —
      // the renderer just relays params (no `electron` import needed).
      const onContextMenu = (event: ContextMenuEvent): void => {
        let id: number
        try {
          id = el.getWebContentsId()
        } catch {
          return
        }
        window.thunder?.browser.contextMenu
          .show({
            webContentsId: id,
            mediaType: event.params.mediaType,
            srcURL: event.params.srcURL,
            pageURL: event.params.pageURL
          })
          .catch(() => {
            // Menu construction errors are non-actionable for the user;
            // silently drop so a transient IPC failure doesn't surface
            // as a renderer-level crash.
          })
      }

      el.addEventListener('did-start-loading', onDidStartLoading)
      el.addEventListener('did-stop-loading', onDidStopLoading)
      el.addEventListener('did-fail-load', onDidFailLoad)
      el.addEventListener('did-finish-load', onDidFinishLoad)
      el.addEventListener('did-navigate', onDidNavigate)
      el.addEventListener('did-navigate-in-page', onDidNavigateInPage)
      el.addEventListener('page-title-updated', onPageTitleUpdated)
      el.addEventListener('page-favicon-updated', onPageFaviconUpdated)
      el.addEventListener('did-attach', onDidAttach)
      el.addEventListener('new-window', onNewWindow)
      el.addEventListener('context-menu', onContextMenu)

      cleanupRef.current = (): void => {
        el.removeEventListener('did-start-loading', onDidStartLoading)
        el.removeEventListener('did-stop-loading', onDidStopLoading)
        el.removeEventListener('did-fail-load', onDidFailLoad)
        el.removeEventListener('did-finish-load', onDidFinishLoad)
        el.removeEventListener('did-navigate', onDidNavigate)
        el.removeEventListener('did-navigate-in-page', onDidNavigateInPage)
        el.removeEventListener('page-title-updated', onPageTitleUpdated)
        el.removeEventListener('page-favicon-updated', onPageFaviconUpdated)
        el.removeEventListener('did-attach', onDidAttach)
        el.removeEventListener('new-window', onNewWindow)
        el.removeEventListener('context-menu', onContextMenu)
      }
    },
    [refreshHistoryFlags]
  )

  useEffect(() => {
    return () => {
      cleanupRef.current?.()
      cleanupRef.current = null
      if (resumeRafRef.current !== null) {
        cancelAnimationFrame(resumeRafRef.current)
        resumeRafRef.current = null
      }
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

  const setMuted = useCallback((muted: boolean) => {
    backgroundMutedRef.current = muted
    const el = webviewRef.current
    // A suspended guest is parked and already silent; the resume path is
    // what applies this, so there is nothing to do here.
    if (!el || suspendedStateRef.current !== null) return
    try {
      el.setAudioMuted(muted)
    } catch {
      // webContents not ready — the next resume or mute call applies it.
    }
  }, [])

  const setVisible = useCallback(
    (visible: boolean) => {
      const el = webviewRef.current
      if (!el || webContentsId === null) return
      try {
        if (visible) {
          wasShownRef.current = true
          const snapshot = suspendedStateRef.current
          if (snapshot) {
            el.setAudioMuted(snapshot.muted || backgroundMutedRef.current)
            if (snapshot.url !== 'about:blank') {
              // TD-040: defer one frame so Electron's BrowserPlugin
              // re-measures the webview's hit-test rect after the parent
              // goes from `display: none` to `display: flex`. Calling
              // loadURL synchronously here leaves the rect stale and
              // clicks on the restored page get mapped outside the
              // viewport.
              resumeRafRef.current = requestAnimationFrame(() => {
                resumeRafRef.current = null
                try {
                  webviewRef.current?.loadURL(snapshot.url)
                } catch {
                  // webContents not ready
                }
              })
            }
          } else {
            el.setAudioMuted(backgroundMutedRef.current)
          }
          suspendedStateRef.current = null
        } else if (suspendedStateRef.current === null && wasShownRef.current) {
          if (resumeRafRef.current !== null) {
            cancelAnimationFrame(resumeRafRef.current)
            resumeRafRef.current = null
          }
          const url = el.getURL()
          // TD-089: a background tab is already muted by `setMuted`, and
          // recording that as the user's own would keep it silent after
          // it becomes the active tab again.
          const muted = el.isAudioMuted() && !backgroundMutedRef.current
          el.stop()
          el.setAudioMuted(true)
          // about:blank swap is what actually halts the page's own JS;
          // stop() only cancels the current navigation. Without this,
          // timers / XHR polling / lazy-loaders on a video listing page
          // keep saturating the renderer's socket pool while the user
          // is on /watch/:id. Scroll preservation is the trade-off.
          el.loadURL('about:blank')
          suspendedStateRef.current = { url, muted }
        }
      } catch {
        // webContents not ready — setVisible's identity changes when
        // webContentsId flips from null to set, which re-fires the
        // caller's effect.
      }
    },
    [webContentsId]
  )

  const loadURL = useCallback((raw: string): boolean => {
    const checked = normaliseUrl(raw)
    if ('error' in checked) {
      setValidationError(checked.error)
      return false
    }
    setValidationError(null)
    setLoadError(null)
    const next = checked.url
    setUrl(next)
    setInputUrl(next)
    // TD-080: a load can now arrive while the tab is hidden, so the
    // guest is TD-039-suspended on about:blank. Loading into it would
    // be undone a moment later by the resume path restoring the
    // snapshot; rewriting the snapshot is what makes the new URL the
    // page the user finds when the tab comes forward.
    const suspended = suspendedStateRef.current
    if (suspended) {
      suspendedStateRef.current = { ...suspended, url: next }
    } else {
      webviewRef.current?.loadURL(next)
    }
    return true
  }, [])

  // TD-089: the tabs context holds one of these per open tab, so the
  // object's identity is what tells it a tab actually changed. Rebuilt
  // fresh on every render, a parent's re-render would look like news and
  // register-on-change would never settle.
  return useMemo(
    () => ({
      url,
      inputUrl,
      setInputUrl,
      loading,
      loadError,
      validationError,
      canGoBack,
      canGoForward,
      webContentsId,
      title,
      favicon,
      goBack,
      goForward,
      reload,
      loadURL,
      attachWebview,
      setMuted,
      setVisible
    }),
    [
      url,
      inputUrl,
      loading,
      loadError,
      validationError,
      canGoBack,
      canGoForward,
      webContentsId,
      title,
      favicon,
      goBack,
      goForward,
      reload,
      loadURL,
      attachWebview,
      setMuted,
      setVisible
    ]
  )
}
