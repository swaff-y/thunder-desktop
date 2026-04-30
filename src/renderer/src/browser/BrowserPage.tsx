import { useBrowserNav } from './useBrowserNav'
import BrowserChrome from './BrowserChrome'
import EmbeddedWebview from './EmbeddedWebview'

const INITIAL_URL = 'about:blank'

export default function BrowserPage(): React.JSX.Element {
  const nav = useBrowserNav(INITIAL_URL)

  return (
    <div className="browser-page">
      <BrowserChrome nav={nav} />
      <EmbeddedWebview nav={nav} initialUrl={INITIAL_URL} />

      <style>{`
        .browser-page {
          display: flex;
          flex-direction: column;
          height: 100%;
          margin: calc(var(--space-lg) * -1);
        }
      `}</style>
    </div>
  )
}
