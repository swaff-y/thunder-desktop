# TD-010 — Port shared and desktop components

## Description

Port all shared and desktop-specific UI components from web-thunder into the renderer. These are the building blocks consumed by the page tickets (TD-011 through TD-016).

## Requirements

- Add to `dependencies`:
  - `react-icons ^5.6.0`
  - `recharts ^3.8.1` (used by Stats components)
  - `react-router-dom ^7.13.2`
- Copy verbatim:
  - `web-thunder/src/components/shared/CartDropdown.tsx`
  - `web-thunder/src/components/shared/CategoryAutocomplete.tsx`
  - `web-thunder/src/components/shared/ContentTable.tsx`
  - `web-thunder/src/components/shared/ErrorState.tsx`
  - `web-thunder/src/components/shared/FilterBar.tsx`
  - `web-thunder/src/components/shared/ImageCarousel.tsx`
  - `web-thunder/src/components/shared/LoadingSpinner.tsx`
  - `web-thunder/src/components/shared/LoadMore.tsx`
  - `web-thunder/src/components/shared/VideoPlayer.tsx`
  - `web-thunder/src/components/shared/VirtualRecordList.tsx`
  - `web-thunder/src/components/desktop/ContentGrid.tsx`
  - `web-thunder/src/components/desktop/DesktopCard.tsx`
  - `web-thunder/src/components/desktop/HeroCarousel.tsx`
  - `web-thunder/src/components/desktop/stats/*` (whole directory)
- Copy supporting hooks not yet ported:
  - `web-thunder/src/hooks/useCategories.ts`
  - `web-thunder/src/hooks/useImage.ts`
  - `web-thunder/src/hooks/useListFilter.ts`
  - `web-thunder/src/hooks/useRecord.ts`
  - `web-thunder/src/hooks/useRecords.ts`
  - `web-thunder/src/hooks/useStats.ts`
- Do **not** copy `web-thunder/src/components/mobile/`.
- Verify each component compiles in isolation by adding a temporary `Storybook`-lite gallery route at `/dev/components` (deletable later) that mounts each component with sample props.

## ACs

- `npm run typecheck` passes after all copies.
- `npm run lint` passes.
- A gallery route renders all 13 shared/desktop components without runtime errors.
- `LoadingSpinner` shows the Thunder accent color (`#0ea5e9`).
- `VideoPlayer` mounts a `<video>` element and accepts a `src` prop.
- `recharts` charts in the stats components render with sample data.

## Test plan

1. Build component gallery, navigate to `/dev/components`, smoke-test every component renders.
2. `npm run typecheck && npm run lint` — green.
3. `diff -r web-thunder/src/components/shared src/renderer/src/components/shared` — only path differences.
4. `diff -r web-thunder/src/components/desktop src/renderer/src/components/desktop` — only path differences.
5. `grep -r "components/mobile" src/renderer` — zero results.
