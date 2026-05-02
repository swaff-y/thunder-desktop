---
description: Implement a ticket end-to-end, then self-review and fix
argument-hint: <ticket-md-path>
---

You are a senior engineer implementing a ticket.

Ticket path: `$1`
Current branch: !`git branch --show-current`

## Task

1. **Validate input.** If no ticket path was provided in `$1`, stop and ask the user: "No ticket path provided. Please supply a ticket md path." Wait for their response before continuing.

2. **Parse the ticket.** Spawn the `ticket-parser` subagent (`subagent_type: ticket-parser`) with the ticket path `$1`. It returns a structured brief (verbatim ACs, requirements, non-goals, file/symbol mentions, open questions). Use that brief as the source of truth — do not re-read the ticket inline unless the brief is clearly missing something.

3. **Plan the implementation.** Run the following in parallel (single message, multiple tool calls) before writing any code:

   - **Explore subagent** (`subagent_type: Explore`, `model: sonnet`) — locate every file likely to change. Prompt should name the ticket scope and ask for "files to edit + relevant existing patterns to mirror." Sonnet is sufficient for grep/read work. Keep in mind this repo's three-process Electron split: `src/main/`, `src/preload/`, `src/renderer/src/` — surface which process(es) the change touches.
   - **DocsExplorer subagent** (`subagent_type: DocsExplorer`, `model: sonnet`) — only if the ticket touches a third-party library / SDK / API (Twilio Voice JS SDK, Electron APIs, AWS Cognito / Amplify, TanStack React Query, Axios, Zod, electron-vite, etc.). Skip otherwise.
   - **Plan subagent** (`subagent_type: Plan`, `model: sonnet`) — for non-trivial tickets only. Pass the ticket text + ACs and ask for a step-by-step implementation plan. Skip for one-file changes.

   Synthesise the returned context into a short internal plan. Use TodoWrite to record one todo per AC.

4. **Cross-repo check.** If the ticket is split-scope (work in this repo *and* a sibling repo like [business-call-api](~/ruby_sei/business-call-api/) or [artemis-mobile](~/ruby_sei/artemis-mobile/)), implement only the desktop half here and create a mirror ticket in the sibling repo's `docs/tickets/` for the other half. Do not edit the sibling repo directly.

5. **Clarify only if blocked.** Ask the user clarifications **only if** something is genuinely ambiguous and would change the implementation. Bundle all questions into a single message — do not drip-feed. If the ticket is clear, skip this step entirely.

6. **Implement.** Strictly within the scope of the ACs and requirements:

   - Before writing code, invoke the relevant style skills via the Skill tool so guidance is loaded up-front (cheaper than fixing later):
     - `clean-typescript` (always)
     - `modern-best-practice-react-components` (if touching renderer React components)
     - `modern-accessible-html-jsx` (if touching JSX markup)
     - `use-modern-browser-apis` (if touching renderer-side browser APIs)
     - `web-security` (if handling auth, tokens, IPC payloads, user input, network)
     - `claude-api` (if touching `@anthropic-ai/sdk` code paths, e.g. transcript insights)
   - Honour the IPC boundary: sensitive data (tokens, keychain) lives in main; renderer only talks via `window.api` exposed by preload. Don't leak Electron APIs into the renderer.
   - Edit existing files in preference to creating new ones.
   - Mark each AC's todo `completed` as soon as it's done; don't batch.
   - No refactors, no scope creep, no speculative error handling, no comments explaining what code does. If you spot something out-of-scope but important, write it down for step 10 — do **not** fix it.

7. **Surface blockers immediately.** During implementation, if you hit a blocker, surprise, or a scope clarification, tell the user right away — don't silently work around it.

8. **Pre-review pass.** Invoke the `simplify` skill via the Skill tool against your changes. Apply its in-scope feedback before kicking off the review (cheaper than a full review round-trip catching it).

9. **Code review (in a subagent).** Spawn a `general-purpose` subagent with `model: sonnet` whose job is to run the `/code-review` flow:

   - Pass the ticket path `$1` and instruct it to follow the `code-review` skill's procedure: diff `main...HEAD`, apply `clean-typescript` / `modern-best-practice-react-components` / `use-modern-browser-apis` / `modern-accessible-html-jsx` / `web-security`, write the review file to `docs/reviews/<branch>.md`.
   - Ask it to return only: the review file path + a one-paragraph summary. The full review must NOT come back inline — it lives in the file.
   - Running this in a subagent keeps the diff and skill output out of the main context. Sonnet is sufficient for checklist-style review.

10. **Fix-up pass (back on the main thread, Opus).** Read the review file and act on it:

    - Fix every `[ ]` item in **Key findings**.
    - Address every AC marked `Partial` or `Missing`.
    - Apply in-scope suggestions; defer out-of-scope ones.
    - Update the review file to mark resolved items as `[x]`.

11. **Verify.** Run `npm run typecheck` and `npm run test` (and `npm run lint` if the ticket touched many files). Fix any failures introduced by the change before reporting.

12. **Report.** Final message to the user must include:
    - What was implemented (one-line per AC).
    - What review issues were fixed.
    - Any mirror ticket created in a sibling repo (path).
    - Out-of-scope items worth a follow-up ticket (so the user can decide).
    - Do **not** commit or push — leave that to the user.

## Scope discipline

- Stick to the ticket. A bug fix doesn't need surrounding cleanup; a feature doesn't need a new abstraction.
- No backwards-compatibility shims, no commented-out code, no "removed for X" notes.
- If the ticket is small, the response should be small. Don't pad.

## Token budget guidance

- Subagents in step 3 and step 9 use Sonnet by default — only escalate to Opus if Sonnet's output is visibly thin.
- Implementation (step 6) and fix-up (step 10) stay on the main thread (Opus) because judgement matters there.
- Never run `/code-review` inline on the main thread — always via the step 9 subagent. The diff + 5 skills will otherwise blow out context.
