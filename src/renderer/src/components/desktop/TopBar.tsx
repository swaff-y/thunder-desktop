import { useState } from "react";
import { IoLogOutOutline, IoSettingsOutline } from "react-icons/io5";
import CartDropdown from "../shared/CartDropdown";
import SettingsModal from "./SettingsModal";

interface TopBarProps {
  onLogout: () => void;
}

export default function TopBar({ onLogout }: TopBarProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <header className="desktop-topbar">
      <div className="topbar-spacer" />
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
        }
        .topbar-spacer {
          flex: 1;
        }
        .topbar-icon-btn {
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
