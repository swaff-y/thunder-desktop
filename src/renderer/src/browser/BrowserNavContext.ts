import { createContext, useCallback, useContext, type ReactNode } from 'react'
import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useBrowserNav, type BrowserNav } from './useBrowserNav'

/**
 * TD-080: one owner for the embedded browser's navigation state, so
 * somewhere other than the address bar can point the Browser tab at a URL.
 *
 * `useBrowserNav` used to live inside `BrowserPage`, which made `loadURL`
 * reachable only from the chrome rendered beside it. Lifting it one level
 * up — still inside `DesktopLayout`, so the hook and the `<webview>` it
 * drives keep the same lifetime — leaves the browser itself untouched and
 * gives the rest of the app a way in.
 *
 * The state and the way in are two contexts, not one. A page load fires
 * several `nav` updates a second (loading, url, history flags); everything
 * outside the Browser tab wants only the door handle, and a single context
 * would re-render every chat image tile on every one of those ticks.
 */

export const INITIAL_URL = 'https://www.google.com'

/**
 * Loads `url` in the embedded webview and brings the Browser tab to the
 * front. A URL the address bar would reject is rejected here too: nothing
 * navigates and `nav.validationError` explains why.
 */
export type OpenInBrowserTab = (url: string) => void

const BrowserNavContext = createContext<BrowserNav | null>(null)
const OpenInBrowserTabContext = createContext<OpenInBrowserTab | null>(null)

interface BrowserNavProviderProps {
  children: ReactNode
  /**
   * Called when something asks for the Browser tab. `DesktopLayout` uses it
   * to close the chat drawer, which would otherwise sit over the page the
   * user just asked to see. Keep its identity stable — it is what keeps
   * `openInBrowserTab` stable for its consumers.
   */
  onOpenBrowserTab?: () => void
}

export function BrowserNavProvider({
  children,
  onOpenBrowserTab
}: BrowserNavProviderProps): React.JSX.Element {
  const nav = useBrowserNav(INITIAL_URL)
  const navigate = useNavigate()
  const { loadURL } = nav

  const openInBrowserTab = useCallback<OpenInBrowserTab>(
    (url) => {
      if (!loadURL(url)) return
      onOpenBrowserTab?.()
      // Routing rather than a bare flag so TD-038's tab history records the
      // visit and Back leaves the Browser tab the way the sidebar entry does.
      navigate('/browser')
    },
    [loadURL, navigate, onOpenBrowserTab]
  )

  return React.createElement(
    OpenInBrowserTabContext.Provider,
    { value: openInBrowserTab },
    React.createElement(BrowserNavContext.Provider, { value: nav }, children)
  )
}

export function useBrowserNavState(): BrowserNav {
  const value = useContext(BrowserNavContext)
  if (!value) throw new Error('useBrowserNavState must be used within a BrowserNavProvider')
  return value
}

export function useOpenInBrowserTab(): OpenInBrowserTab {
  const value = useContext(OpenInBrowserTabContext)
  if (!value) throw new Error('useOpenInBrowserTab must be used within a BrowserNavProvider')
  return value
}
