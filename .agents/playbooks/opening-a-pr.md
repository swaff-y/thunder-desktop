---
extends: opening-a-pr
when: Any commit, PR title or PR body in this repo.
---

# Commits and PRs in thunder-desktop

- **In** "Work from a git worktree off main." The ticket branch (`TD-<n>-...`) already exists. Work on it and give delegates worktrees off it. Never a second branch carrying the same number (CLAUDE.md, one ticket one branch).
- **Replace** "Conventional Commits `type(scope): subject`, no trailing period." Commit subjects and the PR title are `TD-<n>: subject`, imperative, no trailing period, the id taken from the branch (for example `TD-097: saving a movie onto a webscene record`).
- **In** "The PR body is a one-minute briefing" End the body with `Closes #<issue-number>`, the GitHub issue number rather than the ticket id. The board card is set by hand: `In progress` while the branch is open, `Closed` when the PR merges (CLAUDE.md).
- **Before** "Resolve the forge before the first PR operation" Stop here unless the user asked for a PR in this session. Leave the commits on the ticket branch, unpushed, and report the branch and the review file. The user pushes and opens the PR, or asks you to continue.
