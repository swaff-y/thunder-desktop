# Thunder Desktop — Tickets

Implementation tickets for [thunder-desktop-plan.md](../thunder-desktop-plan.md). Each ticket is independently testable.

## Phase 0 — Scaffold

- [TD-001](complete/TD-001-scaffold-electron-app.md) — Scaffold Electron app with electron-vite
- [TD-002](complete/TD-002-native-app-menu.md) — Native application menu
- [TD-003](complete/TD-003-window-state-persistence.md) — Persist window state across launches
- [TD-004](complete/TD-004-electron-builder-config.md) — electron-builder configuration for macOS

## Phase 1 — Web-thunder parity

- [TD-005](complete/TD-005-port-theme.md) — Port Thunder theme to renderer
- [TD-006](complete/TD-006-port-layout.md) — Port DesktopLayout, Sidebar, TopBar (drop mobile)
- [TD-007](complete/TD-007-port-api-client.md) — Port API client, halo API, types
- [TD-008](complete/TD-008-react-query-setup.md) — React Query setup with offline persistence
- [TD-009](complete/TD-009-port-auth.md) — Port auth flow (Login + useAuth)
- [TD-010](complete/TD-010-port-shared-components.md) — Port shared and desktop components
- [TD-011](complete/TD-011-port-home-page.md) — Port Home page
- [TD-012](complete/TD-012-port-category-list.md) — Port CategoryList page
- [TD-013](complete/TD-013-port-category-detail.md) — Port CategoryDetail page
- [TD-014](complete/TD-014-port-watch-page.md) — Port Watch page
- [TD-015](complete/TD-015-port-multi-watch.md) — Port MultiWatch page
- [TD-016](complete/TD-016-port-stats.md) — Port Stats page
- [TD-017](complete/TD-017-wire-router.md) — Wire up app router

## Phase 2 — Settings & persistence

- [TD-018](complete/TD-018-settings-store.md) — Settings persistence (IPC + JSON store)
- [TD-019](complete/TD-019-settings-modal.md) — Settings modal UI

## Phase 3 — Browser tab basic

- [TD-020](complete/TD-020-browser-route.md) — Browser tab — sidebar entry and route
- [TD-021](complete/TD-021-embedded-webview.md) — Browser tab — embedded webview with chrome

## Phase 4 — Browser tab detection

- [TD-022](complete/TD-022-asset-detection-main.md) — Browser tab — video asset detection (main)
- [TD-023](complete/TD-023-detected-assets-panel.md) — Browser tab — detected assets panel (renderer)

## Phase 5 — Browser tab downloads

- [TD-024](complete/TD-024-download-manager-main.md) — Browser tab — download manager (main)
- [TD-025](complete/TD-025-downloads-drawer.md) — Browser tab — downloads drawer (renderer)
- [TD-026](complete/TD-026-download-folder-picker.md) — Browser tab — download folder picker
- [TD-032](TD-032-download-safety.md) — Browser tab — download safety hardening (lands with TD-024)

## Phase 6 — Polish & ship

- [TD-027](TD-027-code-signing.md) — macOS code signing and notarization
- [TD-028](TD-028-auto-updater.md) — Auto-updater wiring
- [TD-029](TD-029-prod-url-cutover.md) — Production API URL cutover
- [TD-051](complete/TD-051-managed-api-domains-cutover.md) — Managed API domain cutover + settings migration

## Phase 7 — Browser hardening

- [TD-031](TD-031-safe-browsing.md) — Browser tab — Safe Browsing URL filtering

## Phase 8 — AI chat on Home

See [ai-chat-plan.md](../ai-chat-plan.md) for the design, request flow, and the
open decision on Bedrock credentials.

