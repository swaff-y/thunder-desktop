# TD-019 — Settings modal UI

## Description

Add a Settings modal accessible from the TopBar (gear icon) for editing `apiUrl`, `downloadFolder`, and optional `userAgent`. Users can change the API base URL at runtime without rebuilding.

## Requirements

- Add a gear icon button to TopBar (right side, before the existing logout/cart UI).
- Add `src/renderer/src/components/desktop/SettingsModal.tsx` using `react-bootstrap` `<Modal>`.
- Form fields:
  - **API URL** — text input. Validate `URL` shape on save.
  - **Download Folder** — read-only text input + "Choose…" button that calls `window.thunder.dialog.openDirectory()` (existing handler from TD-026, but stub-tolerant — for this ticket the picker can be minimal text input if dialog IPC isn't ready yet).
  - **User-Agent override** — text input, optional, blank means "use webview default".
- Save button calls `window.thunder.settings.set(...)` for each changed value.
- Cancel discards.
- Modal styled with Thunder theme tokens.
- Show a toast / alert when API URL changes ("API base URL updated. Reload to take effect.") — React Query reads from settings on bootstrap, so a reload is the simplest path.

## ACs

- Clicking the gear opens the Settings modal.
- API URL field shows the current value on open.
- Saving updates the settings file (verified in `~/Library/Application Support/Thunder Desktop/thunder-desktop-settings.json`).
- Saving invalid URL shows inline validation error and does not persist.
- Cancel does not write to disk.
- After API URL change + reload, requests go to the new URL.

## Test plan

1. Open Settings, confirm current values pre-filled.
2. Change API URL to a known-good alternative, save, reload, confirm requests target the new URL.
3. Change API URL to "not-a-url", confirm error and no write.
4. Change download folder via picker, confirm value updated and persisted.
5. Cancel after changing values, confirm settings unchanged.
6. Close modal via Esc, confirm dismissal works.
