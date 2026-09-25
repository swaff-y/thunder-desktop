# TD-091 — Browser tab: right-click a link → "Open link in new tab"

## Description

TD-089 gave the Browser tab a strip of tabs, and the only ways to reach
a second one are the strip's **+** and a page's own `target=_blank`
(`useBrowserNav`'s `new-window` handler, which calls `tabs.open`). An
ordinary link — the overwhelming majority of them — still has exactly
one destination: the tab you are reading. Following it is destructive in
the way TD-089 set out to fix, just one level down: the search results,
the index page, the listing you spent three navigations reaching is gone
and `Back` is the only route home.

The affordance every browser has for this is the right-click menu, and
half of it already exists here. TD-047 built
[browser-context-menu.ts](../src/main/ipc/browser-context-menu.ts):
the renderer relays the webview's `context-menu` params over IPC, main
applies the partition gate and pops a native `Menu`. That menu has one
item, **Save image**, and main returns early on anything whose
`mediaType` is not `image` — so right-clicking a link today shows
nothing at all.

Two things are missing. The request shape carries `srcURL` but not
`linkURL`, so main cannot see that a link was clicked. And the menu is
built in main while the tab strip lives in the renderer
(`useBrowserTabs`), so the click handler has nothing to call — unlike
**Save image**, which finishes its work entirely in main. The channel is
`ipcMain.handle`, so the fix is the cheap one: resolve the invoke with
the item the user chose and let the renderer act on it, rather than
adding a second push channel and a second copy of the tab-open path.

Where the new tab lands is a real choice, not an implementation detail.
`tabs.open` foregrounds, because a `target=_blank` popup is the page
asking to be looked at. A user who right-clicks and picks **Open link in
new tab** is saying the opposite — keep me here — so this path opens in
the background, and `open` grows the one option that distinguishes them.

## Requirements

- [thunder-api.ts](../src/preload/thunder-api.ts):
  - Add `linkURL: string` to `ThunderBrowserContextMenuRequest`. Document
    it as untrusted renderer input, the same as the existing fields.
  - Change `contextMenu.show` to
    `(request) => Promise<ThunderContextMenuResult>`, with
    `ThunderContextMenuResult = { action: 'open-in-new-tab'; url: string } | { action: 'none' }`.
    `'none'` covers every case main handles by itself (**Save image**), a
    dismissed menu, and a request that fails a gate — the renderer does
    not need to tell those apart.
- [browser-context-menu.ts](../src/main/ipc/browser-context-menu.ts):
  - `parseRequest` requires `linkURL` to be a string; a request missing
    it is rejected as malformed, as now.
  - Build the template from what the params support rather than
    returning early:
    - `linkURL` parsing as `http(s)` → **Open link in new tab**.
    - `mediaType === 'image'` with a saveable `srcURL` scheme → **Save
      image**, byte-for-byte the behaviour TD-047 shipped.
    - Both → both items, link first (Chrome's order), separated.
    - Neither → no menu popped, and resolve `{ action: 'none' }`.
  - Reuse `parseHttpUrl` for the link. A `javascript:`, `file:`,
    `data:` or extension-scheme link gets no item — fail closed, as
    TD-047's `imageScheme` does. The URL handed back to the renderer is
    the parsed `URL`'s `toString()`, not the raw string.
  - Resolve the `ipcMain.handle` promise with the chosen action. Resolve
    `{ action: 'none' }` on `menu-will-close` (or the `popup` callback)
    so a dismissed menu never leaves the renderer's `await` pending, and
    make the resolve idempotent — a click plus a close must not settle
    twice.
  - The partition gate stays exactly where it is and runs before any
    item is built.
- [useBrowserNav.ts](../src/renderer/src/browser/useBrowserNav.ts):
  - Send `linkURL: event.params.linkURL` with the existing fields.
  - `await` the result; on `{ action: 'open-in-new-tab' }` call the same
    `onNewWindowRef.current` the `new-window` handler uses, in its
    background form (below). With no handler registered the tab is
    standalone and there is nowhere to put a second page — do nothing
    rather than `loadURL`, which would destroy the page the user was
    explicitly trying to keep.
  - The existing `.catch()` stays: a rejected invoke is still silent.
- [useBrowserTabs.ts](../src/renderer/src/browser/useBrowserTabs.ts):
  - `open(url?: string, options?: { background?: boolean })`. Default
    (and every current call site) is unchanged: foreground. With
    `background: true` the tab is appended and `activeId` is left alone.
  - `MAX_BROWSER_TABS` and its refusal message are untouched: a
    background open at the cap returns `false` and sets the same message,
    which the strip already draws.
- [useBrowserNav.ts](../src/renderer/src/browser/useBrowserNav.ts) /
  [BrowserTabView.tsx](../src/renderer/src/browser/BrowserTabView.tsx):
  - Thread the background flag through whatever `onNewWindow` becomes —
    an added argument, or a second callback — without changing what a
    `target=_blank` popup does.
- Tests:
  - `browser-context-menu.test.ts`: a link-only right-click builds one
    item and resolves `{ action: 'open-in-new-tab' }` with the parsed
    URL; an image-only one still saves and resolves `{ action: 'none' }`;
    a linked image builds two items; a `javascript:` link builds none; a
    request from outside the Browser partition pops no menu; a dismissed
    menu resolves `{ action: 'none' }` exactly once.
  - `useBrowserNav.test.tsx`: a `context-menu` event forwards `linkURL`;
    an `open-in-new-tab` result calls the tab-open callback in its
    background form and does **not** call `loadURL`; the same result with
    no callback registered does nothing.
  - `useBrowserTabs.test.ts`: `open(url, { background: true })` appends
    without moving `activeId`; the same call at the cap returns `false`
    and sets the cap message.

## ACs

- Right-clicking a link on a page in the Browser tab shows a native menu
  with **Open link in new tab**.
- Choosing it opens the link as a new tab in the strip, and the tab you
  right-clicked in stays on screen showing the page it was already on.
- Right-clicking an image that is also a link shows both **Open link in
  new tab** and **Save image**, and each does only its own job.
- Right-clicking a plain image still shows **Save image** alone, and it
  saves exactly as it did before this ticket (http(s), `data:` and
  `blob:` all included).
- Right-clicking page text with no link and no image shows no menu.
- A `javascript:` or `mailto:` link offers no **Open link in new tab**
  item; nothing is opened and nothing navigates.
- Choosing **Open link in new tab** while 8 tabs are open opens nothing
  and shows the existing cap message in the strip.
- Dismissing the menu with `Esc` or a click elsewhere leaves every tab
  exactly as it was.

## Test plan

1. `npm run dev`, Browser tab, google something, right-click a result
   link → **Open link in new tab**. Confirm a new tab appears in the
   strip, the results page is still the one on screen, and clicking the
   new tab shows the linked page.
2. On the same results page, right-click a thumbnail that links out:
   confirm both items, and that **Save image** still lands the file in
   the downloads drawer with "Show in Folder" working.
3. Right-click a plain paragraph: confirm no menu.
4. Find a `mailto:` link (any contact page): confirm no open-in-new-tab
   item and that nothing launches.
5. Open tabs until the strip refuses (8), then right-click a link and
   choose the item: confirm the cap message and no ninth tab.
6. Right-click a link and press `Esc`: confirm no tab opens.
7. `npm run test` and `npm run lint`.

## Out of scope

- Any other context-menu item — **Copy link address**, **Open in new
  window**, **Back/Forward/Reload**, **Copy image address**, **Open
  image in new tab**, text **Copy**/**Paste**. This ticket adds one
  item and the plumbing that makes a second one cheap; the rest is a
  follow-up if it is wanted.
- `Cmd`/middle-click on a link as a second route to the same thing —
  worth having, and a separate ticket, because it is a
  `will-navigate`/mouse-event path rather than a menu one.
- Reordering, dragging or pinning tabs in the strip (TD-089 scope).
- The companion menus in thunder and web-thunder: neither has an
  embedded browser, so there is nothing to port.
