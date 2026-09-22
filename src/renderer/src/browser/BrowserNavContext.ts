import { createContext, useCallback, useContext, type ReactNode } from 'react'
import React from 'react'
import { useNavigate } from 'react-router-dom'
import { BrowserTabActionsContext, BrowserTabsContext } from './BrowserTabsContext'
import { normaliseUrl } from './useBrowserNav'
import { useBrowserTabs } from './useBrowserTabs'

/**
 * TD-080: one owner for the embedded browser's navigation state, so
 * somewhere other than the address bar can point the Browser tab at a URL.
 *
 * TD-089: what it owns is now the tab strip rather than a single page —
 * `useBrowserTabs` holds the open tabs and each `BrowserTabView` registers
 * its own `useBrowserNav` with it. The provider still sits inside
 * `DesktopLayout`, so the tabs and the `<webview>`s they drive keep the
 * same lifetime they had.
 *
 * The state and the way in are two contexts, not one. A page load fires
 * several `nav` updates a second (loading, url, history flags); everything
 * outside the Browser tab wants only the door handle, and a single context
 * would re-render every chat image tile on every one of those ticks.
 */

/**
 * Opens `url` in a **new** browser tab and brings the Browser tab to the
 * front. TD-089: a new tab rather than the active one, so clicking a chat
 * image never throws away the page the user had open. A URL the address
 * bar would reject is rejected here too: no tab is created and the strip
 * says why.
 */
export type OpenInBrowserTab = (url: string) => void

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
  const tabs = useBrowserTabs()
  const navigate = useNavigate()
  const { open, refuse } = tabs.actions

  const openInBrowserTab = useCallback<OpenInBrowserTab>(
    (url) => {
      const checked = normaliseUrl(url)
      if ('error' in checked) {
        refuse(checked.error)
        return
      }
      if (!open(checked.url)) return
      onOpenBrowserTab?.()
      // Routing rather than a bare flag so TD-038's tab history records the
      // visit and Back leaves the Browser tab the way the sidebar entry does.
      navigate('/browser')
    },
    [open, refuse, navigate, onOpenBrowserTab]
  )

  return React.createElement(
    OpenInBrowserTabContext.Provider,
    { value: openInBrowserTab },
    React.createElement(
      BrowserTabActionsContext.Provider,
      { value: tabs.actions },
      React.createElement(BrowserTabsContext.Provider, { value: tabs }, children)
    )
  )
}

export function useOpenInBrowserTab(): OpenInBrowserTab {
  const value = useContext(OpenInBrowserTabContext)
  if (!value) throw new Error('useOpenInBrowserTab must be used within a BrowserNavProvider')
  return value
}
