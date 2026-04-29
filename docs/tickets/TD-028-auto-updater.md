# TD-028 — Auto-updater wiring

## Description

Wire `electron-updater` to a GitHub Releases feed so the app silently checks for updates on launch (production only) and installs them on the next quit. Lifts halo-desktop's `src/main/updater.ts` pattern.

## Requirements

- Add `electron-updater ^6.8.3` to `dependencies`.
- Add `src/main/updater.ts` with `initAutoUpdater(getWindow: () => BrowserWindow | null)`:
  - No-op in development (`is.dev`).
  - On `app.whenReady`, `autoUpdater.checkForUpdatesAndNotify()`.
  - Forward `update-available`, `update-downloaded`, `error` events to the renderer via `webContents.send('thunder:updater:event', payload)`.
- `electron-builder.yml` `publish` block:
  ```yaml
  publish:
    provider: github
    owner: swaff-y
    repo: thunder-desktop
  ```
- GitHub Actions workflow `.github/workflows/release.yml` that runs `npm run dist:mac`, signs, notarizes, and attaches the DMG + `latest-mac.yml` to a GitHub Release on a tag push.
- Renderer toast component subscribing to `thunder:updater:event` to show:
  - "Checking for updates…" (silent unless DevTools open).
  - "Update available — downloading."
  - "Update ready — restart to install." with a "Restart now" button calling `window.thunder.updater.quitAndInstall()`.
- IPC channel `thunder:updater:quit-and-install` triggers `autoUpdater.quitAndInstall()`.

## ACs

- Production build on launch hits `https://github.com/swaff-y/thunder-desktop/releases.atom` (or `latest-mac.yml`).
- When a newer release exists, `update-available` event fires, download begins, `update-downloaded` fires when done.
- "Restart now" toast button quits and re-launches into the new version.
- Dev build does not trigger any updater traffic (verified via Wireshark or DevTools).
- A failed update (network drop, bad signature) shows a non-fatal toast and does not crash the app.

## Test plan

1. Cut release `v0.1.0`, install. Cut release `v0.1.1` with a visible diff (e.g. window title change). Launch the v0.1.0 build.
2. Confirm "Update available" toast appears.
3. Wait for "Update ready" toast.
4. Click Restart, confirm the app re-launches as v0.1.1.
5. Disable network mid-download, confirm graceful failure toast.
6. Run `npm run dev`, confirm no updater traffic.
7. Tamper with `latest-mac.yml` signature, confirm updater rejects and toasts an error.
