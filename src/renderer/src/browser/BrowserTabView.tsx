import { memo, useEffect, useLayoutEffect } from 'react'
import { useBrowserTabActions } from './BrowserTabsContext'
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

function BrowserTabView({ tab, active, browserVisible }: BrowserTabViewProps): React.JSX.Element {
  const { open, registerTab, unregisterTab } = useBrowserTabActions()
  const nav = useBrowserNav(tab.initialUrl, open)
  const { setMuted } = nav

  // Before paint, not after: `BrowserPage` draws no chrome until the active
  // tab's nav is registered, and a passive effect would let the frame where
  // a brand-new tab is active but unregistered reach the screen — the
  // address bar and the assets rail blinking out on every `+`.
  useLayoutEffect(() => {
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

/**
 * A page load ticks several times a second and re-renders `BrowserPage`,
 * which would otherwise re-render all eight tabs. The props here are a
 * stable tab object and two booleans, so this is where that stops.
 */
export default memo(BrowserTabView)
