# TD-004 — electron-builder configuration for macOS

## Description

Configure `electron-builder` so the app produces an unsigned `.app` and `.dmg` for macOS. Code signing and notarization are split into [TD-027](TD-027-code-signing.md). This ticket sets up the build inputs (icons, entitlements, file globs, dmg layout) so a developer can run `npm run dist:mac:dev` and get an installable (unsigned) DMG out.

## Requirements

- `electron-builder.yml` in repo root with `appId: com.ruby-sei.thunder-desktop`, `productName: Thunder Desktop`, `executableName: thunder-desktop`, and the same file globs / asarUnpack / npmRebuild settings halo-desktop uses.
- Add `resources/icon.icns` and `resources/icon.png` (placeholder OK in this ticket — real branding can land later).
- `build/entitlements.mac.plist` granting:
  - `com.apple.security.cs.allow-jit` (Electron requires this).
  - `com.apple.security.network.client` (renderer + webview HTTP).
  - `com.apple.security.files.user-selected.read-write` (download folder picker).
  - `com.apple.security.files.downloads.read-write` (default Downloads).
- `package.json` scripts:
  - `build:mac` — `electron-vite build && electron-builder --mac`
  - `dist:mac` — `npm run build && electron-builder --mac dmg`
  - `dist:mac:dev` — same as `dist:mac` but `--config.mac.identity=null` so it works on a dev machine with no Developer ID.
- `mac.hardenedRuntime: true`, `mac.gatekeeperAssess: false`, `mac.notarize: false` (notarization is enabled in TD-027).
- DMG artifact name: `${name}-${version}.${ext}` matching halo-desktop.

## ACs

- `npm run build` produces `out/{main,preload,renderer}` artifacts.
- `npm run dist:mac:dev` produces a `.dmg` in `dist/` containing `Thunder Desktop.app`.
- The `.app` launches when double-clicked (after right-click → Open to bypass Gatekeeper for unsigned builds), shows the main window, and works as in `npm run dev`.
- The packaged binary's `Info.plist` carries the entitlements above (`codesign -d --entitlements - /path/to/Thunder\ Desktop.app`).

## Test plan

1. Run `npm run dist:mac:dev` on a clean clone.
2. Confirm `dist/thunder-desktop-<version>.dmg` exists and is < 250MB.
3. Mount the DMG, drag `Thunder Desktop.app` to `/Applications`.
4. Right-click → Open to bypass Gatekeeper, confirm app launches.
5. Run `codesign -d --entitlements - "/Applications/Thunder Desktop.app"` and verify the entitlements list matches.
6. Run `mdls "/Applications/Thunder Desktop.app"` and verify `kMDItemCFBundleIdentifier == com.ruby-sei.thunder-desktop`.
