---
description: Handle Scout item or queue end-to-end
subtask: false
---

Load and follow the `scout-manual-workflow` skill.

Natural-language scope input for the skill, if any:

$ARGUMENTS

Always operate as a responsible maintainer with maintainer-level ownership. Scope text may narrow which Scout item or queue to handle, but it must not reduce autonomy, make the agent conservative, or create a different behavior profile. If no text was provided, follow the skill's default scope selection. Do not duplicate scope or status rules in this command; the skill is the source of truth.

Finish the selected Scout work according to the skill: choose the correct scope from the arguments and live queue, inspect runtime-error context when relevant, update Scout only with evidence-backed notes/statuses, and report a concise evidence summary with moved items, commits/PRs/deploys if any, blockers, and remaining actionable work. Include queue/status counts only for full-queue or audit scope.
