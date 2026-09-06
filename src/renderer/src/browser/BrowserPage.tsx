import { INITIAL_URL, useBrowserNavState } from './BrowserNavContext'
import { useDownloads } from './useDownloads'
import BrowserChrome from './BrowserChrome'
import EmbeddedWebview from './EmbeddedWebview'
import DetectedAssetsPanel from './DetectedAssetsPanel'
import DownloadsDrawer from './DownloadsDrawer'

interface BrowserPageProps {
  visible: boolean
}

export default function BrowserPage({ visible }: BrowserPageProps): React.JSX.Element {
  const nav = useBrowserNavState()
  const downloads = useDownloads()

  return (
    <div className="browser-page" style={{ display: visible ? 'flex' : 'none' }}>
      <BrowserChrome nav={nav} />
      <div className="browser-page-body">
        <EmbeddedWebview nav={nav} initialUrl={INITIAL_URL} visible={visible} />
        <DetectedAssetsPanel nav={nav} onDownload={downloads.start} />
      </div>
      <DownloadsDrawer downloads={downloads} />

      <style>{`
        .browser-page {
          flex: 1;
          flex-direction: column;
          min-height: 0;
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
