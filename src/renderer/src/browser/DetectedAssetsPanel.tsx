import { useState } from 'react'
import type { ThunderAssetDetectedPayload } from '../../../preload/thunder-api'
import { useDetectedAssets } from './useDetectedAssets'
import type { BrowserNav } from './useBrowserNav'

/**
 * TD-023: right-rail listing of video assets the embedded browser has
 * detected on the current page. State, IPC subscription and clear-on-
 * navigate live in {@link useDetectedAssets}; this component is purely
 * presentational.
 *
 * TD-025: the Download button is a fire-and-forget call into the
 * shared {@link useDownloads} hook owned by `BrowserPage`. All
 * per-download state (progress, completion, retry, show-in-folder)
 * lives in the bottom drawer — the assets panel does not track it
 * locally any more.
 *
 * Drawer behaviour: the panel is collapsible to a narrow rail so the
 * embedded webview gets the full window width when the user doesn't
 * need the list. Open/closed state is local — it doesn't survive a
 * tab remount, which is fine for the v1 single-tab flow.
 */

const PANEL_WIDTH = 320
const PANEL_RAIL_WIDTH = 36

interface DetectedAssetsPanelProps {
  nav: BrowserNav
  onDownload: (assetUrl: string, suggestedFilename: string) => Promise<void>
}

export default function DetectedAssetsPanel({
  nav,
  onDownload
}: DetectedAssetsPanelProps): React.JSX.Element {
  const { assets, clear, refresh } = useDetectedAssets(nav)
  const [isOpen, setIsOpen] = useState(true)
  const hasAssets = assets.length > 0
  const canRefresh = nav.webContentsId !== null

  if (!isOpen) {
    return (
      <aside
        className="detected-assets-panel detected-assets-panel--closed"
        aria-label="Detected video assets (collapsed)"
      >
        <button
          type="button"
          className="detected-assets-rail"
          onClick={() => setIsOpen(true)}
          title="Show detected videos"
          aria-expanded={false}
        >
          <span className="detected-assets-rail-label">Videos</span>
          {hasAssets && <span className="detected-assets-count">{assets.length}</span>}
        </button>

        <style>{drawerStyles}</style>
      </aside>
    )
  }

  return (
    <aside className="detected-assets-panel" aria-label="Detected video assets">
      <header className="detected-assets-header">
        <div className="detected-assets-title">
          <h2>Detected videos</h2>
          <div className="detected-assets-title-right">
            <span className="detected-assets-count">{assets.length}</span>
            <button
              type="button"
              className="detected-assets-close"
              onClick={() => setIsOpen(false)}
              title="Hide panel"
              aria-label="Hide detected videos panel"
            >
              ×
            </button>
          </div>
        </div>
        <div className="detected-assets-actions">
          <button
            type="button"
            className="detected-assets-action"
            onClick={refresh}
            disabled={!canRefresh}
            title="Re-pull detections from the current page"
          >
            Refresh
          </button>
          <button
            type="button"
            className="detected-assets-action"
            onClick={clear}
            disabled={!hasAssets}
            title="Clear the list"
          >
            Clear
          </button>
        </div>
      </header>

      <div className="detected-assets-list">
        {!hasAssets ? (
          <p className="detected-assets-empty">No videos detected on this page yet.</p>
        ) : (
          assets.map((asset) => <AssetRow key={asset.id} asset={asset} onDownload={onDownload} />)
        )}
      </div>

      <style>{drawerStyles}</style>
    </aside>
  )
}

const drawerStyles = `
  .detected-assets-panel {
    width: ${PANEL_WIDTH}px;
    flex: 0 0 ${PANEL_WIDTH}px;
    display: flex;
    flex-direction: column;
    background: var(--color-surface);
    border-left: 1px solid var(--color-border);
    color: var(--color-text);
    min-height: 0;
  }
  .detected-assets-panel--closed {
    width: ${PANEL_RAIL_WIDTH}px;
    flex: 0 0 ${PANEL_RAIL_WIDTH}px;
  }
  .detected-assets-rail {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    gap: var(--space-sm);
    padding: var(--space-md) 0;
    background: transparent;
    color: var(--color-text-muted);
    border: none;
    cursor: pointer;
    font-size: var(--text-caption);
    font-weight: var(--weight-medium);
  }
  .detected-assets-rail:hover {
    color: var(--color-text);
    background: var(--color-bg-alt);
  }
  .detected-assets-rail-label {
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    letter-spacing: 0.05em;
  }
  .detected-assets-header {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    padding: var(--space-md);
    border-bottom: 1px solid var(--color-border);
  }
  .detected-assets-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .detected-assets-title-right {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }
  .detected-assets-header h2 {
    margin: 0;
    font-size: var(--text-h3);
    font-weight: var(--weight-semibold);
  }
  .detected-assets-count {
    font-size: var(--text-caption);
    color: var(--color-text-muted);
    background: var(--color-bg-alt);
    padding: 2px var(--space-sm);
    border-radius: var(--radius-full);
    min-width: 24px;
    text-align: center;
  }
  .detected-assets-close {
    background: transparent;
    color: var(--color-text-muted);
    border: none;
    cursor: pointer;
    font-size: 18px;
    line-height: 1;
    padding: 2px 6px;
    border-radius: var(--radius-sm);
  }
  .detected-assets-close:hover {
    background: var(--color-bg-alt);
    color: var(--color-text);
  }
  .detected-assets-actions {
    display: flex;
    gap: var(--space-sm);
  }
  .detected-assets-action {
    flex: 1;
    padding: 4px 12px;
    background: var(--color-bg-alt);
    color: var(--color-text);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    font-size: var(--text-caption);
    font-weight: var(--weight-medium);
    cursor: pointer;
  }
  .detected-assets-action:hover:not(:disabled) {
    background: var(--color-surface-hover, var(--color-bg-alt));
    border-color: var(--color-accent-light);
  }
  .detected-assets-action:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .detected-assets-list {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-sm);
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }
  .detected-assets-empty {
    margin: 0;
    padding: var(--space-md);
    color: var(--color-text-muted);
    font-size: var(--text-body-sm);
    text-align: center;
  }
  .detected-asset-row {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    padding: var(--space-sm) var(--space-md);
    background: var(--color-bg-alt);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
  }
  .detected-asset-filename {
    font-size: var(--text-body-sm);
    font-weight: var(--weight-medium);
    word-break: break-all;
    color: var(--color-text);
  }
  .detected-asset-meta {
    display: flex;
    gap: var(--space-sm);
    font-size: var(--text-caption);
    color: var(--color-text-muted);
  }
  .detected-asset-meta-kind {
    color: var(--color-accent-light);
  }
  .detected-asset-download {
    align-self: flex-start;
    margin-top: var(--space-xs);
    padding: 4px 12px;
    background: var(--color-accent);
    color: var(--color-text-on-accent);
    border: none;
    border-radius: var(--radius-sm);
    font-size: var(--text-caption);
    font-weight: var(--weight-semibold);
    cursor: pointer;
  }
  .detected-asset-download:hover {
    background: var(--color-accent-light);
  }
`

