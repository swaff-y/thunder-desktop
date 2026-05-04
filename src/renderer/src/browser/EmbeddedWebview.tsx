/* eslint-disable react/no-unknown-property -- TD-021: Electron's
   `<webview>` accepts non-DOM attributes (`partition`, `webpreferences`,
   `useragent`, `allowpopups`) that React's HTML lint doesn't know
   about. The webview type augmentation in `webview.d.ts` keeps the
   TypeScript side honest. */
import { useEffect, useState } from 'react'
import { THUNDER_BROWSER_PARTITION } from '../../../shared/browser'
import type { BrowserNav } from './useBrowserNav'

/**
 * TD-021: thin wrapper around Electron's `<webview>` tag.
 *
 * The user-agent has to be resolved before the element mounts because
 * `useragent` is a static attribute that the webview reads once at
 * attach time — flipping it after the first load doesn't change what
 * the remote sees. So we render a placeholder while the value is in
 * flight, then mount the webview with the resolved UA.
 */

const FALLBACK_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

interface EmbeddedWebviewProps {
  nav: BrowserNav
  initialUrl: string
  visible: boolean
}

export default function EmbeddedWebview({
  nav,
  initialUrl,
  visible
}: EmbeddedWebviewProps): React.JSX.Element {
  // Destructured up front so the React Compiler eslint pass doesn't
  // pessimistically taint the whole `nav` object as ref-derived after
  // we hand `attachWebview` to a JSX `ref` prop below.
  const { attachWebview, loadError, reload, setVisible } = nav
  const [userAgent, setUserAgent] = useState<string | null>(null)

  useEffect(() => {
    setVisible(visible)
  }, [visible, setVisible])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      let ua: string | undefined
      try {
        ua = await window.thunder?.settings.get('userAgent')
      } catch {
        // IPC unavailable (vitest, etc.) — fall through to fallback.
      }
      if (cancelled) return
      setUserAgent(ua && ua.length > 0 ? ua : FALLBACK_USER_AGENT)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="embedded-webview">
      {userAgent !== null && (
        <webview
          ref={attachWebview}
          src={initialUrl}
          partition={THUNDER_BROWSER_PARTITION}
          webpreferences="contextIsolation=yes,sandbox=yes,nodeIntegration=no"
          useragent={userAgent}
          allowpopups={false}
          style={{
            display: loadError ? 'none' : 'flex',
            flex: 1,
            width: '100%',
            height: '100%'
          }}
        />
      )}

      {loadError && (
        <div className="webview-error" role="alert">
          <h2>Page failed to load</h2>
          <p>{loadError}</p>
          <button type="button" className="webview-retry" onClick={reload}>
            Retry
          </button>
        </div>
      )}

      <style>{`
        .embedded-webview {
          flex: 1;
          display: flex;
          position: relative;
          background: var(--color-bg);
          min-height: 0;
        }
        .embedded-webview webview {
          border: none;
        }
        .webview-error {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: var(--space-md);
          padding: var(--space-xl);
          color: var(--color-text);
          text-align: center;
        }
        .webview-error h2 {
          margin: 0;
          font-size: var(--text-h2);
        }
        .webview-error p {
          margin: 0;
          color: var(--color-text-muted);
          max-width: 32rem;
        }
        .webview-retry {
          padding: 8px 16px;
          background: var(--color-accent);
          color: white;
          border: none;
          border-radius: var(--radius-sm);
          font-weight: var(--weight-bold);
          cursor: pointer;
        }
      `}</style>
    </div>
  )
}
