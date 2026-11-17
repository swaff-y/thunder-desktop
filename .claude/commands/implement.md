---
description: Implement a ticket end-to-end through pstack's poteto-mode with this repo's playbook, then review and fix
argument-hint: <TD-NNN | #issue | ticket path>
allowed-tools: Bash(git branch:*), Bash(node:*)
---

Ticket: `$1`
Branch: !`git branch --show-current`
Project playbooks against the installed pstack: !`node "$(ls -d ~/.claude/plugins/cache/pstack-claude/pstack/*/ | sort -V | tail -1)skills/poteto-mode/scripts/check-playbooks.mjs" .`

Implement the ticket through pstack. Invoke the `pstack:poteto-mode` skill now, then:

1. If `$1` is empty, stop and ask for a ticket (TD-NNN | #issue | ticket path).
2. If the playbook check above printed a problem, report each line to the user and do not guess where an unanchored change belongs.
3. Match the playbook: Feature for new or changed behaviour, Bug fix for a defect. The project playbooks `.agents/playbooks/ticket.md` and `.agents/playbooks/opening-a-pr.md` apply. Copy the bundled steps into the todolist verbatim and apply each project change at the step it names.
4. Finish per the playbook. The report names what was implemented per acceptance criterion, what `/code-review` found and what was fixed, out-of-scope work worth its own ticket, and the state of the branch.
