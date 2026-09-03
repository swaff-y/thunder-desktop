# TD-077 — The chat draws the web images it found

## Description

thunder-context [TC-031](https://github.com/swaff-y/thunder-context/blob/main/docs/tickets/complete/TC-031-web-images-are-a-card-and-a-download.md)
added a sixth action kind, `web_images` — five pictures the model found on the
public web through `search_web_images`. It is deployed everywhere. Ask the chat
"find me some gifs of Tom Hardy" today and you get a sentence and **no card**:
`ChatPanel`'s dispatch chain falls through to `return null`.

This adds the fifth branch.

Depends on: TC-031 deployed, and `@swaff-y/thunder-chat-core@0.10.0` published
by TCC-012.

**These images are not ours, and that is the whole of what makes this card
different.** Every other card in this app fetches pictures by id through
`useActionImages` — the action carries an id, the app's own Halo client turns it
into a URL, React Query caches it beside every other catalogue read. There is no
id here. `imageUrl` points at a stranger's server, the bytes were never in
Halo, and nothing in the Thunder stack stores, proxies or refreshes them.

Two consequences that shape everything below:

- **A tile can 404 at any time.** Not an edge case — a *normal* state, on
  hosts nobody vetted, on their schedule rather than ours. It has to degrade.
- **A search costs money.** web-mcp meters every call. The card renders what
  the transcript already holds and **never re-runs anything** — not on scroll-
  back, not on remount, not on a failed image.

## Requirements

### 1. Bump the pin — `package.json`

`0.9.0` → `0.10.0`, exact. This repo is current, so it is a single-version bump.

### 2. The card — `src/renderer/src/components/chat/ActionCardWebImages.tsx`

`toWebImagesCard(action)` from the package, rendered as a grid of at most five
tiles. Returns `null` when the adapter gives `undefined` — a card with nothing
to draw is not drawn.

Follow `ActionCardList`'s header shape (title, caption) so it sits beside the
other four without looking foreign. The layout reference for the grid itself is
`src/renderer/src/components/shared/VirtualRecordList.tsx`, which is the only
real CSS-grid-of-images in this codebase — but it is a browse page, so take the
grid and leave the virtualisation: five tiles need none.

Per tile:

- **Draw `thumbnailUrl`, fall back to `imageUrl`.** The thumbnail is the search
  engine's own small copy and the smaller fetch; the full-size URL is a
  stranger's original and can be several megabytes.
- **`onError` hides that tile and lets the grid close up.** It must not leave a
  broken-image glyph, and it must not take the row with it.
- **Reserve space from `aspectRatio` when it is there, a square when it is
  not.** `undefined` means the provider did not say — do not guess one, or the
  grid reflows when the image lands.
- **`sourceHost` is shown.** These are other people's pictures on other people's
  servers, and the host is the only field that says whose.
- `title` is the provider's *page* title — often long, sometimes odd. Truncate
  it; it is the `alt` text and a tooltip, not a caption to lay out around.

**No `useActionImages`, no React Query, no fetch.** The URLs are in the action.
Adding a hook here would be inventing a cache for bytes we do not own and cannot
invalidate.

### 3. The dispatch — `src/renderer/src/components/chat/ChatPanel.tsx`

A fifth branch above `return null`:

```jsx
if (action.kind === "web_images") {
  return <ActionCardWebImages action={action} />;
}
```

No `renderImage` slot prop. That pattern exists so the list card can stay free
of data hooks and be rendered in a test without a query client — this card has
no data hooks to keep out of, so threading a slot through `ChatPanel` would buy
nothing and cost a prop.

### 4. Opening one full size

Clicking a tile opens `imageUrl`. Use the app's existing external-link path
rather than a bare `<a target="_blank">` — an Electron renderer navigating
itself to a stranger's URL is the thing that path exists to prevent. If there is
no such helper, `shell.openExternal` through the preload bridge, and say so in
the PR so THW-31 and TH-028 know this was a desktop-specific answer.

**Not a lightbox.** `ActionOverlay` and `onExpand` are TD-069's, for cards with
more rows than fit; five tiles fit.

### 5. Tests — `src/renderer/src/components/chat/__tests__/ActionCardWebImages.test.tsx`

In the existing harness, beside `ActionCardList.test.tsx` and
`ActionCardUpload.test.tsx`. Add a `webImagesAction` fixture to `./fixtures`,
built from thunder-context's real capture at
`spec/fixtures/search_web_images_result.json` rather than invented.

- Five tiles render, each with an `img` whose `src` is the thumbnail.
- A candidate with no `thumbnailUrl` renders its `imageUrl` instead.
- Firing `error` on one tile's image removes that tile and leaves the other four.
- `sourceHost` appears for each tile.
- **Nothing is fetched.** Assert the app's Halo client and `useActionImages` are
  never called — the invariant this card is most likely to lose to a later
  refactor, and the same shape of assertion `ActionCardUpload.test.tsx` makes
  about `requestUploadUrl`.
- `ChatPanel.test.tsx` gains a case that a `web_images` turn renders the card
  rather than falling through to `null`.

## ACs

- "find me some gifs of Tom Hardy" in the running app produces a grid of five
  images beside the answer.
- Every tile's picture loads, and each names the host it came from.
- A tile whose image 404s disappears; the rest of the grid is unaffected.
- Clicking a tile opens the full-size image outside the renderer.
- Scrolling the turn out of view and back re-renders from the transcript with
  **no network request to web-mcp or thunder-context**.
- `npm run lint`, `npm run typecheck` and `npm test` green.

## Test plan

1. `npm run dev`, signed in against a stage whose `WebMcpUrl` is set — that is
   every stage since TC-031.
2. Ask "find me some gifs of Tom Hardy". Confirm five tiles, five hosts.
3. Ask "how many records do I have?" and confirm it still produces its list
   card — the two servers coexisting is the regression TC-030 and TC-031 both
   guarded, and this is the first time a client can see it.
4. In DevTools, block one tile's host and reload the turn: that tile goes, four
   remain, no console error.
5. Watch the Network tab while scrolling the turn out of view and back. Nothing.
6. Click a tile. The full-size image opens outside the app window.

## Out of scope

- **Saving an image to disk.** TC-031 cut it and it is nobody's ticket yet. A
  cross-origin URL and a `<a download>` that is ignored cross-origin; it needs a
  design, and this is not where it gets one.
- **Uploading a web image to a Halo entity.** Bytes would have to cross from a
  stranger's host to Halo's bucket. New ticket, real design.
- **Re-running a search**, for any reason, including a grid that has entirely
  rotted. The user asks again.
- **A shared grid component with web-thunder.** `@swaff-y/thunder-chat-ui-web`
  is worth extracting once two implementations exist, not before — the same call
  TCC-011 made about the drop zone.
- **Virtualising the grid.** Five tiles.
