---
description: Handle Scout item or queue end-to-end
subtask: false
---

Load and follow the `scout-manual-workflow` skill.

Use `$ARGUMENTS` only as natural-language scope input for the skill. If `$ARGUMENTS` is empty, treat it as "process the entire active Scout queue"; do not treat bare `/scout` as single-next. An explicit Scout item id or URL still scopes to that single item, and an explicit request for the next or one task still scopes to single-next. Do not parse command-specific subcommands or duplicate status rules here.

Finish the selected Scout work according to the skill: choose the correct mode from the arguments and live queue, inspect runtime-error context when relevant, update Scout only with evidence-backed notes/statuses, and report a concise evidence summary with moved items, commits/PRs/deploys if any, blockers, and remaining actionable work. Include queue/status counts only for full-queue or audit mode.