interface AssetRowProps {
  asset: ThunderAssetDetectedPayload
  onDownload: (assetUrl: string, suggestedFilename: string) => Promise<void>
}

function AssetRow({ asset, onDownload }: AssetRowProps): React.JSX.Element {
  const filename = filenameFromUrl(asset.assetUrl)
  const kind = kindLabel(asset.mimeType, asset.assetUrl)
  const size = asset.sizeBytes !== undefined ? formatBytes(asset.sizeBytes) : null

  // Local "isStarting" gate covers the brief await on the main-process
  // `start` invoke. Once the entry exists in the drawer, the user's
  // feedback channel for this download is the drawer — re-clicking
  // here just queues another download, which is the honest UX when
  // the assets list itself doesn't know about the drawer's state.
  const [isStarting, setIsStarting] = useState(false)

  const handleDownload = async (): Promise<void> => {
    if (isStarting) return
    setIsStarting(true)
    try {
      await onDownload(asset.assetUrl, filename)
    } finally {
      setIsStarting(false)
    }
  }

  return (
    <div className="detected-asset-row">
      <span className="detected-asset-filename" title={asset.assetUrl}>
        {filename}
      </span>
      <div className="detected-asset-meta">
        <span className="detected-asset-meta-kind">{kind}</span>
        {size !== null && <span>{size}</span>}
      </div>
      <button
        type="button"
        className="detected-asset-download"
        onClick={handleDownload}
        disabled={isStarting}
      >
        {isStarting ? 'Starting…' : 'Download'}
      </button>
    </div>
  )
}

/**
 * Strip query/fragment and return the last path segment. Falls back to
 * the raw URL if parsing fails (e.g. blob: URIs without a clear path).
 */
function filenameFromUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl)
    const segments = u.pathname.split('/').filter((s) => s.length > 0)
    const last = segments[segments.length - 1]
    if (last && last.length > 0) return decodeURIComponent(last)
    return u.hostname || rawUrl
  } catch {
    return rawUrl
  }
}

const KIND_BY_MIME: Record<string, string> = {
  'application/vnd.apple.mpegurl': 'HLS playlist',
  'application/x-mpegurl': 'HLS playlist',
  'audio/mpegurl': 'HLS playlist',
  'application/dash+xml': 'DASH manifest',
  'video/mp4': 'MP4',
  'video/webm': 'WebM',
  'video/quicktime': 'QuickTime',
  'video/x-matroska': 'Matroska',
  'video/mp2t': 'MPEG-TS segment',
  'video/iso.segment': 'ISO segment'
}

function kindLabel(mimeType: string, assetUrl: string): string {
  const mime = mimeType.toLowerCase().split(';')[0].trim()
  if (KIND_BY_MIME[mime]) return KIND_BY_MIME[mime]
  // Fallback: extension lookup for servers that send a generic
  // `application/octet-stream` for HLS/DASH responses.
  const ext = extFromUrl(assetUrl)
  if (ext === 'm3u8') return 'HLS playlist'
  if (ext === 'mpd') return 'DASH manifest'
  if (ext === 'mp4') return 'MP4'
  if (ext === 'webm') return 'WebM'
  if (ext === 'ts') return 'MPEG-TS segment'
  if (ext === 'mkv') return 'Matroska'
  return mimeType || 'Unknown'
}

function extFromUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl)
    const last = u.pathname.split('/').pop() ?? ''
    const dot = last.lastIndexOf('.')
    if (dot < 0) return ''
    return last.slice(dot + 1).toLowerCase()
  } catch {
    return ''
  }
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB']

function formatBytes(bytes: number): string {
  if (bytes < 0 || !Number.isFinite(bytes)) return ''
  if (bytes < 1024) return `${bytes} B`
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(1)} ${BYTE_UNITS[unit]}`
}
