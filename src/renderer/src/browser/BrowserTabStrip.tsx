import { useEffect, useRef } from 'react'
import type { BrowserTabEntry } from './useBrowserTabs'

/**
 * TD-089: the Browser tab's own tab strip.
 *
 * Presentational — the open tabs, which one is active and the refusals
 * all live in `useBrowserTabs`. Tabs are buttons in a list rather than
 * an ARIA tablist: the pattern comes with arrow-key ownership, and
 * keyboard shortcuts are their own ticket.
 */

const TAB_MIN_WIDTH = 120
const TAB_MAX_WIDTH = 200

interface BrowserTabStripProps {
  entries: BrowserTabEntry[]
  activeId: string
  message: string | null
  onActivate: (id: string) => void
  onClose: (id: string) => void
  onOpen: () => void
}

/** The page's own name, or the host it came from until that arrives. */
function labelFor(entry: BrowserTabEntry): string {
  if (entry.title !== null) return entry.title
  try {
    return new URL(entry.url).hostname || entry.url
  } catch {
    return entry.url
  }
}

export default function BrowserTabStrip({
  entries,
  activeId,
  message,
  onActivate,
  onClose,
  onOpen
}: BrowserTabStripProps): React.JSX.Element {
  function handleOpen(): void {
    onOpen()
  }

  return (
    <div className="browser-tab-strip">
      <div className="browser-tab-strip-row">
        <ul className="browser-tab-list">
          {entries.map((entry) => (
            <TabItem
              key={entry.id}
              entry={entry}
              active={entry.id === activeId}
              onActivate={onActivate}
              onClose={onClose}
            />
          ))}
        </ul>
        <button type="button" className="browser-tab-new" onClick={handleOpen} aria-label="New tab">
          +
        </button>
      </div>

      {message !== null && (
        <p className="browser-tab-message" role="status">
          {message}
        </p>
      )}

      <style>{`
        .browser-tab-strip {
          display: flex;
          flex-direction: column;
          background: var(--color-bg-alt);
          border-bottom: 1px solid var(--color-border);
        }
        .browser-tab-strip-row {
          display: flex;
          align-items: stretch;
          gap: var(--space-xs);
          padding: var(--space-xs) var(--space-sm);
          min-width: 0;
        }
        .browser-tab-list {
          display: flex;
          align-items: stretch;
          gap: var(--space-xs);
          margin: 0;
          padding: 0;
          list-style: none;
          flex: 1;
          min-width: 0;
          overflow-x: auto;
          scrollbar-width: thin;
        }
        .browser-tab-item {
          display: flex;
          align-items: center;
          flex: 0 0 auto;
          min-width: ${TAB_MIN_WIDTH}px;
          max-width: ${TAB_MAX_WIDTH}px;
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
        }
        .browser-tab-item--active {
          background: var(--color-bg);
          border-color: var(--color-accent);
        }
        .browser-tab {
          display: flex;
          align-items: center;
          gap: var(--space-xs);
          flex: 1;
          min-width: 0;
          padding: 4px var(--space-sm);
          background: transparent;
          border: none;
          color: var(--color-text-muted);
          font-size: var(--text-body-sm);
          cursor: pointer;
          text-align: left;
        }
        .browser-tab-item--active .browser-tab {
          color: var(--color-text);
        }
        .browser-tab-title {
          flex: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .browser-tab-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 14px;
          width: 14px;
          height: 14px;
        }
        .browser-tab-favicon {
          width: 14px;
          height: 14px;
        }
        .browser-tab-spinner {
          width: 12px;
          height: 12px;
          border: 2px solid var(--color-border);
          border-top-color: var(--color-accent);
          border-radius: 50%;
          animation: browser-tab-spin 0.8s linear infinite;
        }
        @keyframes browser-tab-spin {
          to { transform: rotate(360deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .browser-tab-spinner { animation: none; }
        }
        .browser-tab-close {
          flex: 0 0 auto;
          padding: 2px 6px;
          margin-right: 2px;
          background: transparent;
          border: none;
          border-radius: var(--radius-sm);
          color: var(--color-text-muted);
          font-size: var(--text-body);
          line-height: 1;
          cursor: pointer;
        }
        .browser-tab-close:hover {
          background: var(--color-surface-light);
          color: var(--color-text);
        }
        .browser-tab-new {
          flex: 0 0 auto;
          padding: 2px 10px;
          background: transparent;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          color: var(--color-text);
          font-size: var(--text-body);
          line-height: 1;
          cursor: pointer;
        }
        .browser-tab-new:hover {
          background: var(--color-surface);
          border-color: var(--color-accent-light);
        }
        .browser-tab-message {
          margin: 0;
          padding: 4px var(--space-sm);
          color: var(--color-text-muted);
          font-size: var(--text-body-sm);
        }
      `}</style>
    </div>
  )
}

interface TabItemProps {
  entry: BrowserTabEntry
  active: boolean
  onActivate: (id: string) => void
  onClose: (id: string) => void
}

function TabItem({ entry, active, onActivate, onClose }: TabItemProps): React.JSX.Element {
  const itemRef = useRef<HTMLLIElement>(null)
  const label = labelFor(entry)

  // The strip scrolls rather than shrinking its tabs, so the tab that
  // becomes active has to be brought back into view.
  useEffect(() => {
    if (active) itemRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [active])

  function handleActivate(): void {
    onActivate(entry.id)
  }

  function handleClose(): void {
    onClose(entry.id)
  }

  return (
    <li
      ref={itemRef}
      className={active ? 'browser-tab-item browser-tab-item--active' : 'browser-tab-item'}
    >
      <button
        type="button"
        className="browser-tab"
        onClick={handleActivate}
        aria-current={active ? 'true' : undefined}
        title={entry.url}
      >
        <span className="browser-tab-icon">
          {entry.loading ? (
            <span className="browser-tab-spinner" aria-hidden="true" />
          ) : (
            entry.favicon !== null && (
              <img className="browser-tab-favicon" src={entry.favicon} alt="" />
            )
          )}
        </span>
        <span className="browser-tab-title">{label}</span>
      </button>
      <button
        type="button"
        className="browser-tab-close"
        onClick={handleClose}
        aria-label={`Close ${label}`}
      >
        ×
      </button>
    </li>
  )
}
