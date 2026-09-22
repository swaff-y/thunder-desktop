import { useCallback, useMemo, useState } from 'react'
import type { BrowserNav } from './useBrowserNav'

/**
 * TD-089: the open pages of the Browser tab, and which one is on screen.
 *
 * The strip is state; the pages are not. `useBrowserNav` stays one hook
 * per page — history, address bar, load errors and detected assets all
 * belong to a single `<webview>` — and each `BrowserTabView` registers
 * the nav it owns here, so the chrome can read the active one without a
 * second copy of any of it existing.
 *
 * TD-046 showed live background pages saturating the renderer's socket
 * pool, which is why the strip is capped rather than open-ended.
 */

export const INITIAL_URL = 'https://www.google.com'

export const MAX_BROWSER_TABS = 8

const CAP_MESSAGE = `That is the ${MAX_BROWSER_TABS}-tab limit. Close one to open another.`

export interface BrowserTab {
  id: string
  /** Where the tab's `<webview>` starts. Its live URL is `nav.url`. */
  initialUrl: string
}

/** What the strip draws: the tab, and whatever its page has said so far. */
export interface BrowserTabEntry {
  id: string
  title: string | null
  url: string
  favicon: string | null
  loading: boolean
}

/**
 * Everything that changes the strip. Held apart from the state above so a
 * `BrowserTabView` can take these without also taking a render on every
 * other tab's page load.
 */
export interface BrowserTabActions {
  /** Opens a foreground tab and answers whether there was room for it. */
  open: (url?: string) => boolean
  close: (id: string) => void
  activate: (id: string) => void
  /** Surfaces a refusal that happened before any tab was created. */
  refuse: (message: string) => void
  registerTab: (id: string, nav: BrowserNav) => void
  unregisterTab: (id: string) => void
}

export interface BrowserTabs {
  entries: BrowserTabEntry[]
  tabs: BrowserTab[]
  activeId: string
  /** The nav of the tab on screen, once it has registered itself. */
  activeNav: BrowserNav | undefined
  /** The cap, or a URL the address bar would reject — said in the strip
   *  rather than swallowed. */
  message: string | null
  actions: BrowserTabActions
}

let nextTabId = 0

function createTab(initialUrl: string): BrowserTab {
  nextTabId += 1
  return { id: `tab-${nextTabId}`, initialUrl }
}

export function useBrowserTabs(): BrowserTabs {
  const [tabs, setTabs] = useState<BrowserTab[]>(() => [createTab(INITIAL_URL)])
  const [activeId, setActiveId] = useState(() => tabs[0].id)
  const [navs, setNavs] = useState<Record<string, BrowserNav>>({})
  const [message, setMessage] = useState<string | null>(null)

  const open = useCallback(
    (url?: string): boolean => {
      if (tabs.length >= MAX_BROWSER_TABS) {
        setMessage(CAP_MESSAGE)
        return false
      }
      const tab = createTab(url ?? INITIAL_URL)
      setTabs((prev) => [...prev, tab])
      setActiveId(tab.id)
      setMessage(null)
      return true
    },
    [tabs.length]
  )

  const close = useCallback(
    (id: string): void => {
      const index = tabs.findIndex((tab) => tab.id === id)
      if (index === -1) return
      setMessage(null)

      const remaining = tabs.filter((tab) => tab.id !== id)
      if (remaining.length === 0) {
        // The Browser tab is never empty — an empty strip would leave
        // `BrowserPage` with no chrome to draw and TD-038's tab history
        // pointing at nothing.
        const fresh = createTab(INITIAL_URL)
        setTabs([fresh])
        setActiveId(fresh.id)
        return
      }

      setTabs(remaining)
      if (id !== activeId) return
      // The right-hand neighbour, or the left-hand one when the tab that
      // closed was last in the strip.
      setActiveId(remaining[Math.min(index, remaining.length - 1)].id)
    },
    [tabs, activeId]
  )

  const activate = useCallback((id: string): void => {
    setActiveId(id)
    setMessage(null)
  }, [])

  const refuse = useCallback((reason: string): void => {
    setMessage(reason)
  }, [])

  const registerTab = useCallback((id: string, nav: BrowserNav): void => {
    setNavs((prev) => (prev[id] === nav ? prev : { ...prev, [id]: nav }))
  }, [])

  const unregisterTab = useCallback((id: string): void => {
    setNavs((prev) => {
      if (!(id in prev)) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })
  }, [])

  // Identity changes only when a tab opens or closes, which is what keeps
  // a page load out of every other tab's render.
  const actions = useMemo(
    () => ({ open, close, activate, refuse, registerTab, unregisterTab }),
    [open, close, activate, refuse, registerTab, unregisterTab]
  )

  const entries = tabs.map((tab) => {
    const nav = navs[tab.id]
    return {
      id: tab.id,
      title: nav?.title ?? null,
      url: nav?.url ?? tab.initialUrl,
      favicon: nav?.favicon ?? null,
      loading: nav?.loading ?? false
    }
  })

  return {
    entries,
    tabs,
    activeId,
    activeNav: navs[activeId],
    message,
    actions
  }
}
