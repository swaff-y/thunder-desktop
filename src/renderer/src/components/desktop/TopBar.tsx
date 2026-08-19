import { useEffect, useState } from "react";
import { IoLogOutOutline, IoSettingsOutline } from "react-icons/io5";
import CartDropdown from "../shared/CartDropdown";
import { useChatEnabled } from "../../hooks/useSettings";
import SettingsModal, { OPEN_SETTINGS_EVENT } from "./SettingsModal";

interface TopBarProps {
  onLogout: () => void;
  onAskCatalogue: () => void;
}

const isMac = window.thunder.platform === "darwin";

export default function TopBar({ onLogout, onAskCatalogue }: TopBarProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const chatEnabled = useChatEnabled();

  useEffect(() => {
    function handleOpenSettings(): void {
      setSettingsOpen(true);
    }
    window.addEventListener(OPEN_SETTINGS_EVENT, handleOpenSettings);
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, handleOpenSettings);
  }, []);

  return (
    <header className={`desktop-topbar${isMac ? " desktop-topbar--mac" : ""}`}>
      <div className="topbar-spacer" />
      {chatEnabled && (
        <button type="button" className="topbar-ask" onClick={onAskCatalogue}>
          Ask catalogue
        </button>
      )}
      <button
        className="topbar-icon-btn"
        onClick={() => setSettingsOpen(true)}
        aria-label="Settings"
      >
        <IoSettingsOutline size={20} />
      </button>
      <CartDropdown />
      <button className="topbar-logout" onClick={onLogout}>
        <IoLogOutOutline size={20} />
        <span>Logout</span>
      </button>

      <SettingsModal show={settingsOpen} onHide={() => setSettingsOpen(false)} />

      <style>{`
        .desktop-topbar {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: var(--space-sm);
          padding: var(--space-md) var(--space-lg);
          background: var(--color-bg);
          border-bottom: 1px solid var(--color-border);
          min-height: 60px;
          -webkit-app-region: drag;
        }
        .desktop-topbar--mac {
          padding-left: 70px;
        }
        .topbar-spacer {
          flex: 1;
        }
        .topbar-ask {
          -webkit-app-region: no-drag;
          background: var(--color-accent);
          border: none;
          border-radius: var(--radius-md);
          color: var(--color-text-on-accent);
          cursor: pointer;
          font-size: var(--text-body-sm);
          font-weight: var(--weight-medium);
          padding: var(--space-sm) var(--space-md);
        }
        .topbar-icon-btn {
          -webkit-app-region: no-drag;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          color: var(--color-text);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 0.2s;
        }
        .topbar-icon-btn:hover {
          background: var(--color-surface-light);
          color: var(--color-cta);
        }
        .topbar-logout {
          -webkit-app-region: no-drag;
          display: flex;
          align-items: center;
          gap: var(--space-sm);
          background: none;
          border: 1px solid var(--color-border);
          color: var(--color-text-muted);
          padding: var(--space-sm) var(--space-md);
          border-radius: var(--radius-md);
          cursor: pointer;
          font-size: var(--text-body-sm);
          transition: all 0.2s;
        }
        .topbar-logout:hover {
          color: var(--color-cta);
          border-color: var(--color-cta);
        }
      `}</style>
    </header>
  );
}
