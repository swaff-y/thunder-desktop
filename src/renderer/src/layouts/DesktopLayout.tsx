import { useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import Sidebar from "../components/desktop/Sidebar";
import TopBar from "../components/desktop/TopBar";
import BrowserPage from "../browser/BrowserPage";

interface DesktopLayoutProps {
  children: React.ReactNode;
}

export default function DesktopLayout({ children }: DesktopLayoutProps): React.JSX.Element {
  const { logout } = useAuth();
  const location = useLocation();
  const isLogin = location.pathname === "/login";
  const isBrowser = location.pathname === "/browser";

  if (isLogin) {
    return <div className="desktop-login-wrapper">{children}</div>;
  }

  return (
    <div className="desktop-layout">
      <Sidebar />
      <div className="desktop-main">
        <TopBar onLogout={logout} />
        {/* TD-035: BrowserPage stays mounted across tab switches; only
            one of it and .desktop-content fills the column at a time. */}
        <div className="desktop-content" style={{ display: isBrowser ? "none" : "block" }}>
          {children}
        </div>
        <BrowserPage visible={isBrowser} />
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
