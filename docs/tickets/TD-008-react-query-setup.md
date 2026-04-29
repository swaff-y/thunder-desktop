# TD-008 — React Query setup with offline persistence

## Description

Wire `@tanstack/react-query` with the same defaults web-thunder uses, plus optional offline persistence (IDB-backed) borrowed from halo-desktop so cached lists survive across launches.

## Requirements

- Add to `dependencies`:
  - `@tanstack/react-query ^5.95.2`
  - `@tanstack/react-query-persist-client ^5.97.0` (from halo-desktop pattern)
  - `@tanstack/query-async-storage-persister ^5.97.0`
  - `@tanstack/react-virtual ^3.13.23`
  - `idb-keyval ^6.2.2`
- Configure a `QueryClient` in `App.tsx` with web-thunder's defaults:
  ```ts
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 15 * 60 * 1000,
      refetchOnWindowFocus: true,
    },
  },
  ```
- Wrap the app in `<QueryClientProvider client={queryClient}>` (already part of web-thunder's `App.tsx` — keep it).
- Add a `PersistQueryClientProvider` layer with an `idb-keyval`-backed async persister (gcTime → maxAge alignment). Bucket name: `thunder-desktop-react-query-cache`.
- Persistence buster: include the app version (`__APP_VERSION__` define from electron-vite config) in the persister `buster` field so cache invalidates on version bumps.

## ACs

- A scratch query (`useQuery({ queryKey: ['ping'], queryFn: () => Promise.resolve(Date.now()) })`) returns a value, and that value is restored on next launch from IDB.
- Reading the IDB store via DevTools shows the `thunder-desktop-react-query-cache` entry.
- Bumping the package version causes the next launch to discard old cache (verified by stale value disappearing).
- `npm run typecheck` passes.

## Test plan

1. Render a test component with `useQuery` against a known-stable endpoint; confirm data shows.
2. Quit, relaunch — confirm data is shown immediately from cache (offline) before any network call.
3. Disconnect network, relaunch — confirm cached data still renders.
4. Bump `package.json` version, relaunch — confirm cache cleared.
5. Inspect DevTools → Application → IndexedDB and verify the cache bucket exists.
6. Unit-test the persister wiring with a stub key-val store.
