# TD-017 — Wire up app router (no mobile gating)

## Description

Replace the temporary route tables used in TD-009 through TD-016 with the final `App.tsx` router. Drop all mobile-only logic. Use `DesktopLayout` for every authenticated route. Browser route is added in [TD-020](TD-020-browser-route.md).

## Requirements

- Final `src/renderer/src/App.tsx` modeled on `web-thunder/src/App.tsx` but:
  - No `useIsDesktop`, `MobileLayout`, `DesktopOnlyRoute`, or `AppLayout` switch.
  - `DesktopLayout` always wraps protected routes.
  - Routes wired:
    - `/login`
    - `/` → Home
    - `/stats` → Stats (no `DesktopOnlyRoute`)
    - `/:category` → CategoryList
    - `/:category/:id` → CategoryDetail
    - `/watch/:id` → Watch
    - `/multi-watch` → MultiWatch (no `DesktopLayout` wrap, matching web-thunder)
    - `*` → `<Navigate to="/" replace />`
- Provider stack: `QueryClientProvider` → `BrowserRouter` → `AuthProvider` → `CartProvider` → `<AppRoutes />`.
- Use `HashRouter` (not `BrowserRouter`) if loading from `file://` in production causes routing issues; document the choice.

## ACs

- All routes that worked in their individual tickets continue to work after the router consolidation.
- Unknown routes redirect to `/`.
- Mobile-related imports do not exist anywhere in `src/renderer/src/`.
- `npm run typecheck && npm run lint && npm run test` all pass.

## Test plan

1. Visit each route in turn: `/login`, `/`, `/stats`, `/actors`, `/series`, `/movies`, `/tags`, `/actors/<id>`, `/watch/<id>`, `/multi-watch`. Confirm each renders.
2. Visit `/garbage-route` — confirm redirect to `/`.
3. Logout, confirm redirect to `/login` from any protected route.
4. `grep -r "MobileLayout\|useMediaQuery\|useIsDesktop\|DesktopOnlyRoute" src/renderer` — zero hits.
5. Run packaged build (`npm run build`) and confirm route navigation works in the bundled `file://` context.
