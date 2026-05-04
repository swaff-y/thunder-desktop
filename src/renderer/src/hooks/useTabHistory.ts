import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import React from "react";
import { useLocation } from "react-router-dom";
import { CATEGORIES, type CategoryType, type ContentRecord } from "../types";

export type TabKey = CategoryType;

const TAB_KEYS: readonly TabKey[] = CATEGORIES.map((c) => c.type);

const INITIAL_TAB_PATHS: Record<TabKey, string> = Object.fromEntries(
  TAB_KEYS.map((tab) => [tab, `/${tab}`])
) as Record<TabKey, string>;

const INITIAL_DETAIL_PATHS: Record<TabKey, string | null> = Object.fromEntries(
  TAB_KEYS.map((tab) => [tab, null])
) as Record<TabKey, string | null>;

interface TabHistoryContextValue {
  activeTab: TabKey | null;
  resolveTabClick: (tab: TabKey) => string;
  resolveWatchBackTarget: (record: ContentRecord | undefined) => string;
  clearHistory: () => void;
}

const TabHistoryContext = createContext<TabHistoryContextValue | null>(null);

function findDirectTab(pathname: string): TabKey | null {
  for (const tab of TAB_KEYS) {
    if (pathname === `/${tab}` || pathname.startsWith(`/${tab}/`)) return tab;
  }
  return null;
}

export function TabHistoryProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [tabPaths, setTabPaths] = useState(INITIAL_TAB_PATHS);
  const [lastDetailPath, setLastDetailPath] = useState(INITIAL_DETAIL_PATHS);
  // Snapshot of the most recent direct-tab pathname. Used to attribute a
  // freshly-entered /watch/:id to the tab the user just left, before that
  // path has been written into tabPaths by the effect below.
  const [lastDirectTab, setLastDirectTab] = useState<TabKey | null>(null);

  useEffect(() => {
    const pathname = location.pathname;
    const directTab = findDirectTab(pathname);

    if (directTab) {
      setLastDirectTab(directTab);
      setTabPaths((prev) =>
        prev[directTab] === pathname ? prev : { ...prev, [directTab]: pathname }
      );
      setLastDetailPath((prev) => {
        if (pathname === `/${directTab}`) {
          return prev[directTab] === null ? prev : { ...prev, [directTab]: null };
        }
        return prev[directTab] === pathname
          ? prev
          : { ...prev, [directTab]: pathname };
      });
      return;
    }

    if (pathname.startsWith("/watch/")) {
      setTabPaths((prev) => {
        let originating: TabKey | null = null;
        for (const tab of TAB_KEYS) {
          if (prev[tab] === pathname) {
            originating = tab;
            break;
          }
        }
        if (!originating) originating = lastDirectTab;
        if (!originating) return prev;
        return prev[originating] === pathname
          ? prev
          : { ...prev, [originating]: pathname };
      });
    }
  }, [location.pathname, lastDirectTab]);

  const activeTab = useMemo<TabKey | null>(() => {
    const pathname = location.pathname;
    const direct = findDirectTab(pathname);
    if (direct) return direct;
    if (pathname.startsWith("/watch/")) {
      for (const tab of TAB_KEYS) {
        if (tabPaths[tab] === pathname) return tab;
      }
      return lastDirectTab;
    }
    return null;
  }, [location.pathname, tabPaths, lastDirectTab]);

  // Returns the path to navigate to when the user clicks `tab` in the sidebar.
  // Side-effect: clicking the currently-active tab also resets that tab's
  // remembered sub-path (the desktop "home" gesture from AC behaviour).
  const resolveTabClick = useCallback(
    (tab: TabKey): string => {
      if (activeTab === tab) {
        setTabPaths((prev) =>
          prev[tab] === `/${tab}` ? prev : { ...prev, [tab]: `/${tab}` }
        );
        setLastDetailPath((prev) =>
          prev[tab] === null ? prev : { ...prev, [tab]: null }
        );
        return `/${tab}`;
      }
      return tabPaths[tab];
    },
    [activeTab, tabPaths]
  );

  const resolveWatchBackTarget = useCallback(
    (record: ContentRecord | undefined): string => {
      if (activeTab) return lastDetailPath[activeTab] ?? `/${activeTab}`;
      if (!record) return "/";
      if (record.actors.length > 0) return "/actors";
      if (record.series) return "/series";
      if (record.movie) return "/movies";
      if (record.tags.length > 0) return "/tags";
      return "/";
    },
    [activeTab, lastDetailPath]
  );

  const clearHistory = useCallback(() => {
    setTabPaths(INITIAL_TAB_PATHS);
    setLastDetailPath(INITIAL_DETAIL_PATHS);
    setLastDirectTab(null);
  }, []);

  return React.createElement(
    TabHistoryContext.Provider,
    {
      value: {
        activeTab,
        resolveTabClick,
        resolveWatchBackTarget,
        clearHistory,
      },
    },
    children
  );
}

export function useTabHistory(): TabHistoryContextValue {
  const context = useContext(TabHistoryContext);
  if (!context) {
    throw new Error("useTabHistory must be used within a TabHistoryProvider");
  }
  return context;
}
