# TD-011 — Port Home page

## Description

Port web-thunder's Home page so the `/` route renders the landing experience inside `DesktopLayout`.

## Requirements

- Copy `web-thunder/src/pages/Home.tsx` → `src/renderer/src/pages/Home.tsx`. No edits.
- Wire it into the temporary route table from [TD-009](TD-009-port-auth.md):
  ```tsx
  <Route path="/" element={<ProtectedRoute><DesktopLayout><Home /></DesktopLayout></ProtectedRoute>} />
  ```
- Confirm any data dependencies (categories, hero content) come from the already-ported hooks (TD-010).

## ACs

- `/` route renders the same content web-thunder shows after login.
- Hero carousel auto-rotates and matches web-thunder's behavior.
- All Home-page sections render without error against the dev Halo backend.

## Test plan

1. Log in, land on `/`, confirm the page matches web-thunder visually.
2. Side-by-side comparison with `web-thunder` running locally — no diff in layout, copy, or rotation behavior.
3. Throw the dev URL into airplane mode after first load — confirm cached data still renders (per TD-008 persistence).
4. Inspect DevTools network tab — same set of requests as web-thunder issues for the same page.
