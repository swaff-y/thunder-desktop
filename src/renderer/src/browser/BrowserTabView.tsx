import { useEffect } from 'react'
import { useBrowserTabsState } from './BrowserTabsContext'
import { useBrowserNav } from './useBrowserNav'
import EmbeddedWebview from './EmbeddedWebview'
import type { BrowserTab } from './useBrowserTabs'

/**
 * TD-089: one open page of the Browser tab.
 *
 * `useBrowserNav` is called here rather than lifted into the tabs hook,
 * so history, address bar, load errors and detected assets stay a single
 * webview's business. The nav is registered with the tabs context on the
 * way up, which is the only thing the chrome needs to drive the tab on
 * screen.
 */

// Module-level so the identity is stable across the host's re-renders —
// `EmbeddedWebview` explains what a fresh style object costs the webview
// underneath.
const VIEW_VISIBLE: React.CSSProperties = { display: 'flex', flex: 1, minWidth: 0 }
const VIEW_HIDDEN: React.CSSProperties = { display: 'none' }

interface BrowserTabViewProps {
  tab: BrowserTab
  active: boolean
  /**
   * The **Browser tab's** own visibility, not this tab's. TD-039 suspends
   * every open page together, so switching browser tabs costs no reload
   * and leaving for `/watch/:id` still puts them all to sleep.
   */
  browserVisible: boolean
}

export default function BrowserTabView({
  tab,
  active,
  browserVisible
}: BrowserTabViewProps): React.JSX.Element {
  const { open, registerTab, unregisterTab } = useBrowserTabsState()
  const nav = useBrowserNav(tab.initialUrl, open)
  const { setMuted } = nav

  useEffect(() => {
    registerTab(tab.id, nav)
  }, [tab.id, nav, registerTab])

  useEffect(() => {
    return () => unregisterTab(tab.id)
  }, [tab.id, unregisterTab])

  // One audio source at a time, as TD-071 did for MultiWatch.
  useEffect(() => {
    setMuted(!active)
  }, [active, setMuted])

  return (
    <div className="browser-tab-view" style={active ? VIEW_VISIBLE : VIEW_HIDDEN}>
      <EmbeddedWebview nav={nav} initialUrl={tab.initialUrl} visible={browserVisible} />
    </div>
  )
}
