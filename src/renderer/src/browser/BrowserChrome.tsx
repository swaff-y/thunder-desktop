import { useState, type FormEvent } from 'react'
import { IoArrowBack, IoArrowForward, IoRefresh, IoCloseCircle } from 'react-icons/io5'
import type { BrowserNav } from './useBrowserNav'

interface BrowserChromeProps {
  nav: BrowserNav
}

export default function BrowserChrome({ nav }: BrowserChromeProps): React.JSX.Element {
  // Local draft mirrors `nav.inputUrl` so the address bar reflects
  // webview-driven navigations (clicked link, back/forward, redirect).
  // Sync via the "store-prev-prop in state" pattern instead of `useEffect`
  // — the effect form re-renders twice and the linter (rightly) flags it.
  const [draft, setDraft] = useState(nav.inputUrl)
  const [prevInput, setPrevInput] = useState(nav.inputUrl)
  if (prevInput !== nav.inputUrl) {
    setPrevInput(nav.inputUrl)
    setDraft(nav.inputUrl)
  }

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault()
    nav.loadURL(draft)
  }

  return (
    <div className="browser-chrome">
      <div className="browser-chrome-row">
        <button
          type="button"
          className="chrome-btn"
          onClick={nav.goBack}
          disabled={!nav.canGoBack}
          aria-label="Back"
        >
          <IoArrowBack size={18} />
        </button>
        <button
          type="button"
          className="chrome-btn"
          onClick={nav.goForward}
          disabled={!nav.canGoForward}
          aria-label="Forward"
        >
          <IoArrowForward size={18} />
        </button>
        <button type="button" className="chrome-btn" onClick={nav.reload} aria-label="Reload">
          {nav.loading ? <IoCloseCircle size={18} /> : <IoRefresh size={18} />}
        </button>

        <form className="chrome-address" onSubmit={onSubmit}>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Enter URL or hostname"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            aria-label="Address"
          />
          <button type="submit" className="chrome-btn chrome-go">
            Go
          </button>
        </form>
      </div>

      {nav.loading && <div className="chrome-progress" aria-hidden="true" />}
      {nav.validationError && (
        <div className="chrome-validation" role="alert">
          {nav.validationError}
        </div>
      )}

      <style>{`
        .browser-chrome {
          display: flex;
          flex-direction: column;
          background: var(--color-surface);
          border-bottom: 1px solid var(--color-border);
        }
        .browser-chrome-row {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
          padding: var(--space-sm);
        }
        .chrome-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 6px 10px;
          background: transparent;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          color: var(--color-text);
          cursor: pointer;
        }
        .chrome-btn:hover:not(:disabled) {
          background: rgba(14, 165, 233, 0.08);
        }
        .chrome-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .chrome-address {
          flex: 1;
          display: flex;
          gap: var(--space-sm);
          align-items: center;
        }
        .chrome-address input {
          flex: 1;
          padding: 6px 10px;
          font-size: var(--text-body);
          background: var(--color-bg);
          color: var(--color-text);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          outline: none;
        }
        .chrome-address input:focus {
          border-color: var(--color-accent);
        }
        .chrome-go {
          background: var(--color-accent);
          color: white;
          border-color: var(--color-accent);
          font-weight: var(--weight-bold);
        }
        .chrome-progress {
          height: 2px;
          background: linear-gradient(
            90deg,
            transparent 0%,
            var(--color-accent) 50%,
            transparent 100%
          );
          background-size: 200% 100%;
          animation: chrome-progress-slide 1.2s ease-in-out infinite;
        }
        .chrome-validation {
          padding: 4px var(--space-sm);
          color: #ef4444;
          font-size: var(--text-body-sm);
          background: rgba(239, 68, 68, 0.08);
        }
        @keyframes chrome-progress-slide {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  )
}
