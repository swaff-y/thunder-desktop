import { useEffect, useRef, useState } from "react";
import ChatPanel, { COMPOSER_INPUT_ID } from "./ChatPanel";

interface ChatDrawerProps {
  open: boolean;
  onClose: () => void;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The chat as a right-anchored drawer over the page: the page keeps its own
 * content, and the drawer widens when a result needs the room.
 *
 * Mounting only while open is what makes "starts narrow on every open" and
 * "focus goes back where it came from" fall out of the component lifecycle.
 */
export default function ChatDrawer({ open, onClose }: ChatDrawerProps): React.JSX.Element | null {
  if (!open) return null;
  return <Drawer onClose={onClose} />;
}

function Drawer({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [isWide, setIsWide] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Opening hands the keyboard the composer; closing hands it back to
  // whatever opened the drawer, which is the top bar button.
  useEffect(() => {
    const opener = document.activeElement;
    panelRef.current?.querySelector<HTMLTextAreaElement>(`#${COMPOSER_INPUT_ID}`)?.focus();
    return () => {
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, []);

  // aria-modal is a promise to the reader that nothing behind the scrim is
  // reachable, so Tab has to wrap inside the panel rather than walk out
  // into the sidebar and the top bar.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const leavingBackwards = event.shiftKey && document.activeElement === first;
      const leavingForwards = !event.shiftKey && document.activeElement === last;
      if (leavingBackwards) {
        event.preventDefault();
        last.focus();
      } else if (leavingForwards) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function handleToggleWidth(): void {
    setIsWide((wide) => !wide);
  }

  return (
    <>
      {/* The Close button and Escape are the accessible ways out; the scrim
          is the pointer shortcut and stays out of the a11y tree. */}
      <div className="chat-drawer-scrim" aria-hidden="true" onClick={onClose} />

      <div
        ref={panelRef}
        className={`chat-drawer${isWide ? " chat-drawer--wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Catalogue chat"
      >
        <header className="chat-drawer-header">
          <h2 className="chat-drawer-title">Catalogue chat</h2>
          <button type="button" className="chat-drawer-btn" onClick={handleToggleWidth}>
            {isWide ? "Narrow" : "Widen"}
          </button>
          <button type="button" className="chat-drawer-btn" onClick={onClose}>
            Close
          </button>
        </header>

        <ChatPanel />
      </div>

      <style>{`
        .chat-drawer-scrim {
          background: rgba(0, 0, 0, 0.42);
          inset: 0;
          position: absolute;
          z-index: 1040;
        }
        .chat-drawer {
          background: var(--color-surface);
          border-left: 1px solid var(--color-border);
          bottom: 0;
          box-shadow: -18px 0 44px rgba(0, 0, 0, 0.45);
          display: flex;
          flex-direction: column;
          position: absolute;
          right: 0;
          top: 0;
          transition: width 0.18s ease;
          width: 560px;
          z-index: 1041;
        }
        .chat-drawer--wide {
          width: 880px;
        }
        .chat-drawer-header {
          align-items: center;
          border-bottom: 1px solid var(--color-border);
          display: flex;
          flex: none;
          gap: var(--space-sm);
          padding: var(--space-md);
        }
        .chat-drawer-title {
          color: var(--color-text);
          flex: 1;
          font-size: var(--text-h3);
          font-weight: var(--weight-semibold);
          margin: 0;
        }
        .chat-drawer-btn {
          background: none;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-xl);
          color: var(--color-text-muted);
          cursor: pointer;
          font-size: var(--text-caption);
          padding: var(--space-xs) var(--space-md);
        }
        .chat-drawer-btn:hover {
          border-color: var(--color-accent);
          color: var(--color-accent);
        }
        @media (prefers-reduced-motion: reduce) {
          .chat-drawer {
            transition: none;
          }
        }
      `}</style>
    </>
  );
}
