import type { ThunderAssetDetectedPayload } from '../../../preload/thunder-api'
import { useDetectedAssets } from './useDetectedAssets'
import type { BrowserNav } from './useBrowserNav'

/**
 * TD-023: right-rail listing of video assets the embedded browser has
 * detected on the current page. State, IPC subscription and clear-on-
 * navigate live in {@link useDetectedAssets}; this component is purely
 * presentational. The Download button is a stub — TD-024 wires the
 * download manager and replaces the `console.log`.
 */

const PANEL_WIDTH = 320

interface DetectedAssetsPanelProps {
  nav: BrowserNav
}

export default function DetectedAssetsPanel({
  nav
}: DetectedAssetsPanelProps): React.JSX.Element {
  const assets = useDetectedAssets(nav)

  return (
    <aside className="detected-assets-panel" aria-label="Detected video assets">
      <header className="detected-assets-header">
        <h2>Detected videos</h2>
        <span className="detected-assets-count">{assets.length}</span>
      </header>

      <div className="detected-assets-list">
        {assets.length === 0 ? (
          <p className="detected-assets-empty">No videos detected on this page yet.</p>
        ) : (
          assets.map((asset) => <AssetRow key={asset.id} asset={asset} />)
        )}
      </div>

      <style>{`
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
        .detected-assets-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-md);
          border-bottom: 1px solid var(--color-border);
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
      `}</style>
    </aside>
  )
}

function AssetRow({ asset }: { asset: ThunderAssetDetectedPayload }): React.JSX.Element {
  const filename = filenameFromUrl(asset.assetUrl)
  const kind = kindLabel(asset.mimeType, asset.assetUrl)
  const size = asset.sizeBytes !== undefined ? formatBytes(asset.sizeBytes) : null

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
        onClick={() => {
          // TD-024 replaces this with a real download IPC.
          console.log('would download', asset)
        }}
      >
        Download
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
