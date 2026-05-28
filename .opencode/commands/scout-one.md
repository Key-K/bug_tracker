---
description: Finish one Scout item completely
subtask: false
---

Load and follow the `scout-manual-workflow` skill.

Mode: one Scout item.

Goal: handle exactly one Scout item and drive it to the furthest honest final state: `done` when target-environment verification or user acceptance is possible, otherwise `review`, `testing`, or `in_progress` with exact evidence and blocker notes.

Arguments: `$ARGUMENTS` is optional hint only: item id, item URL, project, or short scope. Empty arguments mean use `SCOUT_PROJECT_SLUG` or available Scout context and choose the best next actionable item.

Use the skill as the source of truth for intake, related-item checks, implementation, verification, commit/deploy decisions, structured evidence, Russian Scout notes, and status transitions.

Boundaries:
- Do not start a second unrelated Scout item.
- If related items share the same root cause, link/update them only when their own acceptance condition can be checked.

Final response: item id/title, final status, what changed, verification evidence, Scout evidence/note updates, commit/branch/PR/deploy if any, and any remaining blocker.
