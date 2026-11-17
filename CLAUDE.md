# CLAUDE.md

Thunder Desktop is an Electron + React desktop app. Its siblings are [halo-desktop](~/ruby_sei/halo-desktop/), the other Electron client, and [halo](~/ruby_sei/halo/), the Ruby API on AWS that both talk to. AI chat comes from [thunder-chat-core](~/ruby_sei/thunder-chat-core/) and [thunder-context](~/ruby_sei/thunder-context/); the chat logic does not live here.

## Ticketing

Tickets are GitHub issues in `swaff-y/thunder-desktop`, on the `Halo` project
board. Raise new work there, and read one with `gh issue view <n>`.

The `TD-NNN` id lives in the issue title rather than the number — TD-093 is
issue #178 — so `gh issue list --search "TD-093" --state all` is how you resolve
the `TD-NNN` ids that source comments and review notes cite throughout. Branches
carry the id (`TD-093-refresh-token-replaces-password`) and the PR closes the
issue. [#179](https://github.com/swaff-y/thunder-desktop/issues/179) indexes
every ticket by phase.

A ticket is focused on one feature or bug and carries a clear description,
requirements, acceptance criteria and a test plan —
[TD-033](https://github.com/swaff-y/thunder-desktop/issues/118) is the example
to follow.

## Agent workflow

pstack is installed. A task that touches more than one file runs through the `pstack:poteto-mode` skill. The project playbooks in `.agents/playbooks/` add this repo's rules to its Feature, Bug fix and Opening a PR steps, and `/implement` checks them against the installed pstack before each run.

- `/implement <TD-NNN | #issue | ticket path>` implements a ticket through poteto-mode and finishes with `/code-review`.
- `/code-review [ticket]` audits the branch against `main` with `pstack:thermos` plus this repo's own hazards, and writes `docs/reviews/<branch>.md` with the acceptance-criteria table.
- The `ticket-parser` agent turns a ticket reference (TD-NNN, #issue, ticket path) into a brief with verbatim acceptance criteria.
- Style skills: `clean-typescript`, `modern-best-practice-react-components`, `modern-accessible-html-jsx`, `use-modern-browser-apis`, `web-security`, `claude-api`. Load the ones the change touches before writing.
- Gates before review: `npm run typecheck`, `npm run test`, `npm run lint`.
- A UI change is looked at in the built app through the `run-thunder-desktop` skill in `.claude/skills/run-thunder-desktop/`, which is this repo's driver.
- Commit subjects and the PR title are `TD-<n>: subject`. The body ends with `Closes #<issue-number>`. Commit on the ticket branch; push and open the PR only when asked.

## Working style

Keep replies concise. Ask a clarifying question in one sentence, and only when the answer changes the work. Keep to the ticket's scope: work that is out of scope but matters becomes a new ticket, then return to the original.
