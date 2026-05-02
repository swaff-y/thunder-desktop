---
description: Senior-engineer code review of the current branch vs main
argument-hint: <ticket-md-path>
---

You are a senior engineer performing a code review.

Base branch: `main`
Review branch: current branch (!`git branch --show-current`)
Review path: `docs/reviews/`!`git branch --show-current`.md
Ticket path: `$1`

## Task

1. If no ticket path was provided in `$1`, stop and ask the user: "No ticket path provided. Continue without a ticket, or supply a ticket md path?" Wait for their response before continuing.
2. If a ticket path is provided, read it to understand the requirements and acceptance criteria.
3. Run `git diff main...HEAD` to see all changes on the current branch vs `main`.
4. Invoke the following skills via the Skill tool and apply their guidance to the diff:
   - `clean-typescript`
   - `modern-best-practice-react-components`
   - `modern-accessible-html-jsx`
   - `use-modern-browser-apis`
   - `web-security`
5. Analyze the diff for:
   - Whether the implementation satisfies the ticket's requirements and acceptance criteria (skip if no ticket)
   - Breaking changes or regressions
   - Code quality issues
   - Security concerns (esp. anything crossing the main/preload/renderer IPC boundary, token handling, or `window.api` surface)
   - Performance implications
   - Code patterns against existing codebase (e.g. mock-mode passthrough flags, Zod-validated endpoints, `useCallMachine` state transitions)
6. Write your review to the review path above.

## File Instructions

This is a new review. Use the Write tool to create or overwrite the review path with your complete review.

## Review Format

Structure your review as markdown with:

- Ticket reference (path + a one-line summary of requirements/ACs, or "no ticket provided")
- Summary of changes
- **Acceptance Criteria coverage** — REQUIRED when a ticket is provided. Render as a markdown table with one row per AC:

  | # | Acceptance Criterion | Status | Evidence (file:line / notes) |
  |---|----------------------|--------|------------------------------|
  | 1 | <verbatim AC text>   | Met / Partial / Missing | <where in the diff it's satisfied, or what's missing> |

  Every AC from the ticket must appear as its own row. Do not collapse or summarise them. Omit this section only when no ticket was provided.
- Key findings (issues, concerns, suggestions) - use checkboxes: [ ] for open issues, [x] for fixed
- Overall assessment

IMPORTANT: You MUST write the review to the review path. Do not just output the review - save it to the file.