- [TD-052](complete/TD-052-chat-bedrock-settings.md) — AI chat: settings and Bedrock credentials
- [TD-053](complete/TD-053-halo-mcp-client.md) — AI chat: halo-mcp client in the main process
- [TD-054](complete/TD-054-bedrock-agent-loop.md) — AI chat: Bedrock agent loop and chat IPC
- [TD-055](complete/TD-055-chat-session-store.md) — AI chat: chat session store
- [TD-056](complete/TD-056-home-chat-shell.md) — AI chat: Home chat panel and featured-content swap
- [TD-057](complete/TD-057-action-card-list.md) — AI chat: action card — list
- [TD-058](complete/TD-058-action-card-record.md) — AI chat: action card — single record with carousel
- [TD-059](complete/TD-059-action-card-chart.md) — AI chat: action card — chart
- [TD-061](complete/TD-061-tool-schema-top-level-unions.md) — AI chat: strip top-level oneOf/anyOf from MCP tool schemas

## Phase 9 — AI chat moves to a shared server

See [thunder-context-server-proposal.md](../thunder-context-server-proposal.md).
The Bedrock loop, MCP client and per-user AWS keys move to
[thunder-context](https://github.com/swaff-y/thunder-context) so web-thunder and
thunder can have the same chat — neither can hold AWS credentials, so neither
could ever have copied phase 8.

- [TD-065](complete/TD-065-context-server-cutover.md) — AI chat: cut over to
  thunder-context. Shipped in #56.
- [TD-067](complete/TD-067-chat-markdown-renderer.md) — AI chat: render the
  answer's markdown. Shipped in #57.
- [TD-068](complete/TD-068-chat-side-drawer.md) — AI chat: move the chat into
  a right-side drawer ([design.html](../design.html), turn 2, option 2a).
  Shipped in #60.
- [TD-069](complete/TD-069-action-card-expand-overlay.md) — AI chat: Expand
  overlay for action cards (the wide table and the record's thumbnail rail,
  split out of TD-068). Held open while the overlay's list could only draw the
  inline six; thunder-chat-core 0.8.0 shipped TCC-010's `maxRows` option, so it
  now draws the whole page. Shipped in #65.
- [TD-070](complete/TD-070-chat-knows-the-current-page.md) — AI chat: the agent
  knows what page you are on, so "what actors are on **this** record?" works on
  a record page. One route map plus the IPC plumbing to carry it; the wire field
  and the prompt rules are thunder-context TC-016 and the type is
  thunder-chat-core TCC-006. Merged in 35c4c0e.

- [TD-072](complete/TD-072-the-chat-says-what-it-cost.md) — AI chat: the chat
  says what it cost. One line above the composer naming the model and the
  conversation's estimated spend. One IPC push channel, one capabilities call
  and one line of markup — the tokens and the price are thunder-context TC-027
  and the formatted string is thunder-chat-core TCC-008. Shipped in #62.

- [TD-073](complete/TD-073-a-reload-starts-a-new-conversation.md) — AI chat: a
  reload starts a new conversation, and only the user can tell. The renderer persists
  the transcript; main held the conversation id in memory, so after a reload
  the user reads their old turns while the server holds an empty conversation
  and the next follow-up reaches the model with no context. Bump
  thunder-chat-core to 0.7.0 and forward `conversation` / `onConversation` —
  one more IPC channel, shaped exactly like `chatUsage`. The fix itself is
  thunder-chat-core TCC-009. Shipped in #64.

- [TD-074](complete/TD-074-chat-composer-textarea-history-draft.md) — AI chat:
  the composer is a textarea, keeps history, and survives a close. Multi-line
  input with `Enter` to send, `Up`/`Down` through the questions already
  asked, and a draft that only `Clear` empties. Renderer-only. Shipped in #63.

- [TD-075](complete/TD-075-chat-upload-card-drop-zone.md) — AI chat: the upload
  card, with a drop zone. thunder-context TC-028 has the chat offer an upload
  after it creates something, and answer a yes with `kind: 'upload'` carrying a
  **target, not a URL**. The renderer mints its own presigned URL against Halo
  — and mints it only once a file has been dropped, because
  `POST /v1/{type}/{id}/upload` deletes the current image before a single byte
  is uploaded. Flow and types come from `@swaff-y/thunder-chat-core@0.9.0`
  (TCC-011); this repo supplied the ports, the drop zone and the pixels. The
  ticket's open question — whether large video is reachable here — is answered
  in the card: it is, so it refuses anything over 500 MB rather than streaming
  a 4GB file through a PUT with no resume. Shipped in #66.

- [TD-077](complete/TD-077-chat-web-images-card.md) — AI chat: the web-images
  card. thunder-context TC-031 adds a sixth kind, `web_images` — five pictures
  the model found on the **public web** through a second MCP server — and it is
  deployed everywhere, so the chat answered a "find me some gifs" question with
  a sentence and no card. **These images are not ours**, which is the whole of
  what makes this card different: every other one fetches by id through
  `useActionImages`, and there is no id here. A tile can 404 at any time, on
  hosts nobody vetted, so it degrades rather than breaking the grid; and a
  search is metered in web-mcp, so the card renders from the transcript and
  never re-runs one. Types from `@swaff-y/thunder-chat-core@0.10.0` (TCC-012).
  Clicking a tile opens the full-size image through the TD-021 `openExternal`
  bridge — a desktop-specific answer THW-31 and TH-028 will each need their own
  version of. Shipped in #67, with the first AC unconfirmed against a live turn.

## Bugs / polish

- [TD-033](TD-033-settings-url-trim.md) — Settings: trim whitespace from API URL
- [TD-034](complete/TD-034-actor-card-images.md) — Fix missing images on actor cards
- [TD-035](complete/TD-035-browser-tab-persist-session.md) — Browser tab: preserve session across tab switches
- [TD-036](complete/TD-036-category-card-navigation.md) — Fix category card clicks (freeze in prod, redirect to Home in dev)
- [TD-037](complete/TD-037-hls-download-as-mp4.md) — Browser tab: download HLS (.m3u8) as a single mp4
- [TD-038](complete/TD-038-preserve-tab-navigation-state.md) — Preserve sidebar tab navigation state and add Back navigation
- [TD-039](complete/TD-039-suspend-hidden-webview.md) — Suspend embedded webview when Browser tab is hidden (videos hang on Watch since TD-035)
- [TD-040](complete/TD-040-browser-clicks-fail-after-scroll.md) — Browser tab: clickable links stop working past a scroll point (likely webview hit-test offset)
- [TD-041](complete/TD-041-expose-entity-id-for-copy.md) — Detail view: expose entity ID for copying (info button)
- [TD-042](complete/TD-042-download-survives-multiwatch-nav.md) — Browser download discarded when navigating to MultiWatch (must continue; bar hidden off-tab)
- [TD-046](complete/TD-046-watch-hangs-during-downloads.md) — Watch / MultiWatch video hangs while downloads are in progress (socket-saturation, needs reload to recover)
- [TD-047](complete/TD-047-browser-save-image-context-menu.md) — Browser tab: right-click image → "Save image" context menu
- [TD-048](complete/TD-048-browser-default-url-google.md) — Browser tab: default URL of google.com
- [TD-050](complete/TD-050-draggable-top-bar.md) — Draggable top bar (window drag region)
- [TD-060](complete/TD-060-dev-backend-default.md) — `npm run dev` defaults to the dev backend
- [TD-062](complete/TD-062-bedrock-smoke-client-mismatch.md) — Bedrock smoke test validates a different client than the app
- [TD-063](complete/TD-063-dev-userdata-isolation.md) — `npm run dev` repoints the packaged app at the dev backend (shared userData)
- [TD-064](complete/TD-064-bedrock-defaults-stale.md) — Shipped Bedrock defaults don't work against the app's own client
- [TD-066](complete/TD-066-dev-mcp-url-default.md) — `npm run dev` defaults to the dev halo-mcp (dev token + prod MCP reads as "Your session expired")
- [TD-071](complete/TD-071-multiwatch-audio-focus-and-expand.md) — MultiWatch: one audio track at a time and expand a cell to fullscreen (the two things TH-012 added on mobile and TD-015's port never got). Shipped in #61.
