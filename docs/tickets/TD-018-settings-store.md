# TD-018 — Settings persistence (IPC + JSON store)

## Description

Add a settings store in the main process (JSON file in `app.getPath('userData')`) and an IPC bridge so the renderer can read and write settings. v1 settings: `apiUrl`, `downloadFolder`, `userAgent`.

## Requirements

- Add `src/main/ipc/settings-io.ts` with `readSettings()`, `writeSettings(partial)`, `getSetting(key)`, `setSetting(key, value)` against `path.join(app.getPath('userData'), 'thunder-desktop-settings.json')`.
- Schema:
  ```ts
  interface ThunderSettings {
    apiUrl: string;            // default: web-thunder dev URL
    downloadFolder: string;    // default: path.join(app.getPath('downloads'), 'Thunder')
    userAgent?: string;        // optional override for embedded webview
  }
  ```
- Add `src/main/ipc/settings.ts` registering `thunder:settings:get`, `thunder:settings:set`, `thunder:settings:get-all` IPC handlers.
- Preload exposes `window.thunder.settings.{get,set,getAll}` via `thunder-api.ts`.
- Add channel names to the preload allowlist (`THUNDER_ALLOWLIST`).
- On first launch, defaults are written to disk.
- Atomic writes: write-temp + rename, so a crash mid-write cannot corrupt the file.
- Wire `src/renderer/src/config/env.ts` `API_URL` to `await window.thunder.settings.get('apiUrl')` (falling back to default if IPC unavailable, e.g. during tests).

## ACs

- `window.thunder.settings.get('apiUrl')` returns the stored URL.
- Calling `set('apiUrl', 'https://example.com/')` writes the value and the next `get` returns it.
- File at `~/Library/Application Support/Thunder Desktop/thunder-desktop-settings.json` updates on `set`.
- File contents are valid JSON after a kill -9 mid-write (atomic rename).
- Renderer cannot send arbitrary IPC channels — only the allowlisted ones.

## Test plan

1. Launch app, confirm settings file created with defaults.
2. From DevTools, `await window.thunder.settings.get('apiUrl')` → returns default.
3. `await window.thunder.settings.set('apiUrl', 'https://test/')` — confirm file updated.
4. Quit, relaunch — confirm value persisted.
5. Manually corrupt the JSON file — confirm app falls back to defaults rather than crashing.
6. Try `await window.thunder.invoke('not-allowed-channel')` — confirm rejection.
7. Unit-test atomic write logic (write-temp + rename).
