---
description: Finish Scout work systemically
subtask: false
---

Load and follow the `scout-manual-workflow` skill.

Mode selection is agent-owned:
- If `$ARGUMENTS` contains a Scout item id or item URL, handle that item end-to-end and include only evidence-backed related items that share the root cause.
- If `$ARGUMENTS` is empty or not an item id/URL, process the full active Scout queue in scope until no actionable work can be honestly moved further.
- If `$ARGUMENTS` or the selected item mentions runtime errors, error groups, Grafana, Tempo, trace ids, request ids, fingerprints, or linked runtime errors, inspect that runtime context through the skill before changing code or status.
- Audit `done` items only when the user's natural-language request explicitly asks to recheck completed/closed/done work.

Default goal: finish active Scout work systemically, not cosmetically. Inspect `testing`, `review`, `in_progress`, `new`, and actionable `note` items; build the readiness matrix internally; choose the correct next lifecycle action; process one item or evidence-backed shared-root cluster at a time; create focused commits required for handoff, push the relevant branch when repo workflow allows, deploy to staging through the canonical path when available, run staging acceptance checks when safe, and move each item only to the furthest honest status supported by item-specific evidence.

Status rules:
- `new`/actionable `note` -> `in_progress` only when active work starts.
- `in_progress` -> `review` only after implementation, checks, browser/runtime verification when relevant, focused commit/PR reference, Russian handoff note, and structured evidence with `result`, `level`, `coverage`, `acceptanceScope`, and commit/PR reference; prefer continuing through push, staging deploy, and staging verification before stopping at `review` when that path is available and safe.
- `review`/`testing` -> `done` only after target-environment, staging, production, or explicit user acceptance with fresh per-item evidence.
- After local completion, prefer `commit -> push -> staging deploy -> staging verification` before final handoff; if any step is unavailable, unsafe, or fails, record the exact blocker/failure and use the furthest honest status.
- Weak, failing, stale, generic, route-sweep-only, or cluster-only evidence keeps or returns the item to `in_progress` with a clear Russian blocker/failure note.
- `testing` is only for active target-environment verification, never parking.
- `cancelled` is only for duplicate/out-of-scope/invalid/obsolete items with a reason note.

Boundaries:
- Do not claim the whole queue at once.
- Do not push if repo policy forbids it, the branch target is unsafe, credentials are missing, or the target is a protected production branch.
- Do not deploy if repo policy forbids it, credentials are missing, the target is production, or the canonical staging path is absent or failing.
- Do not push protected production branches or deploy production unless repo workflow and the user's request explicitly allow it.
- Do not mark `done` just because code changed, checks passed, or deploy succeeded.
- Do not expose secrets in chat, Scout notes, evidence, commits, or docs.
- Do not paste raw private runtime payloads, secret-bearing Grafana URLs, cookies, tokens, or auth headers from error evidence into Scout notes or final output.

Final response: concise evidence summary, final queue/status counts, items moved with statuses, commits/PRs/deploys if any, exact blockers, and whether actionable work remains.
