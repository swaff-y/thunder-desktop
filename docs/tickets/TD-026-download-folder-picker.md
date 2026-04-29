# TD-026 — Browser tab — download folder picker

## Description

Expose a directory picker through the dialog IPC bridge so the user can change the download folder from the Settings modal. Hooks into the settings store from TD-018 and the modal from TD-019.

## Requirements

- Add `src/main/ipc/dialog.ts` registering:
  - `thunder:dialog:open-directory` — calls `dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })`. Returns `{ canceled, path? }`.
  - `thunder:dialog:show-item-in-folder` — args `{ path }` → `shell.showItemInFolder(path)`.
- Preload exposes `window.thunder.dialog.openDirectory()` and `showItemInFolder(path)`.
- Add channels to `THUNDER_ALLOWLIST`.
- Update `SettingsModal.tsx` (TD-019) "Choose…" button to call `window.thunder.dialog.openDirectory()` and store the result via `window.thunder.settings.set('downloadFolder', path)`.
- Default folder behavior: if the configured `downloadFolder` does not exist when a download is requested, create it (`fs.mkdir({ recursive: true })`).
- Validate that the chosen folder is writable (probe with a temp file); if not, surface an error in the modal.

## ACs

- Clicking "Choose…" in Settings opens the macOS folder picker.
- Selecting a folder updates the setting and the modal field.
- Cancelling the picker leaves the setting unchanged.
- Selecting a non-writable folder shows an error and does not persist.
- Default folder is created on first download if missing.
- "Show in Finder" on a completed download (TD-025) uses the same dialog IPC.

## Test plan

1. Open Settings, click Choose…, pick `~/Movies/Thunder`, confirm value updates.
2. Quit + relaunch, confirm setting persists.
3. Start a download, confirm file lands in chosen folder.
4. Pick a folder you don't have write access to (e.g. `/System`), confirm error.
5. Set folder to a path that doesn't exist, start a download, confirm folder created.
6. Cancel the picker, confirm no change.
