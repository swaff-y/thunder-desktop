# TD-012 — Port CategoryList page

## Description

Port web-thunder's CategoryList page so `/actors`, `/series`, `/movies`, `/tags` all render their respective lists with filter, sort, virtualized scroll, and pagination.

## Requirements

- Copy `web-thunder/src/pages/CategoryList.tsx` → `src/renderer/src/pages/CategoryList.tsx`. No edits.
- Wire `/:category` route into the temporary route table.
- Confirm `useCategories`, `useListFilter`, `VirtualRecordList`, `FilterBar` hooks/components are already ported.

## ACs

- `/actors` renders the actors list paginated from the dev Halo backend.
- `/series`, `/movies`, `/tags` work identically.
- FilterBar typeahead narrows the list as the user types.
- Sort controls reorder the list.
- LoadMore button fetches the next page (or virtualized infinite scroll, whichever web-thunder uses).
- Clicking a row navigates to `/<category>/<id>` (page itself ports in TD-013 — for this ticket the navigation triggering is enough).

## Test plan

1. Visit each of `/actors`, `/series`, `/movies`, `/tags` — confirm list loads.
2. Filter by typing into the FilterBar — confirm results narrow.
3. Sort by name, by date — confirm reordering.
4. Scroll until LoadMore triggers, confirm next page appends.
5. Click a row, confirm navigation to detail route (404 acceptable until TD-013 lands).
6. Side-by-side compare with web-thunder — pixel parity.
