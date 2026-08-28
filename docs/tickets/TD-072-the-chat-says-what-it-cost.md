# TD-072 — AI chat: the chat says what it cost

## Description

Show, in the chat panel, what the open conversation has cost to run and which
model ran it.

One line, above the composer:

> `deepseek.v3.2` · 3 turns · ~$0.041 USD (estimated)

**That figure is the session total** — everything the open chat has accumulated,
rising with each turn and resetting when the chat is cleared — not the cost of
the last answer.

**Almost none of this is here.** thunder-context
[TC-027](https://github.com/swaff-y/thunder-context/blob/main/docs/tickets/TC-027-what-a-turn-cost-and-what-the-chat-has-cost.md)
counts the tokens, prices them and keeps the conversation total;
`@swaff-y/thunder-chat-core` TCC-008 owns the types, the transport, the store
field and **the formatted string**. This ticket is one IPC channel, one fetch
and one line of markup. If you find yourself deciding how many decimal places a
sub-cent number deserves, or whether to write `$` or `USD`, it is already
decided upstream — call `formatUsageSummary`.

Depends on: TC-027 deployed, and `@swaff-y/thunder-chat-core@0.6.0` published.

## Requirements

### The plumbing

The desktop is the awkward one: it polls in the **main** process, so the usage
never reaches the renderer on its own. Four files, mirroring how `chatStatus`
already works — that channel is the pattern to copy, not to invent beside.

1. `src/preload/thunder-api.ts` — a `chatUsage` push channel beside
   `chatStatus` (`thunder:chat:usage`), and `chatCapabilities` in the invokable
   list. `chatStatus` is deliberately excluded from the invokable channels list
   and `chatUsage` belongs in the same exclusion for the same reason: it is
   pushed, never called.
2. `src/main/ipc/chat.ts` — pass `onUsage` to `context.ask`, guarded by
   `controller.signal.aborted` exactly as `onStatus` is, and push it with
   `sendToFocused`. **A superseded turn must not report its usage**, for the
   same reason it must not drive the spinner — but note the difference: a
   superseded turn *did* spend the tokens, and the server has already counted
   them into the conversation total. The next turn's `usage.conversation` will
   include them. Dropping the push is dropping a stale snapshot, not dropping
   the money.
3. `src/main/ipc/chat.ts` — a `chatCapabilities` handler returning the
   `Capabilities` from the new transport call, so the panel can name the model
   on an empty chat. Return the disabled shape when `chatEnabled` is false, the
   same as `chatAsk` does.
4. `src/renderer/src/hooks/useChatBridge.ts` — subscribe to `chatUsage` the way
   it already subscribes to `onStatus`, and pass `onUsage` through the
   `lifecycle` argument of `ChatSend`. The bridge's `send` currently ignores
   `_lifecycle`; it stops ignoring it.

The main process holds the conversation id, so `conversationUsage()` for a
restored transcript is main's call to make, not the renderer's. Fetch it in the
`chatCapabilities` handler's response or in its own handler — either is fine,
but the renderer must not learn the conversation id in order to do it.

### The line

`src/renderer/src/components/chat/ChatPanel.tsx`, between the `role="status"`
live region and the `chat-composer` form.

```tsx
{summary && <p className="chat-usage">{summary}</p>}
```

- `summary` is `formatUsageSummary(usage, model)` from the package. **No string
  building here.** No `toFixed`, no `$`, no "estimated" — all three are TCC-008's
  and all three are wrong if this file has its own copy.
- `null` renders nothing. An older server, a failed capabilities fetch and a
  chat that has not run a turn are all "we do not know", and a `$0.00` in place
  of that reads as *free*.
- It is **not** an `aria-live` region. The cost changes on every turn and a
  screen reader announcing a new dollar figure after every answer is noise on
  top of the answer. The existing `role="status"` element stays exactly as it
  is; this line is ordinary content that a reader reaches on its own.
- Styling: quiet. Same treatment as `chat-tool-name`'s muted register — this is
  a footnote about the session, not a control. It must not shift the composer's
  position when it appears, because it appears for the first time the instant
  the first answer lands, which is the worst possible moment to move the input
  the user is about to type in. Reserve the line's height.

### Where it is not

The header. `chat-header` holds the clear button — it is the controls row, and
a number that is read at rest does not belong among things that are clicked.
Above the composer it sits at the bottom of the reading order, which is where a
running total belongs.

## Testing

`src/renderer/src/components/chat/__tests__/ChatPanel.test.tsx`:

- With usage and a model, the line renders the package's string. Assert on the
  rendered text, not on a locally recomputed one.
- With no usage, nothing renders — and specifically **no `$0.00`**.
- After `clear`, nothing renders. This is the bug a user would notice: clearing
  the chat and still being told it cost four cents.

`src/main/ipc/__tests__/chat.test.ts`:

- `onUsage` pushes on `chatUsage`.
- A superseded turn does not push.
- `chatCapabilities` returns the model when chat is enabled, and the disabled
  shape when it is not.

## Dependencies

- `package.json`: `@swaff-y/thunder-chat-core` `0.5.0` → `0.6.0`, pinned exact
  as the other two clients pin it.

## Out of scope

Per-turn cost on each answer — the ask is the conversation total, and a dollar
figure under every reply is noise. Any total across conversations; neither this
app nor the server has one. Budgets, warnings, or a settings toggle to hide the
line. Changing what the number means — that argument is TC-027's and it is
settled there.
