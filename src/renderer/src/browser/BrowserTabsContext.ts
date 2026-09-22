import { createContext, useContext } from 'react'
import type { BrowserTabs } from './useBrowserTabs'

/**
 * TD-089: the Browser tab's open pages, shared by the strip that lists
 * them, the chrome that drives the active one, and each `BrowserTabView`
 * registering the nav it owns.
 *
 * `BrowserNavProvider` is what puts a value here — it owns the hook, so
 * `openInBrowserTab` can open a tab from the same state the strip draws.
 */
export const BrowserTabsContext = createContext<BrowserTabs | null>(null)

export function useBrowserTabsState(): BrowserTabs {
  const value = useContext(BrowserTabsContext)
  if (!value) throw new Error('useBrowserTabsState must be used within a BrowserNavProvider')
  return value
}
