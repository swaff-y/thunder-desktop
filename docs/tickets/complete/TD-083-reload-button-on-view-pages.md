# TD-083 — A reload button on the view pages

## Description

The view pages read from the React Query cache and have no way to ask for
the record again. `queryClient` in
[cache.ts](../../src/renderer/src/api/cache.ts) sets `staleTime: 5 min` and
persists to IDB for ten, so a record you opened five minutes ago — or one
the persister hydrated at launch — renders from cache and stays that way.
Nothing in the UI refetches it.

That is fine until the record changes somewhere else, which it now
routinely does:

- the TD-075 upload card replaces a record's image, and TD-079 leaves the
  record `processing` for a while after — the picture the page shows is
  the old one until the cache rolls over;
- someone edits the record in Halo, or on another device, or through the
  chat;
- the ContentTable edit in [Watch.tsx](../../src/renderer/src/pages/Watch.tsx)
  invalidates `["record", id]` on save, but only for the fields *this*
  window changed.

The user's answer today is to navigate away and back, which does nothing
(same cache), or quit and relaunch. Give them a button.

`refetch()` is already destructured on both pages and already wired to
`ErrorState`'s retry — this ticket surfaces it on the success path too.

## Requirements

- [Watch.tsx](../../src/renderer/src/pages/Watch.tsx):
  - Add a reload button to `.watch-title-row`, beside the existing like
    button, styled with the same `discrete-btn`. Icon `IoRefreshOutline`
    from `react-icons/io5`, `title`/`aria-label` "Reload record".
  - Calls `refetch()` from `useRecord(id)`. Spin or otherwise mark the
    icon while `isFetching` is true, and disable the button so a
    double-click can't queue a second fetch.
  - The button must not remount the player: `buildAuthProxyUrl(id)` does
    not depend on the query, so `VideoPlayer`'s `src` is unchanged by a
    refetch. Confirm the `title` prop changing (the record's name) does
    not restart playback either.
- [ContentTable.tsx](../../src/renderer/src/components/shared/ContentTable.tsx):
  - Add an optional `onEditingChange?: (editing: boolean) => void` prop,
    fired from `startEditing` / `cancelEditing` / the save path.
  - `Watch` disables the reload button while the table is editing. The
    drafts are seeded once in `startEditing`, so a mid-edit refetch would
    not visibly clobber them — it would silently change the `record` the
    save diffs against, and send a patch built from two different
    versions of the row.
- [CategoryDetail.tsx](../../src/renderer/src/pages/CategoryDetail.tsx):
  - Same button in `.detail-title-row`, beside the TD-041 info button.
  - Calls `refetch()` from `useCategoryRecords`. Note this is an
    infinite query: `refetch` re-runs every page already loaded, in
    order, and keeps the user's scroll depth. That is the wanted
    behaviour — do not reset to page one.
  - Disable while `isFetching` (which is true during
    `isFetchingNextPage` too, so the reload can't race the infinite
    scroll's own fetch).
- Both pages: a failed reload leaves the currently-rendered data on
  screen. `refetch()` on an errored refetch keeps `data`; do not fall
  into the `isError` branch and blank a page the user was reading.
- Unit tests:
  - Clicking the button calls `refetch` once.
  - The button is disabled while `isFetching`.
  - `Watch` disables the button once `ContentTable` reports editing, and
    re-enables it on cancel/save.
  - A rejected refetch still renders the previous record.

## ACs

- On a record view, clicking **Reload** re-requests the record and the
  page redraws with the server's current name, series, movie, actors and
  tags — without a relaunch and without navigating away.
- Replacing a record's image through the TD-075 upload card and then
  hitting Reload shows the new image, rather than the pre-upload one the
  cache is holding.
- Reloading a record that is mid-playback does not restart or reposition
  the video.
- The button is visibly busy and unclickable while the request is in
  flight.
- The button is unavailable while the ContentTable is in edit mode, so a
  reload can't land under a half-finished edit.
- On an entity detail page (actor / series / studio / tag), Reload
  re-requests every page of records already loaded and the list stays
  where the user scrolled to.
- A reload that fails leaves the page showing what it was showing, not an
  error screen.

## Test plan

1. Open a record on Watch. In Halo (or via the chat), change its name.
   Back in the app, hit Reload — the title updates.
2. Same record: add a series in Halo, Reload, confirm the Series row
   appears and links.
3. Start playback, hit Reload mid-video, confirm the player does not
   restart.
4. Click **Edit** in the ContentTable — confirm Reload is disabled.
   Cancel — confirm it is enabled again.
5. Upload a new image through the chat's upload card, wait for it to
   settle, open the record, Reload, confirm the new picture.
6. On a series detail page, scroll to load three pages, hit Reload,
   confirm all three pages come back and the scroll position holds.
7. Pull the network (or point `apiUrl` at a dead host), hit Reload,
   confirm the page still shows the cached record and does not blank.
8. Run the new unit tests and `npm run lint`.

## Out of scope

- A reload on Home / the category lists / Stats. The lists already
  refetch on window focus and nobody has complained; if wanted, a
  separate ticket.
- Changing `staleTime` / `gcTime` in [cache.ts](../../src/renderer/src/api/cache.ts).
  Those numbers are pinned to the 15-minute Halo presigned-URL TTL
  (TD-034) and a manual reload is the cheaper fix than shortening them.
- Auto-refresh on an interval, or invalidating from a server push.
- The same button on thunder (mobile) and web-thunder — companions
  TH-044 and THW-35.
