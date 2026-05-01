import { useState } from 'react'
import type { DownloadEntry, UseDownloads } from './useDownloads'

/**
 * TD-025: collapsible bottom drawer that surfaces the in-flight and
 * recently-finished downloads tracked by {@link useDownloads}.
 *
 * Collapsed state is component-local — per the ticket, the preference
 * resets on page reload (no IPC persistence). The drawer auto-hides
 * when there are zero entries so the empty bar doesn't waste vertical
 * space; clicking the assets panel's Download button is what brings
 * it back.
 */

interface DownloadsDrawerProps {
  downloads: UseDownloads
}

export default function DownloadsDrawer({
  downloads
}: DownloadsDrawerProps): React.JSX.Element | null {
  const { entries, cancel, showInFolder, retry, dismiss } = downloads
  const [isExpanded, setIsExpanded] = useState(false)

  if (entries.length === 0) return null

  const activeCount = entries.filter(
    (e) => e.state === 'started' || e.state === 'progressing'
  ).length
  const completedCount = entries.filter((e) => e.state === 'completed').length

  const summary =
    activeCount > 0
      ? `${activeCount} downloading`
      : completedCount > 0
        ? `${completedCount} complete`
        : `${entries.length} download${entries.length === 1 ? '' : 's'}`

  return (
    <section
      className={`downloads-drawer${isExpanded ? ' downloads-drawer--expanded' : ''}`}
      aria-label="Downloads"
    >
      <button
        type="button"
        className="downloads-drawer-bar"
        onClick={() => setIsExpanded((v) => !v)}
        aria-expanded={isExpanded}
        title={isExpanded ? 'Collapse downloads' : 'Expand downloads'}
      >
        <span className="downloads-drawer-bar-label">Downloads</span>
        <span className="downloads-drawer-bar-summary">{summary}</span>
        <span className="downloads-drawer-bar-chevron" aria-hidden="true">
          {isExpanded ? '▾' : '▴'}
        </span>
      </button>

      {isExpanded && (
        <ul className="downloads-drawer-list">
          {entries.map((entry) => (
            <DownloadRow
              key={entry.id}
              entry={entry}
              onCancel={cancel}
              onShowInFolder={showInFolder}
              onRetry={retry}
              onDismiss={dismiss}
            />
          ))}
        </ul>
      )}

      <style>{drawerStyles}</style>
    </section>
  )
}

interface DownloadRowProps {
  entry: DownloadEntry
  onCancel: (id: string) => void
  onShowInFolder: (id: string) => void
  onRetry: (id: string) => void
  onDismiss: (id: string) => void
}

function DownloadRow({
  entry,
  onCancel,
  onShowInFolder,
  onRetry,
  onDismiss
}: DownloadRowProps): React.JSX.Element {
  const isActive = entry.state === 'started' || entry.state === 'progressing'
  const isCompleted = entry.state === 'completed'
  const isFailed = entry.state === 'cancelled' || entry.state === 'interrupted'

  const percent =
    entry.totalBytes > 0
      ? Math.min(100, Math.max(0, (entry.receivedBytes / entry.totalBytes) * 100))
      : null
  const rateLabel =
    isActive && entry.rateBytesPerSec !== undefined && entry.rateBytesPerSec > 0
      ? `${formatRate(entry.rateBytesPerSec)}`
      : null

  return (
    <li className="downloads-drawer-row">
      <div className="downloads-drawer-row-top">
        <span className="downloads-drawer-filename" title={entry.assetUrl}>
          {entry.filename}
        </span>
        <span className="downloads-drawer-percent">
          {percent !== null ? `${percent.toFixed(0)}%` : '—'}
        </span>
      </div>

      <div
        className="downloads-drawer-progress"
        role="progressbar"
        aria-valuenow={percent ?? undefined}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`downloads-drawer-progress-fill downloads-drawer-progress-fill--${entry.state}${
            percent === null && isActive ? ' downloads-drawer-progress-fill--indeterminate' : ''
          }`}
          style={percent !== null ? { width: `${percent}%` } : undefined}
        />
      </div>

      <div className="downloads-drawer-meta">
        <span className="downloads-drawer-meta-state">{stateLabel(entry)}</span>
        {rateLabel !== null && <span>{rateLabel}</span>}
        {entry.totalBytes > 0 && (
          <span>
            {formatBytes(entry.receivedBytes)} / {formatBytes(entry.totalBytes)}
          </span>
        )}
        {entry.savePath !== undefined && entry.savePath.length > 0 && (
          <span className="downloads-drawer-meta-path" title={entry.savePath}>
            {entry.savePath}
          </span>
        )}
      </div>

      <div className="downloads-drawer-actions">
        {isActive && (
          <button
            type="button"
            className="downloads-drawer-action"
            onClick={() => onCancel(entry.id)}
          >
            Cancel
          </button>
        )}
        {isCompleted && (
          <button
            type="button"
            className="downloads-drawer-action"
            onClick={() => onShowInFolder(entry.id)}
          >
            Show in Finder
          </button>
        )}
        {isFailed && (
          <button
            type="button"
            className="downloads-drawer-action"
            onClick={() => onRetry(entry.id)}
          >
            Retry
          </button>
        )}
        {!isActive && (
          <button
            type="button"
            className="downloads-drawer-action downloads-drawer-action--ghost"
            onClick={() => onDismiss(entry.id)}
            aria-label="Dismiss"
            title="Remove from list"
          >
            ×
          </button>
        )}
      </div>
    </li>
  )
}

