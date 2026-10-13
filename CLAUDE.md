# CLAUDE.md

Desktop-first (Electron + React) app.

Desktop app: [halo-desktop](~/ruby_sei/halo-desktop/) Electron + React app.

The API app: [halo](~/ruby_sei/halo/) Ruby aws cloud app.

Keep your replies extremely concise and to the point. If you need to ask clarifying questions, do so in a single sentence. Do not provide any additional information or context beyond what is necessary to answer the question or address the issue at hand.

Don't drift off-topic. Stay focused on the specific question or issue being discussed. If you need to provide additional context, do so in a single sentence and then return to the main topic.

Keep to the ticket scope. If the ticket is about a specific feature or bug, try keep edits and discussions focused on that feature or bug. But if you notice something else that is out of scope and important to the overall project, feel free to create a new ticket for it and then return to the original ticket.

This file provides guidance to claude code (claude.ai/code) when working with code in this repository.

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
