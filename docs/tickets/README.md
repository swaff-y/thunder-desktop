# Thunder Desktop — Tickets

Implementation tickets for [thunder-desktop-plan.md](../thunder-desktop-plan.md). Each ticket is independently testable.

## Phase 0 — Scaffold

- [TD-001](TD-001-scaffold-electron-app.md) — Scaffold Electron app with electron-vite
- [TD-002](TD-002-native-app-menu.md) — Native application menu
- [TD-003](TD-003-window-state-persistence.md) — Persist window state across launches
- [TD-004](TD-004-electron-builder-config.md) — electron-builder configuration for macOS

## Phase 1 — Web-thunder parity

- [TD-005](TD-005-port-theme.md) — Port Thunder theme to renderer
- [TD-006](TD-006-port-layout.md) — Port DesktopLayout, Sidebar, TopBar (drop mobile)
- [TD-007](TD-007-port-api-client.md) — Port API client, halo API, types
- [TD-008](TD-008-react-query-setup.md) — React Query setup with offline persistence
- [TD-009](TD-009-port-auth.md) — Port auth flow (Login + useAuth)
- [TD-010](TD-010-port-shared-components.md) — Port shared and desktop components
- [TD-011](TD-011-port-home-page.md) — Port Home page
- [TD-012](TD-012-port-category-list.md) — Port CategoryList page
- [TD-013](TD-013-port-category-detail.md) — Port CategoryDetail page
- [TD-014](TD-014-port-watch-page.md) — Port Watch page
- [TD-015](TD-015-port-multi-watch.md) — Port MultiWatch page
- [TD-016](TD-016-port-stats.md) — Port Stats page
- [TD-017](TD-017-wire-router.md) — Wire up app router

## Phase 2 — Settings & persistence

- [TD-018](TD-018-settings-store.md) — Settings persistence (IPC + JSON store)
- [TD-019](TD-019-settings-modal.md) — Settings modal UI

## Phase 3 — Browser tab basic

- [TD-020](TD-020-browser-route.md) — Browser tab — sidebar entry and route
- [TD-021](TD-021-embedded-webview.md) — Browser tab — embedded webview with chrome

## Phase 4 — Browser tab detection

- [TD-022](TD-022-asset-detection-main.md) — Browser tab — video asset detection (main)
- [TD-023](TD-023-detected-assets-panel.md) — Browser tab — detected assets panel (renderer)

## Phase 5 — Browser tab downloads

- [TD-024](TD-024-download-manager-main.md) — Browser tab — download manager (main)
- [TD-025](TD-025-downloads-drawer.md) — Browser tab — downloads drawer (renderer)
- [TD-026](TD-026-download-folder-picker.md) — Browser tab — download folder picker
- [TD-032](TD-032-download-safety.md) — Browser tab — download safety hardening (lands with TD-024)

## Phase 6 — Polish & ship

- [TD-027](TD-027-code-signing.md) — macOS code signing and notarization
- [TD-028](TD-028-auto-updater.md) — Auto-updater wiring
- [TD-029](TD-029-prod-url-cutover.md) — Production API URL cutover

## Phase 7 — Browser hardening

- [TD-031](TD-031-safe-browsing.md) — Browser tab — Safe Browsing URL filtering

## Bugs / polish

- [TD-033](TD-033-settings-url-trim.md) — Settings: trim whitespace from API URL
- [TD-034](TD-034-actor-card-images.md) — Fix missing images on actor cards
- [TD-035](TD-035-browser-tab-persist-session.md) — Browser tab: preserve session across tab switches
- [TD-036](TD-036-category-card-navigation.md) — Fix category card clicks (freeze in prod, redirect to Home in dev)
- [TD-038](TD-038-preserve-tab-navigation-state.md) — Preserve sidebar tab navigation state and add Back navigation
- [TD-039](TD-039-suspend-hidden-webview.md) — Suspend embedded webview when Browser tab is hidden (videos hang on Watch since TD-035)
