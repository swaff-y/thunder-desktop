# TD-072 — AI chat: the chat says what it cost

**Ticket:** `docs/tickets/TD-072-the-chat-says-what-it-cost.md` — show, above
the composer, what the open conversation has cost and which model ran it. One
push channel (`thunder:chat:usage`), one invoke (`thunder:chat:capabilities`),
one line of markup. The tokens and the price are thunder-context TC-027; the
types, the transport and **the formatted string** are thunder-chat-core
TCC-008. Nothing about the wording, the decimals or the currency is this
repo's.

Reviewed against `git diff main...HEAD` on
`TD-072-the-chat-says-what-it-cost`.

## Summary of changes

- `package.json`: `@swaff-y/thunder-chat-core` `0.5.0` → `0.6.0`, pinned
  exact. `package-lock.json` deliberately untouched — 0.6.0 is not published
  yet, so the lock cannot be regenerated; it lands with the publish.
- `src/preload/thunder-api.ts`: `chatUsage` (`thunder:chat:usage`) and
  `chatCapabilities` (`thunder:chat:capabilities`) channels;
  `chatCapabilities` added to `THUNDER_ALLOWLIST`, `chatUsage` deliberately
  left out of it beside `chatStatus`; `chat.onUsage` subscription and
  `chat.capabilities` invoke on `ThunderApi`; `Capabilities` and `TurnUsage`
  re-exported for the same reason `ViewContext` is.
- `src/main/ipc/chat.ts`: `onUsage` passed to `context.ask`, guarded by
  `controller.signal.aborted` exactly as `onStatus` is, pushed with
  `sendToFocused`; a `chatCapabilities` handler returning
  `{ chat_enabled: false, tools: [] }` while the toggle is off and
  `context.capabilities()` otherwise.
- `src/renderer/src/hooks/useChatBridge.ts`: a second life-of-the-component
  subscription for `chatUsage`, forwarding through a ref the way the status
  one does; `send` stops ignoring its `lifecycle` argument and parks
  `lifecycle.onUsage`; a `loadCapabilities` member on the bridge.
- `src/renderer/src/App.tsx`: `loadCapabilities` passed to `ChatProvider`.
- `src/renderer/src/components/chat/ChatPanel.tsx`: `usage` / `model` read
  from `useChat()`, `formatUsageSummary(usage, model)`, and the line between
  the `role="status"` region and the composer form.
- Tests: three cases in `src/main/ipc/__tests__/chat.test.ts` (push, superseded
  drop, capabilities either side of the toggle) plus a `null` pass-through, and
  four in `ChatPanel.test.tsx`.

`npm run test`: **436/436 passing** (26 files). `npm run typecheck`: clean on
both `tsconfig.node.json` and `tsconfig.web.json`. `npm run lint`: 2 errors /
2675 warnings, against 2 errors / 2616 on `main` — the two errors are both in
`DesktopLayout.tsx` and pre-existing; every added warning is `prettier/prettier`
quote-and-semicolon style that the whole `src/renderer` tree already carries.
`eslint` on the four main/preload files touched: **zero output**.

## Requirements coverage

| # | Requirement | Status | Evidence |
|---|-------------|--------|----------|
| 1 | `chatUsage` push channel beside `chatStatus`; `chatCapabilities` in the invokable list; `chatUsage` excluded for the same reason `chatStatus` is. | Met | `thunder-api.ts` — the two channels sit in the TD-054 chat block; `THUNDER_ALLOWLIST` gains `chatCapabilities` only, and the allowlist's own comment now names `chatUsage` in the exclusion beside `menuAction` and `chatStatus`. |
| 2 | `onUsage` passed to `context.ask`, guarded by `controller.signal.aborted`, pushed with `sendToFocused`. | Met | `chat.ts` — identical shape to the `onStatus` guard immediately above it. Covered by "pushes the usage of a turn that ran to the end" and "drops the usage of a superseded turn". The drop test was mutation-checked: removing the guard fails it. |
| 3 | `chatCapabilities` handler; disabled shape when `chatEnabled` is false, as `chatAsk` does. | Met | `chat.ts` `DISABLED_CAPABILITIES`. Three tests: names the model when on, returns `{ chat_enabled: false, tools: [] }` **and calls nothing** when off, and passes a `null` read through untouched. |
| 4 | Bridge subscribes to `chatUsage` as it does `onStatus`, and passes `onUsage` through `lifecycle`. | Met | `useChatBridge.ts` — `_lifecycle` becomes `lifecycle`; `usageRef` mirrors `statusRef` in every respect (single subscription, parked per turn, released in `finally`). |
| 5 | The line: `formatUsageSummary`, no string building, `null` renders nothing, not `aria-live`, quiet, reserved height, above the composer and not in the header. | Met | `ChatPanel.tsx`. No `toFixed`, no `$`, no "estimated" and no model prettifying anywhere in the chat feature — the only strings of that shape this branch adds are the expected values in the tests and the comments explaining why the formatting is not here. |
| 6 | `package.json` bumped to `0.6.0`, lock untouched. | Met | See above. |

## Testing coverage

