# TD-015 — Port MultiWatch page

## Description

Port web-thunder's MultiWatch page so `/multi-watch` plays multiple records simultaneously in a grid.

## Requirements

- Copy `web-thunder/src/pages/MultiWatch.tsx` → `src/renderer/src/pages/MultiWatch.tsx`. No edits.
- Wire `/multi-watch` route into the temporary route table. (Note: web-thunder's `/multi-watch` route renders without `AppLayout` — preserve that behavior.)
- `CartProvider` and `useCart` already ported in TD-009 (they back this page's record list).

## ACs

- `/multi-watch` renders a grid of video players matching web-thunder.
- Adding records via the cart populates the grid.
- Removing records from the grid clears their player.
- Each player operates independently (pause one, others continue).
- Layout adapts to 1, 2, 3, 4+ players (web-thunder's grid math).

## Test plan

1. Add 1 record to cart, navigate to `/multi-watch` — confirm one player.
2. Add 4 records — confirm 2×2 grid.
3. Pause player 2, confirm players 1/3/4 still play.
4. Remove a record — confirm grid reflows.
5. Side-by-side compare with web-thunder for grid math at 1, 2, 3, 4, 6 records.
