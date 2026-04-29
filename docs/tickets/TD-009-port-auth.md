# TD-009 — Port auth flow (Login + useAuth)

## Description

Port the Login page and `useAuth` hook from web-thunder verbatim so users can authenticate against the Halo backend. v1 keeps tokens in `localStorage` to match web-thunder. (Keychain migration is a separate optional ticket per the plan.)

## Requirements

- Copy `web-thunder/src/hooks/useAuth.ts` → `src/renderer/src/hooks/useAuth.ts`.
- Copy `web-thunder/src/pages/Login.tsx` → `src/renderer/src/pages/Login.tsx`.
- Copy `web-thunder/src/hooks/useCart.ts` → `src/renderer/src/hooks/useCart.ts` (referenced by App.tsx tree; keep parity).
- Wrap the app in `<AuthProvider><CartProvider>...` exactly as web-thunder does.
- Add a temporary minimal `App.tsx` route table containing only `/login` and a placeholder `/` that says "logged in" — full router lands in [TD-017](TD-017-wire-router.md).
- Login form posts to `v1/login` via the ported API client.
- On success, JWT and API key are stored in `localStorage` keys `userToken` and `apiKey` (matching web-thunder).
- `useAuth().logout()` clears both keys and returns to `/login`.

## ACs

- Visiting the app shows the Login page when not authenticated.
- Submitting valid credentials against the dev Halo backend transitions to the placeholder `/` route.
- `localStorage.userToken` is set after successful login.
- A subsequent reload skips the login page (auto-login from token).
- Calling `logout()` clears `localStorage` and redirects back to login.
- `useAuth` exposes `isAuthenticated`, `login`, `logout` — same surface as web-thunder.

## Test plan

1. `npm run dev`, hit `/`, confirm redirect to `/login`.
2. Submit known-good credentials, confirm transition to `/` and `localStorage` token set.
3. Reload, confirm no redirect to login.
4. Submit bad credentials, confirm error UI matches web-thunder.
5. Call `logout()` from DevTools console, confirm redirect and `localStorage` cleared.
6. `diff` `useAuth.ts` and `Login.tsx` against web-thunder originals — only path differences.
