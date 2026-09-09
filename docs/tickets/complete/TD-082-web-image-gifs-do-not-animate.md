# TD-082 — AI chat: a web-images GIF is drawn as a still

## Description

Ask the chat for gifs and TD-077's `web_images` card comes back with five
tiles that do not move. The images are gifs — the answer is correct — but
the card draws a frozen frame.

The cause is in the one line that picks a source:

```tsx
src={candidate.thumbnailUrl ?? candidate.imageUrl}
```

`thumbnailUrl` is the **search engine's own copy**, and a search engine
re-encodes what it caches. Google's `encrypted-tbn0.gstatic.com` hands back
a single-frame JPEG for a gif result — that is what the TD-077 fixtures hold
today: every `image_url` in `TOM_HARDY_IMAGES` ends `.gif` and every
`thumbnail_url` is a gstatic still. So the card is showing exactly what it
asked for; it asked for the wrong thing.

`imageUrl` is the animated original. Preferring it for gifs costs bandwidth
— an original gif is routinely megabytes where the thumbnail is kilobytes —
which is why the thumbnail must stay the default for every other format,
and why this is a per-candidate decision rather than a blanket switch.

There is no MIME type on the wire; `WebImageCandidate` carries `imageUrl`,
`thumbnailUrl`, `sourceHost`, `title` and `aspectRatio` and nothing else, so
the renderer has to read the extension off `imageUrl` itself. That is a
guess, and it is the reason for the second half of this ticket: swapping to
the full-size URL puts the tile on a host that may refuse a hotlink where
the thumbnail never would. A tile that loses that bet currently vanishes —
TD-077 made a failed load remove itself so the grid closes up — so a gif on
a hotlink-blocking host would go from *static picture* to *no picture*. The
fallback has to run the other way first: full size, then thumbnail, and only
then remove the tile.

## Requirements

- [ActionCardWebImages.tsx](../../src/renderer/src/components/chat/ActionCardWebImages.tsx):
  - Add a module-level `isAnimated(url)` helper: parse the URL, take the
    pathname (so a query string cannot hide the extension — the fixture's
    `.../giphy.gif?resize=500%2C280&ssl=1` is a real case), lowercase it, and
    return true for `.gif` and `.webp`. A URL that will not parse is not
    animated.
  - `WebImageTile` picks its `src` from that: an animated `imageUrl` renders
    the full-size URL, everything else keeps `thumbnailUrl ?? imageUrl`.
  - Replace the tile's boolean `failed` state with a small source ladder so
    one failure demotes rather than deletes: full size → thumbnail (only
    where one exists and was not already tried) → tile removes itself, which
    is TD-077's existing behaviour at the end of the ladder. Keep the
    `onError` handler idempotent — a broken URL can fire it more than once.
  - Leave `object-fit: cover` and the `aspectRatio` reservation alone; an
    animated source changes the bytes, not the layout.
- Tests in
  [ActionCardWebImages.test.tsx](../../src/renderer/src/components/chat/__tests__/ActionCardWebImages.test.tsx):
  - A `.gif` candidate renders `image_url`, not `thumbnail_url`.
  - A `.gif?query=…` candidate is still recognised as animated.
  - A `.jpg` candidate still renders `thumbnail_url` — the existing "draws a
    tile per candidate" test asserts the thumbnail for all five and will need
    a non-gif fixture, or splitting, since every current fixture is a gif.
  - A gif whose full-size URL errors falls back to the thumbnail and the tile
    stays in the grid.
  - A gif that errors on both URLs removes its tile (TD-077's rule survives).

## ACs

- Asking the chat for gifs draws a card whose tiles animate.
- A non-gif result still loads the search engine's thumbnail — no card
  quietly starts pulling five full-resolution originals.
- A gif on a host that refuses the hotlink shows the static thumbnail
  instead of disappearing; only a candidate with no working URL at all
  leaves the grid.
- Clicking any tile still opens the full-size image on the Browser tab
  (TD-080), unchanged.

## Test plan

1. `npm run test -- ActionCardWebImages`.
2. `npm run dev`, ask the chat *"find me some gifs of Tom Hardy"*, confirm
   the tiles move.
3. Ask for something that is not a gif — *"find me photos of Sydney"* —
   and confirm in DevTools' Network tab that the tiles are fetched from the
   search engine's thumbnail host, not the publishers'.
4. Scroll the turn out of view and back; the card re-renders from the
   transcript and re-runs no search (TD-077), and the gifs still animate.

## Out of scope

- Having web-mcp send the MIME type or an `isAnimated` flag so the renderer
  stops reading extensions — the right fix, and a thunder-context /
  web-mcp ticket. This one is the renderer-side patch that works against
  what is already deployed.
- Autoplay control (pause the gifs, play on hover). Five moving tiles in a
  drawer is what was asked for; if it proves distracting that is its own
  ticket.
- Animated `.avif` and video-backed results (`.mp4` / `.webm` "gifs" that
  Giphy and Tenor prefer to serve). Those need a `<video>` tile, not an
  `<img>`, which is a different card.
- The same bug in the other two renderers — filed as TH-043 (thunder) and
  THW-34 (web-thunder), since TD-077 is desktop-only so far.
