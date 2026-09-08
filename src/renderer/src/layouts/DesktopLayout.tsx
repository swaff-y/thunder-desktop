import { useCallback, useState } from "react";
import { useLocation, useMatch } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useChatEnabled } from "../hooks/useSettings";
import Sidebar from "../components/desktop/Sidebar";
import TopBar from "../components/desktop/TopBar";
import BrowserPage from "../browser/BrowserPage";
import { BrowserNavProvider } from "../browser/BrowserNavContext";
import ChatDrawer from "../components/chat/ChatDrawer";
import Watch from "../pages/Watch";

interface DesktopLayoutProps {
  children: React.ReactNode;
}

export default function DesktopLayout({ children }: DesktopLayoutProps): React.JSX.Element {
  const { logout } = useAuth();
  const location = useLocation();
  const isLogin = location.pathname === "/login";
  const isBrowser = location.pathname === "/browser";
  const watchMatch = useMatch("/watch/:id");
  const isWatch = !!watchMatch;

  // Persist the most recently visited /watch/:id so the Watch component
  // (and its <video> element) stays mounted across tab switches; the
  // playback position is preserved as long as it isn't unmounted.
  const watchId = watchMatch?.params.id ?? null;
  const [activeWatchId, setActiveWatchId] = useState<string | null>(watchId);
  // Set during render, not in an effect: an effect runs after paint, so the
  // layout would draw the previous record once before correcting itself.
  // Leaving /watch/:id keeps the id — only clearActiveWatch drops it.
  if (watchId !== null && watchId !== activeWatchId) setActiveWatchId(watchId);

  // The drawer is mounted beside the page column so the conversation
  // outlives navigation, the way BrowserPage and Watch do.
  const [chatOpen, setChatOpen] = useState(false);
  const chatEnabled = useChatEnabled();
  // Turning the chat off in Settings closes the drawer for good — turning it
  // back on must not spring it open again.
  if (chatOpen && !chatEnabled) setChatOpen(false);

  function clearActiveWatch(): void {
    setActiveWatchId(null);
  }

  function openChat(): void {
    setChatOpen(true);
  }

  // Stable identity: it is handed to BrowserNavProvider, which builds
  // `openInBrowserTab` from it and hands that to every chat image tile.
  const closeChat = useCallback((): void => {
    setChatOpen(false);
  }, []);

  if (isLogin) {
    return <div className="desktop-login-wrapper">{children}</div>;
  }

  const childrenHidden = isBrowser || isWatch;

  // TD-080: the provider wraps both the Browser tab and the chat drawer, so
  // a web image in the chat can point the tab at a URL — and closing the
  // drawer is what lets the user see the page land.
  return (
    <BrowserNavProvider onOpenBrowserTab={closeChat}>
      <div className="desktop-layout">
        <Sidebar />
        <div className="desktop-main">
          <TopBar onLogout={logout} onAskCatalogue={openChat} />
          {/* TD-035: BrowserPage stays mounted across tab switches; only
              one of it and .desktop-content fills the column at a time.
              TD-038 follow-up: Watch is mounted persistently for the same
              reason, so navigating away and back doesn't reload the video. */}
          <div className="desktop-content" style={{ display: childrenHidden ? "none" : "block" }}>
            {children}
          </div>
          <BrowserPage visible={isBrowser} />
          {activeWatchId && (
            <div className="desktop-content" style={{ display: isWatch ? "block" : "none" }}>
              <Watch key={activeWatchId} id={activeWatchId} onBack={clearActiveWatch} />
            </div>
          )}
        </div>
        <ChatDrawer open={chatOpen} onClose={closeChat} />

        <style>{`
          .desktop-login-wrapper {
            min-height: 100vh;
          }
          .desktop-layout {
            display: flex;
            height: 100vh;
            background: var(--color-bg);
          }
          .desktop-main {
            flex: 1;
            display: flex;
            flex-direction: column;
            min-width: 0;
          }
          .desktop-content {
            flex: 1;
            padding: var(--space-lg);
            overflow-y: auto;
            overflow-x: hidden;
            min-width: 0;
          }
        `}</style>
      </div>
    </BrowserNavProvider>
  );
}
