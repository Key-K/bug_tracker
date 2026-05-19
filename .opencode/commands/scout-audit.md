---
description: Audit finished Scout items
subtask: false
---

Load and follow the `scout-manual-workflow` skill.

Goal: audit completed Scout items with fresh evidence and repair or reopen anything that is not actually accepted.

No arguments are required. If `$ARGUMENTS` is present, treat it only as a hint such as a project, item id, date range, label, priority, or product area.

Required behavior:
1. Treat this as QA/audit mode first: build a durable ledger outside the repo before auditing.
2. Record item id, status, URL/surface, role, scenario, evidence checked, result `pass`/`fail`/`blocked`, Scout action, and next step.
3. Use fresh evidence. Do not treat old Scout notes or old completion evidence as a pass by themselves.
4. For user-visible items, prefer browser evidence of the original acceptance path. For unsafe mutations, verify safe read paths and mark `blocked` when disposable fixtures/access are missing.
5. For failed or unconfirmable completed items, add a Russian QA note with expected/actual behavior, steps, URL, role, and console/network/API evidence, then reopen with `/api/items/reopen` when appropriate.
6. If the fix is safe and belongs to the current repo, repair it through the normal `/scout-one` lifecycle; otherwise leave a precise Scout blocker or create/recommend a separate Scout item.

Final response: audited/pass/fail/blocked/reopened/fixed/new-items counts, item ids, ledger path, and blockers.
