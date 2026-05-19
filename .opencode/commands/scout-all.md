---
description: Finish all actionable Scout items
subtask: false
---

Load and follow the `scout-manual-workflow` skill.

Goal: process all actionable Scout items in scope until they are `done`, honestly blocked, or waiting in `review` only because target-environment verification is not available or not allowed.

No arguments are required. If `$ARGUMENTS` is present, treat it only as a scope hint such as a project, label, priority, release target, or item set. If it is empty, use `SCOUT_PROJECT_SLUG` or the available Scout project context.

Required behavior:
1. Discover Scout access from env/local ignored `.env` without printing secrets.
2. Build the live queue from Scout, not stale notes: include `new`, `in_progress`, and `review` items unless `$ARGUMENTS` narrows the scope.
3. Create a resume-safe ledger outside the repo and update it after each item with item id, starting status, action, evidence, resulting status, commit/PR, blockers, and next step.
4. Work one item at a time through the same complete lifecycle as `/scout-one`; for items already in `review`, verify the target environment before moving to `done` or return failing items to `in_progress` with evidence and fix when safe.
5. Keep status semantics strict: local verified commits go to `review`; `done` requires accepted or target-environment verification evidence.
6. Do not stop after local commits if the repository's canonical deploy or target-environment verification path is available and allowed. Use that path, wait for required health checks, verify acceptance, and close passing items to `done`.
7. Deploy only through the repository's canonical deploy path and only when the repo/user workflow allows it. If target verification is not available or not allowed, leave locally completed work in `review` with evidence and an exact next-step note.
8. For browser/user-visible work, verify acceptance paths in a browser. For backend/data work, include targeted API/DB/read-model evidence where relevant.
9. Stop only for missing access, destructive approval, or product decisions that cannot be inferred safely. Record each blocker in Scout before moving on.

Final response: starting counts, final counts, items completed/reviewed/blocked/cancelled, commits/PRs/deploys, ledger path, verification summary, and exact remaining blockers if any.