function stateLabel(entry: DownloadEntry): string {
  switch (entry.state) {
    case 'started':
      return 'Starting…'
    case 'progressing':
      return 'Downloading'
    case 'completed':
      return 'Completed'
    case 'cancelled':
      return 'Cancelled'
    case 'interrupted':
      return entry.error !== undefined ? `Failed: ${entry.error}` : 'Interrupted'
  }
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB']

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return ''
  if (bytes < 1024) return `${bytes} B`
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(1)} ${BYTE_UNITS[unit]}`
}

function formatRate(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`
}

const drawerStyles = `
  .downloads-drawer {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    background: var(--color-surface);
    border-top: 1px solid var(--color-border);
    color: var(--color-text);
    max-height: 50%;
  }
  .downloads-drawer-bar {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    width: 100%;
    padding: var(--space-sm) var(--space-md);
    background: transparent;
    color: var(--color-text);
    border: none;
    cursor: pointer;
    font-size: var(--text-body-sm);
    text-align: left;
  }
  .downloads-drawer-bar:hover {
    background: var(--color-bg-alt);
  }
  .downloads-drawer-bar-label {
    font-weight: var(--weight-semibold);
  }
  .downloads-drawer-bar-summary {
    flex: 1;
    color: var(--color-text-muted);
    font-size: var(--text-caption);
  }
  .downloads-drawer-bar-chevron {
    color: var(--color-text-muted);
    font-size: 12px;
  }
  .downloads-drawer-list {
    list-style: none;
    margin: 0;
    padding: var(--space-sm) var(--space-md) var(--space-md);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    border-top: 1px solid var(--color-border);
  }
  .downloads-drawer-row {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    padding: var(--space-sm) var(--space-md);
    background: var(--color-bg-alt);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
  }
  .downloads-drawer-row-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
  }
  .downloads-drawer-filename {
    font-size: var(--text-body-sm);
    font-weight: var(--weight-medium);
    word-break: break-all;
    color: var(--color-text);
  }
  .downloads-drawer-percent {
    font-variant-numeric: tabular-nums;
    font-size: var(--text-caption);
    color: var(--color-text-muted);
  }
  .downloads-drawer-progress {
    height: 6px;
    background: var(--color-border);
    border-radius: var(--radius-full);
    overflow: hidden;
  }
  .downloads-drawer-progress-fill {
    height: 100%;
    background: var(--color-accent);
    transition: width 120ms linear;
  }
  .downloads-drawer-progress-fill--completed {
    background: var(--color-accent);
    width: 100%;
  }
  .downloads-drawer-progress-fill--cancelled,
  .downloads-drawer-progress-fill--interrupted {
    background: var(--color-text-muted);
  }
  .downloads-drawer-progress-fill--indeterminate {
    width: 30%;
    animation: downloads-drawer-indeterminate 1.4s ease-in-out infinite;
  }
  @keyframes downloads-drawer-indeterminate {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(400%); }
  }
  .downloads-drawer-meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
    font-size: var(--text-caption);
    color: var(--color-text-muted);
  }
  .downloads-drawer-meta-state {
    color: var(--color-text);
  }
  .downloads-drawer-meta-path {
    flex: 1 1 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-mono, monospace);
  }
  .downloads-drawer-actions {
    display: flex;
    gap: var(--space-sm);
    align-items: center;
  }
  .downloads-drawer-action {
    padding: 4px 12px;
    background: var(--color-accent);
    color: var(--color-text-on-accent);
    border: none;
    border-radius: var(--radius-sm);
    font-size: var(--text-caption);
    font-weight: var(--weight-semibold);
    cursor: pointer;
  }
  .downloads-drawer-action:hover {
    background: var(--color-accent-light);
  }
  .downloads-drawer-action--ghost {
    margin-left: auto;
    background: transparent;
    color: var(--color-text-muted);
    border: 1px solid var(--color-border);
    padding: 2px 8px;
    font-size: 14px;
    line-height: 1;
  }
  .downloads-drawer-action--ghost:hover {
    background: var(--color-bg-alt);
    color: var(--color-text);
  }
`
