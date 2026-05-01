import { useBrowserNav } from './useBrowserNav'
import { useDownloads } from './useDownloads'
import BrowserChrome from './BrowserChrome'
import EmbeddedWebview from './EmbeddedWebview'
import DetectedAssetsPanel from './DetectedAssetsPanel'
import DownloadsDrawer from './DownloadsDrawer'

const INITIAL_URL = 'about:blank'

export default function BrowserPage(): React.JSX.Element {
  const nav = useBrowserNav(INITIAL_URL)
  const downloads = useDownloads()

  return (
    <div className="browser-page">
      <BrowserChrome nav={nav} />
      <div className="browser-page-body">
        <EmbeddedWebview nav={nav} initialUrl={INITIAL_URL} />
        <DetectedAssetsPanel nav={nav} onDownload={downloads.start} />
      </div>
      <DownloadsDrawer downloads={downloads} />

      <style>{`
        .browser-page {
          display: flex;
          flex-direction: column;
          height: 100%;
          margin: calc(var(--space-lg) * -1);
        }
        .browser-page-body {
          flex: 1;
          display: flex;
          min-height: 0;
        }
      `}</style>
    </div>
  )
}
