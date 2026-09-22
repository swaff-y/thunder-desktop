import { useBrowserTabsState } from './BrowserTabsContext'
import { useDownloads } from './useDownloads'
import BrowserChrome from './BrowserChrome'
import BrowserTabStrip from './BrowserTabStrip'
import BrowserTabView from './BrowserTabView'
import DetectedAssetsPanel from './DetectedAssetsPanel'
import DownloadsDrawer from './DownloadsDrawer'

interface BrowserPageProps {
  visible: boolean
}

export default function BrowserPage({ visible }: BrowserPageProps): React.JSX.Element {
  const tabs = useBrowserTabsState()
  const downloads = useDownloads()
  // Undefined for the first frame only, before the active tab's view has
  // registered the nav it owns.
  const activeNav = tabs.activeNav

  return (
    <div className="browser-page" style={{ display: visible ? 'flex' : 'none' }}>
      <BrowserTabStrip
        entries={tabs.entries}
        activeId={tabs.activeId}
        message={tabs.message}
        onActivate={tabs.activate}
        onClose={tabs.close}
        onOpen={tabs.open}
      />
      {activeNav && <BrowserChrome nav={activeNav} />}
      <div className="browser-page-body">
        {/* Every tab's webview stays mounted — only the active one is
            displayed, the same mechanism TD-035 uses for the whole page —
            so switching tabs costs no reload and loses no page state. */}
        {tabs.tabs.map((tab) => (
          <BrowserTabView
            key={tab.id}
            tab={tab}
            active={tab.id === tabs.activeId}
            browserVisible={visible}
          />
        ))}
        {activeNav && <DetectedAssetsPanel nav={activeNav} onDownload={downloads.start} />}
      </div>
      {/* Downloads are global: one drawer for every tab, and a download
          outlives the tab that started it (TD-042). */}
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
