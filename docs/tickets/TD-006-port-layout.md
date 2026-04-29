# TD-006 — Port DesktopLayout, Sidebar, TopBar (drop mobile)

## Description

Port web-thunder's desktop layout chrome into the renderer. Mobile layout and `useMediaQuery`-based gating are dropped — Electron is always desktop-class.

## Requirements

- Copy `web-thunder/src/layouts/DesktopLayout.tsx` → `src/renderer/src/layouts/DesktopLayout.tsx`. No edits in this ticket.
- Copy `web-thunder/src/components/desktop/Sidebar.tsx` → `src/renderer/src/components/desktop/Sidebar.tsx`. No edits — the Browser nav item is added in [TD-020](TD-020-browser-route.md).
- Copy `web-thunder/src/components/desktop/TopBar.tsx` → `src/renderer/src/components/desktop/TopBar.tsx`.
- Do **not** copy `web-thunder/src/layouts/MobileLayout.tsx` or `web-thunder/src/components/mobile/`.
- Do **not** copy `web-thunder/src/hooks/useMediaQuery.ts`.
- Render a thin `App.tsx` that wraps a placeholder `<div>Hello Thunder</div>` in `<DesktopLayout>` so layout chrome is visible standalone (full router lands in [TD-017](TD-017-wire-router.md)).

## ACs

- App launches showing the Thunder sidebar (240px wide, dark surface) with brand "Thunder" and nav items: Home, Actors, Series, Movies, Tags, Stats.
- TopBar renders at the top of the main pane.
- Sidebar nav items navigate to placeholder routes without errors (routes will 404 to a fallback for now — that's fine).
- Active nav item gets the accent border and background highlight.
- No mobile layout files exist in the renderer source tree.

## Test plan

1. `npm run dev`, confirm sidebar + topbar visible and matches web-thunder's desktop view side-by-side.
2. Click each nav item — the active state moves correctly even though pages don't exist yet.
3. Hover a nav item — confirm hover style.
4. `grep -r "MobileLayout\|useMediaQuery\|useIsDesktop" src/renderer` returns zero results.
5. Resize the window — confirm sidebar stays at 240px and main pane reflows.