| Ticket case | Status | Test |
|---|---|---|
| Line renders the package's string with usage and a model | Met | "names the model, the turns and the running total once a turn settles" — asserts the literal `deepseek.v3.2 · 3 turns · ~$0.04 USD (estimated)`, which is the package's output, not a locally recomputed one. |
| No usage → nothing renders, and specifically no `$0.00` | Met | "says nothing at all when there is no usage and no model" — asserts the element itself is absent, then that no `USD` and no `$0.00` appear anywhere. |
| After `clear`, nothing renders | Met | "drops the cost when the chat is cleared" — the line is there after the turn and gone after Clear. |
| `onUsage` pushes on `chatUsage` | Met | main test 1. |
| A superseded turn does not push | Met | main test 2. |
| `chatCapabilities` returns the model when enabled, the disabled shape when not | Met | main tests 3 and 4. |

## Key findings

- [x] **Fixed:** `.chat-usage` is now `white-space: nowrap` with an ellipsis, so the one-line reservation is a guarantee rather than an estimate. **The reserved height only held for summaries that happen to fit on one line.** `min-height: 1.4em` reserves exactly one line, but nothing stopped a long summary from wrapping to two and moving the composer anyway — the precise failure the ticket calls "the worst possible moment to move the input". Realistic strings fit (`us.anthropic.claude-sonnet-4-6 · 128 turns · ~$12.34 USD (estimated)` is ≈415px at `--text-caption` 12px, inside the 560px drawer's 528px content box), but "fits today" is not a reservation. The tail dropped first is `(estimated)`; the model, the turn count and the figure are the load-bearing half and they survive.
- [x] **Fixed:** the "nothing renders" test now asserts the element's absence, not only the absence of its text. **It could have passed against a rendered-but-differently-worded line.** `queryByText(/USD/)` proves the words are gone; it does not prove nothing was rendered. `container.querySelector(".chat-usage")` does, and the clear test got the same treatment.
- [x] **Deviation from the ticket's snippet, deliberate: the conditional `<p>` sits inside a `.chat-usage-line` wrapper.** The ticket asks for both `{summary && <p …>}` and a reserved height, and an element that is not rendered cannot reserve its own. The wrapper is the reservation; the conditional inside it is the ticket's line verbatim. The alternative — always rendering an empty `<p>` — puts an empty paragraph in the accessibility tree and makes "nothing renders" untestable.
- [x] **`App.tsx` is a fifth file, and requirement 3 is inert without it.** The ticket names four files, but `chatCapabilities` only reaches the panel if `ChatProvider` is given `loadCapabilities`. One prop, one destructured member.
- [x] **The `conversationUsage()` paragraph is not implementable against 0.6.0, and no dead code was written for it.** The ticket asks main to call `conversationUsage()` for a restored transcript. Two things block it: `ContextClient` exposes no way to read the conversation id it memoises (`ask` / `startTurn` / `resumeTurn` / `clearConversation` / `capabilities` / `conversationUsage`), and `ChatProvider` has no input that would accept the result — `loadCapabilities` returns `Capabilities`, which carries no usage, and `usage` is only ever set from `onUsage` or reset by `clear`. The renderer never learns a conversation id here, which is the rule the paragraph exists to protect; what is missing is the ability to act on one. Raised as a follow-up rather than half-built. See "Out of scope / follow-ups".
- [x] **Push-versus-reply ordering checked, not a race.** `sendToFocused` fires inside `onUsage` before the `chatAsk` handler returns, and `usageRef` is released in the `finally` that runs on the invoke's reply. Electron carries browser→renderer sends and invoke replies on associated interfaces over the frame's channel, so the push is delivered ahead of the reply and the listener is still parked. Mirroring `onStatus` exactly — which has shipped since TD-054 with the same shape — is also what the ticket asks for, over inventing a differently-lifetimed channel beside it.
- [x] **A superseded turn's spend is not lost, only its snapshot.** The dropped push is a total the server has already accumulated; the next turn's `usage.conversation` includes it. The comment in `chat.ts` says so, because the code alone reads like the money was thrown away.
- [x] **`null` from `capabilities()` is passed through, never folded into `{ chat_enabled: false }`.** A failed fetch is not a report that chat is off, and the disabled shape is only ever synthesised from the local toggle, which is a fact this process actually knows. Covered by a test.
- [x] **No new attack surface.** `chatCapabilities` is a parameterless read that carries no renderer input to the server; `chatUsage` is one-way main → renderer and stays out of the allowlist. No token handling touched.
- [x] **`clear` resets the figure without a round trip.** `ChatProvider.clear` sets the conversation total to zero turns, which `formatUsageSummary` renders as the model alone (or nothing, with no model). No stale four cents survives a Clear — asserted.

## Out of scope / follow-ups

- **A restored transcript shows no total until its next turn settles.** The
  desktop persists the transcript in `sessionStorage` while the conversation id
  lives in main's memory, so a renderer reload restores the turns with
  `usage: null` and recovers the figure only when the next turn lands. Closing
  it needs thunder-chat-core to expose either the conversation id on
  `ContextClient` or an initial-usage input on `ChatProvider`; neither exists in
  0.6.0. Package-side ticket, then a small desktop one.
- **`package-lock.json` is out of step with `package.json` until 0.6.0 is
  published.** `npm ci` will fail on this branch in the meantime. Intentional
  and stated in the ticket's dependency note.

## Overall assessment

The diff is the ticket's shape: one channel, one invoke, one line, and no
formatting logic anywhere in this repo. The `chatStatus` pattern is copied
rather than paralleled — same subscription lifetime, same abort guard, same
ref-forwarding — which is what keeps the two channels from drifting the way
TD-061 warned about. The one deviation from the ticket's literal markup (the
reserving wrapper) exists to satisfy another of its own requirements, and the
one requirement not implemented (`conversationUsage`) is blocked upstream
rather than skipped.
