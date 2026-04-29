# TD-024 — Browser tab — download manager (main)

## Description

Implement the main-process download manager. Renderer requests a download by URL and target filename; main calls `session.downloadURL` on the same partition the embedded webview uses (so cookies/auth ride along), forwards progress events to the renderer, and supports cancel.

## Requirements

- Add `src/main/ipc/browser-download.ts`.
- Maintain `Map<id, DownloadItem>` keyed by UUID issued at request time.
- IPC handlers (added to `THUNDER_ALLOWLIST`):
  - `thunder:browser:download:start` — args `{ assetUrl, suggestedFilename }` → returns `{ id }`.
  - `thunder:browser:download:cancel` — args `{ id }` → cancels via `item.cancel()`.
  - `thunder:browser:download:show-in-folder` — args `{ id }` → `shell.showItemInFolder(savePath)`.
- On start:
  1. Resolve `downloadFolder` from settings; create the directory if missing.
  2. Resolve a collision-safe path: `intro.mp4` → `intro (2).mp4` if name already exists.
  3. Call `session.fromPartition('persist:thunder-browser').downloadURL(assetUrl)`.
  4. In `session.on('will-download', (event, item) => ...)`:
     - `item.setSavePath(targetPath)`.
     - `item.on('updated', state => ...)` — forward `{ id, receivedBytes, totalBytes, state }` as `thunder:browser:download:progress` events at most every 250ms.
     - `item.on('done', state => ...)` — forward `{ id, state, savePath }` as `thunder:browser:download:complete`.
- Cancel: lookup by id, `item.cancel()`, remove from map.
- Cleanup: completed/cancelled items pruned from the map after their final event is sent.
- Events use `webContents.send` to the *focused* main window, mirroring halo-desktop's updater pattern.

## ACs

- Calling `download:start` with a known mp4 URL begins downloading to the configured folder.
- Progress events fire with monotonically increasing `receivedBytes`, throttled to ≤4/sec.
- `done` event fires with `state: 'completed'` and a valid `savePath`.
- Cancel mid-download produces `state: 'cancelled'` and the partial file is removed.
- Filename collision avoidance: requesting the same filename twice produces `intro.mp4` and `intro (2).mp4`.
- Cookies set in the embedded webview's session are sent on the download request (verified for a video URL gated by a session cookie).
- `show-in-folder` opens Finder and selects the file.

## Test plan

1. Trigger a download for `https://download.samplelib.com/mp4/sample-5s.mp4`, confirm file lands in download folder.
2. Verify progress events stream and `receivedBytes` ends equal to `totalBytes`.
3. Cancel mid-download (small file: use a larger sample), confirm partial file removed and `cancelled` event.
4. Trigger two downloads of the same filename back-to-back, confirm `(2)` suffix.
5. On a site that requires a session cookie (set via embedded webview navigation), confirm download succeeds.
6. Call `show-in-folder` for a completed item, confirm Finder opens.
7. Unit-test collision-safe path resolver.
