# TD-069 — AI chat: Expand overlay for action cards

## Description

Design: [design.html](../design.html) — "Node Chat Action Cards", turn 2,
option 2a. Open it in a browser; the overlay is what the card's `Expand`
button opens.

TD-068 put the chat in a right-side drawer but left the action cards
exactly as they were: an inline list card shows six rows
(`MAX_ROWS` in `@swaff-y/thunder-chat-core`) out of a page that may hold
more, with no way to see the rest, and a record card shows one carousel
with dots and no way to pick a picture directly. The design answers both
with the same control — `Expand` in the card header — which fills the
drawer with a bigger view of that one action and leaves the transcript
underneath, reachable again through `Close`.

Concretely, from the design:

- Both the list and the single card get an `Expand` button in their
  header row, right-aligned after the tool name. The chart card does
  not — the design gives it no expanded view.
- The overlay is `position: absolute; inset: 0` **inside the drawer**,
  not over the window: `background: var(--color-surface)` and the
  drawer's own shadow, so the page and the scrim behind the drawer are
  untouched.
- Overlay header: the same `Action · list` / `Action · record` kind
  label, title and tool as the card, then `Back to list` (single only,
  and only when the action came out of a list) and `Close`.
- List body: the wide table — `Image`, the entity label, `Actors`,
  the metric (right-aligned), and the row's CTA — over **every** row in
  the action's page, not the inline six. The footer keeps the count
  line.
- Single body: the record's carousel at 300px with a vertical
  thumbnail rail beside it (96px wide, one thumbnail per slot, the
  current one outlined), then the name, id, `Copy ID` /
  `Open in catalogue`, and the cast chips as the inline card already
  draws them.

## Requirements

- New `ActionOverlay.tsx` in
  [components/chat/](../src/renderer/src/components/chat/):
  - Takes the `ChatAction` to expand and an `onClose`. Renders the
    header above, then the list table or the single view by
    `action.kind`.
  - Rendered by `ChatPanel` inside the drawer panel, so it covers the
    transcript and the composer and nothing else.
  - Closes on `Close` and on `Escape`, and `Escape` must close the
    overlay only — the drawer stays open, i.e. the overlay's handler
    stops the event reaching `ChatDrawer`'s.
  - On open, focus moves into the overlay; on close, focus returns to
    the `Expand` button that opened it.
- [ActionCardList.tsx](../src/renderer/src/components/chat/ActionCardList.tsx)
  and
  [ActionCardRecord.tsx](../src/renderer/src/components/chat/ActionCardRecord.tsx):
  - Add an optional `onExpand` prop and render the `Expand` button in
    the header when it is given. No `onExpand`, no button — the cards
    stay usable outside the drawer.
- Uncapped rows:
  - `toListCard` slices to `MAX_ROWS` (6). The overlay needs the whole
    page, so the row cap has to become a caller's choice — an options
    argument on `toListCard` in
    [thunder-chat-core](https://github.com/swaff-y/thunder-chat-core),
    released and pinned here before this ticket can land. Raise it
    there as a TCC ticket; this repo passes the option and does not
    reach into `action.result` itself.
- [ImageCarousel.tsx](../src/renderer/src/components/shared/ImageCarousel.tsx):
  - Accept an optional controlled `index` + `onIndexChange` so the
    thumbnail rail can drive the carousel. Uncontrolled behaviour, and
    every page already using it, must not change.
- Tests:
  - `ActionOverlay`: list renders every row of the page (more than the
    inline six); single renders the rail and clicking a thumbnail
    changes the slide; `Close` and `Escape` close the overlay and leave
    the drawer open; focus returns to `Expand`.
  - `ActionCardList` / `ActionCardRecord`: the `Expand` button appears
    only with `onExpand` and calls it.
  - `ChatDrawer`: `Escape` with the overlay open closes the overlay,
    not the drawer.

## ACs

- A list card with more rows than the inline six shows `Expand`;
  clicking it fills the drawer with the wide table over every row of
  that page, and the count line still reads `Showing 6 of N` in the
  card behind it.
- A record card shows `Expand`; the expanded view has the 300px
  carousel with a thumbnail rail, and clicking a thumbnail moves the
  carousel to that slot.
- `Close` returns to the transcript with the conversation and the
  scroll position intact; `Escape` does the same and leaves the drawer
  open, and a second `Escape` then closes the drawer.
- `Back to list` inside the expanded single view goes back to the list
  it came out of, matching the inline card's behaviour.
- Widening the drawer to 880px widens the overlay with it; the table
  keeps its columns and does not scroll horizontally at 560px.
- The chart card has no `Expand` and is unchanged.

## Test plan

1. `npm run dev`, log in, `Ask catalogue`, ask "show me the most
   popular actors" — confirm the card shows six rows and `Expand`.
2. Expand; confirm the table lists every actor in the page with
   thumbnails, actors, metric and CTA, and that `Widen` widens it.
3. `Escape`; confirm the overlay closes and the drawer is still open
   with the transcript where it was. `Escape` again closes the drawer.
4. Ask "tell me about <record>"; expand the record card; click through
   the thumbnail rail and confirm the big image follows.
5. `Back to list` from the expanded record, then `Close`.
6. `npm test`.

## Out of scope

- The design's `Load more` button. The action carries one page from
  one tool call; fetching past it means re-running the tool with an
  offset, which is a context-server/`thunder-chat-core` capability
  before it is a button. The overlay shows the whole page and the
  count line says when more exists — the button lands with that
  capability.
- An expanded view for the chart card.
- Expanding actions from earlier turns. Only the latest turn draws a
  card today (design 2a); the overlay inherits that.
- Reflowing the table into cards on narrow widths — the drawer's two
  widths are both wide enough for the five columns.
