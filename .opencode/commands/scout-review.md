---
description: Finish Scout items waiting in review or testing
subtask: false
---

Load and follow the `scout-manual-workflow` skill.

Mode: finish items in `review` or `testing`.

Goal: finish Scout items that are already in `review` or `testing`: verify the accepted target environment, close passing items to `done`, and fix or return failing items to `in_progress` with evidence.

Arguments: `$ARGUMENTS` is optional hint only: project, item id, deploy target, branch, commit, PR, or scope. Empty arguments mean use `SCOUT_PROJECT_SLUG` or available Scout context.

Use the skill as the source of truth for live queue discovery, canonical deploy path, target-environment verification, failure handling, structured evidence, Russian Scout notes, and status transitions.

Final response: review/testing items checked, moved to `done`, fixed and returned to review/testing/done, blocked, deploy/run evidence, and remaining queue counts.
