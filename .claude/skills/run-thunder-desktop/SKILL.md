---
name: run-thunder-desktop
description: Build, run, and drive the Thunder Desktop Electron app. Use when asked to start or launch the app, take a screenshot of its UI, click through it, ask the AI chat a question, or confirm a change works in the real app rather than in tests.
---

Electron + React desktop app. An agent drives it through
`.claude/skills/run-thunder-desktop/driver.mjs` — a REPL that launches the
**built** app via Playwright's Electron support and takes `launch` / `ask` /
`ss` / `js` commands on stdin.

Verified on macOS (darwin 25.3, Node 22.12, Electron 39). Not tried on Linux;
it would need `xvfb-run` and the Chromium shared libraries.

## Prerequisites

`playwright-core` is deliberately **not** a dependency of this repo — it is
agent tooling, and adding it would put a browser-automation package in the
app's lockfile. Install it anywhere and point `NODE_PATH` at it:

```bash
mkdir -p /tmp/td-driver && cd /tmp/td-driver && npm init -y >/dev/null && npm i playwright-core
export NODE_PATH=/tmp/td-driver/node_modules
```

The driver `require`s it rather than `import`ing it, because ESM ignores
`NODE_PATH` and CJS resolution honours it. `PLAYWRIGHT_CORE=/abs/path` works
too.

## Build first — always

```bash
npm run build     # typecheck + electron-vite build, ~40s
```

**This is not optional and it is the trap.** `npm run dev` serves the renderer
from Vite and never writes `out/renderer`, so a repo where someone has only
ever run `dev` has a **stale `out/renderer` next to a fresh `out/main`**. The
app launches, the window renders, and features are silently missing — a
two-day-old renderer bundle cost an hour before anyone checked
`ls -l out/renderer/assets`. Confirm the build is current:

```bash
grep -rlo "chat-panel" out/renderer/assets/   # must print a file
```

## Run — the agent path

There is no tmux on this machine. Drive the REPL by appending to a file that
`tail -f` pipes into it:

```bash
cd /Users/kyleswaffield/ruby_sei/thunder-desktop
export NODE_PATH=/tmp/td-driver/node_modules
rm -f /tmp/td-cmds.txt /tmp/td-driver.log && : > /tmp/td-cmds.txt
(tail -f /tmp/td-cmds.txt | node .claude/skills/run-thunder-desktop/driver.mjs \
  > /tmp/td-driver.log 2>&1 &)

echo "launch" >> /tmp/td-cmds.txt
until grep -qa "__DONE__" /tmp/td-driver.log; do sleep 2; done
grep -a "launched" /tmp/td-driver.log
```

Every command prints `__DONE__` when it finishes — poll for that instead of
guessing a `sleep`.

**Never `: > /tmp/td-driver.log` while the driver is running.** Truncating it
does not reset the writer's file offset, so the next write lands at the old
offset and the gap fills with NUL bytes — the log reads as empty or "binary
file matches". Read the tail instead (`grep -a ... | tail -1`).

### Commands

| Command | What it does |
|---|---|
| `launch` | Starts the app, waits for first paint, prints the window list |
| `ss <name>` | Screenshot to `.driver-shots/<name>.png` (gitignored) |
| `text` | `document.body.innerText`, truncated — cheaper than a screenshot |
| `js <expr>` | Evaluates an expression in the renderer, awaited, prints JSON |
| `ask <question>` | Types into the chat composer and submits |
| `settle [seconds]` | Blocks until the in-flight chat turn finishes (default 180) |
| `clicktext <text>` | Clicks the first button/link containing that text — nav items, `Stop`, `Clear` |
| `click <selector>` | Clicks a CSS selector |
| `html [selector]` | `innerHTML`, truncated |
| `transcript` | `sessionStorage.thunder_chat`, including each turn's `action.args` |
| `wait <ms>`, `quit` | |

### A full chat round trip

```bash
echo "ask how many movies are in the catalogue?" >> /tmp/td-cmds.txt
sleep 5
echo "settle 120" >> /tmp/td-cmds.txt
until grep -qa "settled\|TIMED OUT" /tmp/td-driver.log; do sleep 4; done
echo "ss answer" >> /tmp/td-cmds.txt
```

Then **look at the screenshot.** A turn takes 10–60s and hits real Bedrock
through thunder-context, so it costs money and it is not fast.

## Run — the human path

`npm run dev` opens a window against Vite. Useless to an agent (no handle on
it), and it leaves `out/renderer` stale for the next person who launches the
built app. `npm run dev:prod` points at the prod backend instead of dev.

## Gotchas

- **`app.firstWindow()` is the renderer, but it is not the only window.** The
  Browser tab mounts a `<webview>` that Playwright reports as a second window
  (`https://www.google.com/`). Do not iterate windows looking for "the" page.
- **Unpackaged runs use a separate profile.** `<userData>-dev`, i.e.
  `~/Library/Application Support/thunder-desktop-dev/` — settings, auth token
  and window state all live there, not in the packaged app's directory
  (`userdata-seed.ts`). Read that file to check what the app actually stored.
- **The driver cannot log you in.** It reuses whatever session is in the dev
  profile's `thunder-desktop-credentials.enc`. If the app opens on the login
  screen, a human has to sign in once. Do not log out to "test something" —
  you may not be able to get back in.
- **The AI chat is hidden unless `chatEnabled` is true** in the dev profile's
  `thunder-desktop-settings.json`. There is no `#chat-question` to type into
  otherwise, and `ask` will tell you so.
- **React owns every text input.** Setting `el.value` is discarded on the next
  render; the native value setter plus a bubbling `input` event is what
  registers. `ask` does this — copy it for any other field.
- **Answers are markdown, and are rendered** (TD-067). `**4 movies**` comes out
  bold, and a pipe table comes out as a `<table>` — assert on
  `.chat-md strong` / `.chat-md table`, not on the raw text. Literal `**` or
  `|---|` visible in the transcript **is** a bug now; it was expected before
  TD-067.
- **The action card belongs to the newest turn only.** A follow-up answered
  from conversation history makes no tool call, so its card is absent — that is
  correct, not a regression.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `ERR_MODULE_NOT_FOUND: playwright-core` | `NODE_PATH` unset, or set after the driver started. Export it in the same shell that launches the driver. |
| Log looks empty, `grep` says "binary file matches" | You truncated `/tmp/td-driver.log` while the driver held it open. Kill the driver, delete the log, restart. |
| App launches but a feature is missing from the DOM | Stale `out/renderer`. Run `npm run build` and check the `grep -rlo "chat-panel"` probe above. |
| `ERROR: no #chat-question` | `chatEnabled` is false in the dev profile, or the app is not on Home. |
| Chat answers `unauthorized` | The stored Halo token expired. A human has to sign in again. |
| A second driver launches a second app instance | `pkill -f "tail -f /tmp/td-cmds.txt"` and `pkill -f driver.mjs` before restarting. |

## Tests

```bash
npm run test        # vitest, 433 examples across main + renderer
npm run typecheck   # tsc for the node and web projects
npm run lint        # eslint; two pre-existing errors are expected
```

The suite is the sanity check, not the proof — chat, IPC and the context-server
client are only exercised for real by driving the app.
