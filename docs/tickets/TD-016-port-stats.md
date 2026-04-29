# TD-016 — Port Stats page

## Description

Port web-thunder's Stats page so `/stats` renders charts (recharts) over Halo's stats endpoints. In web-thunder this route is gated behind `DesktopOnlyRoute` — the desktop app drops that gate (Electron is always desktop).

## Requirements

- Copy `web-thunder/src/pages/Stats.tsx` → `src/renderer/src/pages/Stats.tsx`. No edits inside the file (just remove the `DesktopOnlyRoute` wrapper at the route level — that change lives in TD-017).
- Wire `/stats` route into the temporary route table without `DesktopOnlyRoute`.
- Stats subcomponents (`components/desktop/stats/*`) and `useStats` hook already ported in TD-010.
- Confirm `recharts` charts render with sample API data.

## ACs

- `/stats` renders the full Stats dashboard.
- All chart types from web-thunder render: top entities, platform, trending, summary, timeline, CTR.
- Granularity / event-type / entity-type controls update charts via React Query refetch.
- No `DesktopOnlyRoute` wrapper in Thunder Desktop's route definition.

## Test plan

1. Visit `/stats`, confirm all charts render against the dev backend.
2. Switch granularity (day/week/month), confirm charts re-fetch and update.
3. Switch entity type (actor/series/movie), confirm charts re-fetch.
4. Side-by-side with web-thunder, confirm same data points.
5. `grep -r "DesktopOnlyRoute" src/renderer` returns zero hits.
