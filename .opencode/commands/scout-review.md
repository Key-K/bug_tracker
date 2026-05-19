---
description: Finish Scout items waiting in review
subtask: false
---

Load and follow the `scout-manual-workflow` skill.

Goal: finish Scout items that are already in `review`: verify the accepted target environment, close passing items to `done`, and fix or reopen failing items with evidence.

No arguments are required. If `$ARGUMENTS` is present, treat it only as a hint such as a project, item id, deploy target, branch, commit, or PR.

Required behavior:
1. Discover the review queue from live Scout state. If the user named specific items, limit scope to those items.
2. Fetch each full item with notes, evidence, branch/PR, related items, and acceptance hints before testing.
3. If deploy is needed, use only the repository's canonical deploy path and wait for required health checks. Do not invent manual deploy fallbacks.
4. Verify item-specific acceptance on the target environment. Browser evidence is required for user-visible work when feasible.
5. For passing items, add structured target-environment evidence and a concise Russian completion note, then resolve to `done`.
6. For failing items, add a Russian failure note with repro evidence, move `review -> in_progress`, and fix end-to-end when safe in the current repo.
7. For blocked verification, keep the honest status and record the exact missing access/fixture/decision.

Final response: review items checked, moved to `done`, fixed and returned to review/done, blocked, deploy/run evidence, and remaining queue counts.
