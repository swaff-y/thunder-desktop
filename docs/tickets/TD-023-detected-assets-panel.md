# TD-023 — Browser tab — detected assets panel (renderer)

## Description

Render the detected video assets in a right rail next to the embedded webview. Each row shows filename, MIME type, size if known, and a Download button. Download wiring lands in [TD-024](TD-024-download-manager-main.md) — for this ticket the button can be a stub that logs to console.

## Requirements

- Add `src/renderer/src/browser/DetectedAssetsPanel.tsx`.
- Add `src/renderer/src/browser/useDetectedAssets.ts`:
  - On mount, call `window.thunder.browser.assets.getCurrent()` to seed initial state.
  - Subscribe to `window.thunder.browser.onAssetDetected(asset => ...)`; append unique assets.
  - Clear local list on webview `did-navigate` (signaled by `useBrowserNav`).
- Layout: right-side panel inside `BrowserPage`, fixed 320px width, scrollable.
- Each row:
  - Filename derived from `assetUrl` (last path segment).
  - MIME type / kind label ("HLS playlist", "MP4", etc.).
  - Size formatted with KB/MB/GB.
  - Download button (stub: `console.log('would download', asset)` or call a temporary IPC that just logs).
- Empty state: "No videos detected on this page yet."
- Active page indicator: panel updates as assets stream in (newest at top).
- Style with Thunder theme tokens.

## ACs

- Visiting a video page populates the panel within ~1 second of the response landing.
- Filename, MIME type, size render correctly.
- Empty state shows for non-video pages.
- Navigating to a new page clears the panel before new assets arrive.
- Reloading a page re-populates from `getCurrent()` (no flicker / lost state).

## Test plan

1. Side-by-side Browser tab + DevTools network inspector. Visit a video page; confirm panel updates match network activity.
2. Confirm filename parsing handles query strings (`/foo.mp4?token=abc` → `foo.mp4`).
3. Confirm size formatter: 12345678 bytes → "11.8 MB".
4. Visit non-video page, confirm empty state.
5. Reload, confirm panel re-populates.
6. Navigate elsewhere, confirm panel clears.
7. Click Download stub, confirm console log shows the asset payload.
