# TD-022 — Browser tab — video asset detection (main)

## Description

Detect video assets loaded by the embedded webview by hooking `webRequest.onResponseStarted` on the webview's session. Detection runs in the main process (not via DOM scraping) so it catches HLS / DASH segments, lazy-loaded sources, and dynamic injection.

## Requirements

- Add `src/main/ipc/browser-detect.ts`.
- On `app.whenReady`, register a handler for the `webview` `did-attach-webview` event on `BrowserWindow.webContents` (or use `app.on('web-contents-created', ...)` filtered by `getType() === 'webview'`).
- For each attached webview, register a `session.webRequest.onResponseStarted` listener (sessions are partitioned, so the listener is attached to `session.fromPartition('persist:thunder-browser')`; do this once at app startup).
- Detection rules — flag a response as a video asset if any are true:
  - `Content-Type` matches `/^(video\/|application\/(x-mpegURL|vnd\.apple\.mpegurl|dash\+xml))/i`.
  - URL pathname ends in one of: `.mp4`, `.webm`, `.mkv`, `.mov`, `.m3u8`, `.mpd`. (HLS `.ts` segments deliberately excluded — they are noise; we want the manifest URL only.)
- On detection, send to the renderer via `webContents.send('thunder:browser:asset-detected', payload)` where `payload` is:
  ```ts
  { id: string; pageUrl: string; assetUrl: string; mimeType: string; sizeBytes?: number; detectedAt: number }
  ```
- De-duplicate per `(pageUrl, assetUrl)` pair within a 30-second sliding window.
- On `did-navigate` of the webview to a *new top-level URL*, clear the dedup set for that webview.
- Asset list is owned by the main process (single source of truth); renderer subscribes via `window.thunder.browser.onAssetDetected(callback)`.
- Add `thunder:browser:assets:get-current` IPC for the renderer to fetch the current page's detected list on mount (covers reloads and tab re-entry).

## ACs

- Visiting a page with a `<video src="…/intro.mp4">` triggers an `asset-detected` event with the mp4 URL.
- Visiting a page with HLS playback triggers detection of the `.m3u8` master playlist (not the individual `.ts` segments).
- Visiting a page with no video produces no events.
- Reloading a page produces detection events again (dedup state cleared on navigate).
- Navigating to a new page clears stale assets from the previous page.
- The `Content-Length` of detected assets, when present, is forwarded as `sizeBytes`.

## Test plan

1. Visit a public page with an HTML5 `<video src="*.mp4">` (e.g. a sample-videos site), confirm event fires.
2. Visit a public HLS demo (e.g. `https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8` embedded in a tiny HTML page), confirm `.m3u8` URL detected and `.ts` URLs not.
3. Visit a non-video page (`https://example.com`), confirm no events.
4. Reload, confirm events re-fire.
5. Navigate to a new page, confirm fresh dedup window.
6. Inspect the event payload's `sizeBytes` for a known-size mp4 and confirm match.
7. Unit-test the detection predicate against a fixture set of headers and URLs.
