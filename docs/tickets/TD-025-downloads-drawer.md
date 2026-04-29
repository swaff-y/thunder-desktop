# TD-025 — Browser tab — downloads drawer (renderer)

## Description

Render in-progress and completed downloads in a collapsible bottom drawer. Wire the Download button in `DetectedAssetsPanel` to call the download manager from TD-024, surface progress, and expose cancel / show-in-folder actions.

## Requirements

- Add `src/renderer/src/browser/DownloadsDrawer.tsx`.
- Add `src/renderer/src/browser/useDownloads.ts`:
  - State: `Map<id, DownloadEntry>` with fields `{ id, assetUrl, filename, state, receivedBytes, totalBytes, savePath?, error? }`.
  - On mount, subscribe to `thunder:browser:download:progress` and `thunder:browser:download:complete` IPC events.
  - Expose `start(assetUrl, suggestedFilename)`, `cancel(id)`, `showInFolder(id)`.
- Drawer UI:
  - Collapsed: small bar at the bottom of the Browser pane with count of active downloads ("3 downloading").
  - Expanded: list of rows, each showing filename, progress bar, percentage, KB/s rate, target path, and per-row actions:
    - In-progress: "Cancel" button.
    - Completed: "Show in Finder" button.
    - Cancelled / failed: "Retry" button (re-issues `download:start`).
  - Persist drawer collapsed/expanded preference in component state (resets on page reload — no need for IPC persistence).
- Wire the stub Download button in `DetectedAssetsPanel` to call `useDownloads().start(asset.assetUrl, deriveFilename(asset.assetUrl))`.
- Style with Thunder theme tokens; progress bar uses `--color-accent`.

## ACs

- Clicking Download in the assets panel adds a row to the drawer in `started` state.
- Progress bar advances; percentage and KB/s update.
- Drawer expands/collapses correctly.
- Cancel mid-download removes the row (or marks it cancelled with a Retry button — UX choice).
- "Show in Finder" opens Finder selecting the file.
- Completed downloads remain in the drawer until the page is left or manually dismissed.

## Test plan

1. Visit a video page, click Download, confirm row appears.
2. Watch progress increment to 100%, confirm "Show in Finder" appears.
3. Click "Show in Finder", confirm Finder opens.
4. Start a large download, click Cancel, confirm row updates and main process removes the partial file.
5. Click Retry on a cancelled row, confirm a new download starts.
6. Start 3 downloads at once, confirm collapsed bar shows "3 downloading".
7. Confirm KB/s rate calculation is reasonable (compute over a sliding window, not since-start).
