import { createContext, useContext } from 'react'
import type { BrowserTabActions, BrowserTabs } from './useBrowserTabs'

/**
 * TD-089: the Browser tab's open pages, shared by the strip that lists
 * them, the chrome that drives the active one, and each `BrowserTabView`
 * registering the nav it owns.
 *
 * Two contexts again, for the reason `BrowserNavContext` splits its own:
 * a loading page ticks several times a second, and a `BrowserTabView`
 * wants none of that — only the handful of actions, whose identity
 * changes when a tab opens or closes and not before. One context would
 * put every tab's render on every other tab's page load.
 *
 * `BrowserNavProvider` is what puts values here — it owns the hook, so
 * `openInBrowserTab` can open a tab from the same state the strip draws.
 */
export const BrowserTabsContext = createContext<BrowserTabs | null>(null)

export const BrowserTabActionsContext = createContext<BrowserTabActions | null>(null)

export function useBrowserTabsState(): BrowserTabs {
  const value = useContext(BrowserTabsContext)
  if (!value) throw new Error('useBrowserTabsState must be used within a BrowserNavProvider')
  return value
}

export function useBrowserTabActions(): BrowserTabActions {
  const value = useContext(BrowserTabActionsContext)
  if (!value) throw new Error('useBrowserTabActions must be used within a BrowserNavProvider')
  return value
}
