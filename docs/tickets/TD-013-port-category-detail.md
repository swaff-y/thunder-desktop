# TD-013 — Port CategoryDetail page

## Description

Port web-thunder's CategoryDetail page so `/<category>/<id>` renders the detail view for a single actor / series / movie / tag.

## Requirements

- Copy `web-thunder/src/pages/CategoryDetail.tsx` → `src/renderer/src/pages/CategoryDetail.tsx`. No edits.
- Wire `/:category/:id` route into the temporary route table.
- Hooks (`useRecord`, `useImage`, etc.) and components (`ImageCarousel`, `ContentTable`) already ported in TD-010.

## ACs

- Visiting `/actors/<known-id>` renders the actor detail page.
- Same for `/series/<id>`, `/movies/<id>`, `/tags/<id>`.
- ImageCarousel cycles through gallery images.
- Related-record table (records linked to this entity) loads via Halo API.
- Clicking a related record navigates to its watch route.

## Test plan

1. Hit `/actors/<id>` for a known actor — confirm details render.
2. Repeat for series / movies / tags.
3. Cycle ImageCarousel arrows — confirm next/previous works.
4. Confirm related records list loads with the same data web-thunder shows.
5. Click a related record — navigation to `/watch/<id>` triggers.
6. Side-by-side compare with web-thunder.
