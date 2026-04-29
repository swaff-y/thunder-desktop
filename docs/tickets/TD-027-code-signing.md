# TD-027 — macOS code signing and notarization

## Description

Enable real macOS code signing and Apple notarization for distribution. TD-004 set up an unsigned `.dmg` for dev. This ticket adds Developer ID signing, notarization via `notarytool`, and stapling, so the artifact can be distributed without Gatekeeper warnings.

## Requirements

- `mac.identity` set to the Developer ID Application certificate (read from env `CSC_NAME`).
- `mac.notarize: true` in `electron-builder.yml`.
- Notarization credentials via `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` env vars.
- Add `dist:mac` script that signs and notarizes.
- Stapling step (`xcrun stapler staple`) in the build pipeline.
- `entitlements.mac.plist` validated to have only the entitlements actually needed:
  - `com.apple.security.cs.allow-jit`
  - `com.apple.security.network.client`
  - `com.apple.security.files.user-selected.read-write`
  - `com.apple.security.files.downloads.read-write`
- Store signing identity and Apple credentials in 1Password / repo secrets (document the locations in README, do not commit).
- Update `dist:mac:dev` to remain the unsigned-fallback path for local builds (`--config.mac.identity=null`).

## ACs

- A signed `.dmg` artifact passes `codesign --verify --deep --strict --verbose=2 "Thunder Desktop.app"` with no errors.
- `spctl --assess --type execute "Thunder Desktop.app"` returns `accepted` after notarization + stapling.
- Double-clicking the signed/stapled DMG and running the app shows no Gatekeeper warning on a clean Mac.
- The notarization log shows `Status: Accepted`.

## Test plan

1. With env vars set on a release machine, run `npm run dist:mac`.
2. Verify `codesign` and `spctl` checks pass on the produced `.app`.
3. Copy the DMG to a *different* Mac, mount, install, and run — confirm no Gatekeeper friction.
4. Run `xcrun stapler validate "Thunder Desktop.app"` → should report ticket present.
5. Submit a deliberately-bad build (extra entitlement) and confirm notarization rejects — proves the pipeline catches policy regressions.
