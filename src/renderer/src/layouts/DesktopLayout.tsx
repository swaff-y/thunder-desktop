import { useEffect, useState } from "react";
import { useLocation, useMatch } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import Sidebar from "../components/desktop/Sidebar";
import TopBar from "../components/desktop/TopBar";
import BrowserPage from "../browser/BrowserPage";
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
  const [activeWatchId, setActiveWatchId] = useState<string | null>(
    watchMatch?.params.id ?? null
  );
  useEffect(() => {
    const id = watchMatch?.params.id;
    if (id) setActiveWatchId(id);
  }, [watchMatch?.params.id]);

  if (isLogin) {
    return <div className="desktop-login-wrapper">{children}</div>;
  }

  const childrenHidden = isBrowser || isWatch;

  return (
    <div className="desktop-layout">
      <Sidebar />
      <div className="desktop-main">
        <TopBar onLogout={logout} />
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
            <Watch key={activeWatchId} id={activeWatchId} />
          </div>
        )}
      </div>

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
  );
}
