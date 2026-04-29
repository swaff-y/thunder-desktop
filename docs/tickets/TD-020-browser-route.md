# TD-020 — Browser tab — sidebar entry and route

## Description

Add the Browser tab as a new sidebar nav item and route. This ticket only wires the navigation skeleton: sidebar entry, route, placeholder page. The embedded webview lands in [TD-021](TD-021-embedded-webview.md).

## Requirements

- Edit `src/renderer/src/components/desktop/Sidebar.tsx`:
  - Add to `NAV_ITEMS`:
    ```ts
    { path: "/browser", label: "Browser", icon: IoGlobeOutline }
    ```
  - Position: between "Tags" and "Stats" (sensible group: catalog → tools).
- Add `src/renderer/src/pages/Browser.tsx` rendering a placeholder ("Browser tab — coming soon" + `var(--color-text-muted)`).
- Wire `/browser` route in `App.tsx`:
  ```tsx
  <Route path="/browser" element={<ProtectedRoute><DesktopLayout><Browser /></DesktopLayout></ProtectedRoute>} />
  ```
- Active state highlighting works for `/browser` like the other sidebar items.

## ACs

- Sidebar shows a new "Browser" item with a globe icon between Tags and Stats.
- Clicking "Browser" navigates to `/browser` and the active state highlights correctly.
- `/browser` renders the placeholder content inside `DesktopLayout`.
- Logging out from `/browser` redirects to `/login`.

## Test plan

1. Log in, confirm "Browser" appears in sidebar.
2. Click it, confirm route changes and active state is correct.
3. Click other nav items, confirm Browser highlight goes away when leaving.
4. Reload while on `/browser`, confirm route persists (auth-guarded).
5. Logout from `/browser`, confirm redirect to `/login`.
