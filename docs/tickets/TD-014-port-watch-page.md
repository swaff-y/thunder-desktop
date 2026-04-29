# TD-014 — Port Watch page

## Description

Port web-thunder's Watch page so `/watch/<id>` plays a single record via `VideoPlayer`.

## Requirements

- Copy `web-thunder/src/pages/Watch.tsx` → `src/renderer/src/pages/Watch.tsx`. No edits.
- Wire `/watch/:id` route into the temporary route table.
- `VideoPlayer` and `useRecord` already ported in TD-010.

## ACs

- `/watch/<known-id>` mounts the video player with the record's source URL.
- Playback controls (play/pause, seek, volume, fullscreen) work.
- Adjacent metadata (title, description, related records) renders identically to web-thunder.
- Closing or navigating away unmounts the player cleanly (no continued audio).

## Test plan

1. Hit `/watch/<id>` for a known record — confirm playback starts (or has play button).
2. Play, pause, seek, change volume — confirm controls.
3. Toggle fullscreen — confirm Electron handles fullscreen correctly.
4. Navigate away — confirm playback stops.
5. Side-by-side compare with web-thunder.
6. Confirm media-src CSP rules (set in main process) allow the video URL — no console errors blocking the source.
