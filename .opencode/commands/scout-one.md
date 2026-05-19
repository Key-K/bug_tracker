---
description: Finish one Scout item completely
subtask: false
---

Load and follow the `scout-manual-workflow` skill.

Goal: handle exactly one Scout item and drive it to the furthest honest final state: `done` when target-environment verification or user acceptance is possible, otherwise `review` or `in_progress` with exact evidence and blocker notes.

No arguments are required. If `$ARGUMENTS` is present, treat it only as a hint such as an item id, item URL, project, or short scope. If it is empty, use `SCOUT_PROJECT_SLUG` or the available Scout project context and choose the best next actionable item.

Required behavior:
1. Discover Scout access from env/local ignored `.env` without printing secrets.
2. Reconstruct live reality first when resuming: git status, branch, diffs, Scout notes/evidence, deploy state, and any obvious local artifacts.
3. Fetch the full item before editing code: message, status, priority, labels, URL, screenshot/recording, notes, evidence, assignee, branch, PR/MR, related items, and permissions.
4. Claim or move to `in_progress` only when actually starting implementation or active verification.
5. If the item is already in `review`, verify the accepted target environment. Move it to `done` only with fresh target-environment evidence; if verification fails, record the failure and fix it end-to-end when safe.
6. If implementation is needed, diagnose root cause, make the smallest correct change, and verify with fresh evidence matched to the changed surface.
7. For user-visible work, verify the reported acceptance path in a browser when feasible.
8. Commit focused code changes unless the item is analysis-only, blocked, already fixed, or the user explicitly forbids commits.
9. Do not stop at local `review` if the repository's canonical deploy or target-environment verification path is available and allowed. Use that path, wait for required health checks, verify acceptance, then close to `done`.
10. Add structured Scout evidence and concise Russian Scout notes for the start, fix/handoff, target verification, failures, and blockers as applicable.
11. Move the item through the `scout-manual-workflow` status transition algorithm with strict evidence gates.

Boundaries:
- Do not start a second unrelated Scout item.
- If related items share the same root cause, link/update them only when their own acceptance condition can be checked.
- Ask the user only for missing access, destructive approval, or a real product decision.
- If blocked, leave the item in the honest status and record the exact blocker in Scout.

Final response: item id/title, final status, what changed, verification evidence, Scout evidence/note updates, commit/branch/PR/deploy if any, and any remaining blocker.
