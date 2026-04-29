# TD-007 — Port API client, halo API, types

## Description

Port web-thunder's API surface verbatim. Renderer talks to the same Halo backend with the same axios client, the same auth header injection, and the same typed function exports.

## Requirements

- Add `axios ^1.14.0` and `jwt-decode ^4.0.0` to `dependencies`.
- Copy `web-thunder/src/api/client.ts` → `src/renderer/src/api/client.ts`. No edits in this ticket — token still comes from `localStorage` to keep the diff to web-thunder zero. (Keychain migration is optional follow-up §6 in the plan.)
- Copy `web-thunder/src/api/halo.ts` → `src/renderer/src/api/halo.ts`.
- Copy `web-thunder/src/types/` → `src/renderer/src/types/`.
- Copy `web-thunder/src/utils/` → `src/renderer/src/utils/`.
- Add `src/renderer/src/config/env.ts` exporting `API_URL`. Default to web-thunder's value: `https://uqd749736g.execute-api.ap-southeast-2.amazonaws.com/dev/`. Read from `window.thunder.settings.get('apiUrl')` if available; fall back to default. (Settings IPC is implemented in [TD-018](TD-018-settings-store.md); for this ticket the fallback path is what's exercised.)

## ACs

- `npm run typecheck` passes with the new files in place.
- A scratch component that imports and calls `fetchActors({})` against the dev URL receives a JSON response (auth-failure response is acceptable — we only need the network round-trip).
- `client.interceptors.request` injects `Authorization: Bearer …` when `localStorage.userToken` is set.
- All exports in `web-thunder/src/api/halo.ts` are present in the desktop renderer with identical signatures.

## Test plan

1. `npm run typecheck` — green.
2. Open DevTools, run:
   ```js
   const { fetchActors } = await import('/src/api/halo');
   await fetchActors({}); // expect a 401 or 200 — both prove the request went out
   ```
3. Set `localStorage.userToken = 'foo'`, reload, repeat — confirm the request now carries `Authorization: Bearer foo` (verified in DevTools Network panel).
4. `diff -r web-thunder/src/api src/renderer/src/api` should show only path-level differences, no content drift.
5. `diff -r web-thunder/src/types src/renderer/src/types` — same.
