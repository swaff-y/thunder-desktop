---
extends: feature, bug-fix
when: The task is one of this repo's tickets (an id like TD-NNN, a GitHub issue, or a ticket file), including every /implement run.
---

# A ticket in thunder-desktop

The facts the bundled steps need. Tickets are GitHub issues in `swaff-y/thunder-desktop` on the [Halo board](https://github.com/users/swaff-y/projects/3). The branch is `TD-<n>-short-description` and already exists when work starts; one ticket, one branch (CLAUDE.md). Test gates are `npm run typecheck`, `npm run test`, `npm run lint`. Style skills are `clean-typescript`, `modern-best-practice-react-components`, `modern-accessible-html-jsx`, `use-modern-browser-apis`, `web-security`, `claude-api`. The review lands in `docs/reviews/<branch>.md`.

- **Before** "`how` over the affected subsystem." Spawn the `ticket-parser` agent with the ticket reference and take its brief as the source of truth. Add one todo per acceptance criterion, verbatim. Confirm `git branch --show-current` carries the ticket id; if it does not, stop and ask which branch to use.
- **Before** "Reproduce it yourself on the matching surface" The same ticket-parser brief and branch check as the Feature playbook above.
- **In** "Delegate code-writing to a subagent using your configured feature model" The brief names the style skills above to load before writing, the test gates to run before reporting, the acceptance criteria, and the CLAUDE.md rules for the files it touches. Mirror existing patterns. Edit existing files before creating new ones. No backwards-compatibility shims, no commented-out code.
- **In** "Delegate implementation to a subagent using your configured bug-fix model" The same brief contents as the feature delegate above.
- **In** "Verify on the matching surface." Run every test gate over the whole repo, not only the touched files. A UI change is looked at in the built app through the `run-thunder-desktop` skill in `.claude/skills/run-thunder-desktop/`, which is this repo's driver.
- **In** "Verify on the same surface." The same gates and surface as the Feature step above.
- **Before** "Run **Opening a PR**." Run `/code-review <ticket>`. It writes `docs/reviews/<branch>.md` with the acceptance-criteria table. Fix every open finding and every criterion marked Partial or Missing, re-run the gates, and mark resolved items `[x]`.
