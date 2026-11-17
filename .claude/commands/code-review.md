---
description: Review the current branch against main with pstack's thermos audit plus this repo's own hazards, and write docs/reviews/<branch>.md
argument-hint: [TD-NNN | #issue | ticket path]
allowed-tools: Bash(git branch:*), Bash(git diff:*)
---

Base branch: `main`
Review branch: !`git branch --show-current`
Review path: `docs/reviews/`!`git branch --show-current`.md
Ticket: `$1`

## Task

1. If `$1` is given, spawn the `ticket-parser` agent with it and take its brief as the acceptance criteria to check. If it is empty, review without a ticket and say so in the file.
2. If the branch is `main`, stop and ask for a feature branch.
3. The diff under review is `git diff main...HEAD`. Keep it out of this thread: the subagents below read it.
4. Invoke the `pstack:thermos` skill over the diff. It runs the bug/security and code-quality review subagents in parallel and synthesises their findings. Carry every surviving finding into Key findings with its severity.
5. Spawn one `pstack:poteto-agent` reviewer (run in the background) with the review path, the ticket brief, and this file's remaining steps. It loads these skills and applies them to the diff:
   - `clean-typescript`
   - `modern-best-practice-react-components`
   - `modern-accessible-html-jsx`
   - `use-modern-browser-apis`
   - `web-security`
   then checks this repo's own hazards. A review that only covers general code quality has not reviewed this repo:
   - The IPC boundary: tokens and the keychain live in main; the renderer reaches them only through `window.api` from preload. An Electron API in the renderer is a finding.
   - AI chat lives in `@swaff-y/thunder-chat-core` and thunder-context, not here. Chat logic reappearing in this repo is a regression of the TC migration.
   - Patterns: the mock-mode fixtures under `src/renderer/src/mocks/`, the existing TanStack Query hooks, the existing form and modal components.
   It writes the review to the review path in the format below and returns only the path and a one-paragraph summary.
6. Merge the thermos findings into the file's Key findings, then report the path and the summary. When `/implement` calls this command, the fix-up pass that follows is its step, not this one's.

## Review format

Write the review path with the Write tool (create or overwrite) as markdown with:

- Ticket (id and source, with a one-line summary of what it asks for, or "no ticket provided").
- Summary of changes.
- Acceptance criteria coverage, required when a ticket is given, as a table with one row per criterion:

  | # | Acceptance criterion | Status | Evidence (file:line / notes) |
  |---|----------------------|--------|------------------------------|
  | 1 | <verbatim AC text>   | Met / Partial / Missing | <where the diff satisfies it, or what is missing> |

  Every criterion appears as its own row, never collapsed or summarised.
- Key findings, each with a severity and a file:line, as checkboxes: `[ ]` open, `[x]` fixed.
- Overall assessment.
