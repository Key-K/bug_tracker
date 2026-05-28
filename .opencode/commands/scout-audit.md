---
description: Audit finished Scout items
subtask: false
---

Load and follow the `scout-manual-workflow` skill.

Mode: audit completed Scout items.

Goal: audit completed Scout items with fresh evidence and repair or reopen anything that is not actually accepted.

Arguments: `$ARGUMENTS` is optional hint only: project, item id, date range, label, priority, or product area. Empty arguments mean use `SCOUT_PROJECT_SLUG` or available Scout context.

Use the skill as the source of truth for audit ledger, fresh evidence levels, browser/API safety, pass/fail/blocked classification, Russian QA notes, reopen/repair behavior, and final counts.

Final response: audited/pass/fail/blocked/reopened/fixed/new-items counts, item ids, ledger path, and blockers.
