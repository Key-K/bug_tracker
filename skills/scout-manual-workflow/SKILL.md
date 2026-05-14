---
name: scout-manual-workflow
description: Use when the user asks to take a bug, defect, improvement, or task from Scout and handle it manually like a professional engineer working from a bug tracker. Also use for short commands like "do the next Scout task", "сделай следующую задачу из Скаута", or "возьми задачу из Scout".
---

# Scout Manual Workflow

## Role

Act like a senior engineer taking ownership of a bug-tracker item. Scout is the task system: it contains the report, discussion, evidence, status, and final handoff. The local repository is where the actual engineering work happens.

This is not a daemon workflow. Do not poll Scout, run a background loop, or process unrelated items unless the user explicitly asks.

## Operating Principles

- Treat the Scout item as the contract, but verify the real behavior before changing code.
- Own the item end-to-end: triage, reproduce, diagnose, fix, verify, communicate, and hand off.
- Treat the user as the reviewer/approver, not the workflow operator. Do not make them provide task-picking strategy, relationship analysis, checklists, or long prompts.
- Short user commands such as "сделай следующую задачу из Скаута" are complete instructions: choose the best next actionable Scout item and execute the full workflow autonomously.
- Do not require the user to spell out prioritization, verification, or Scout update rules; apply this skill's workflow by default.
- Keep scope tight. Fix the reported bug or requested improvement, not nearby problems.
- Prefer evidence over assumptions: URL, screenshot, recording, selector, logs, API payloads, repo behavior, and tests.
- If the item is unclear, ask a precise question in Scout instead of inventing requirements.
- Keep Scout updated at meaningful milestones, not with noisy step logs.
- Preserve all existing local and repo-specific rules, especially `AGENTS.md`, test/build commands, design system rules, and deployment safety rules.

## Autonomy Boundary

Handle routine engineering decisions without asking the user:

- choose the next actionable item when no item id is provided;
- classify and prioritize the item;
- decide whether to claim it now or leave it with a question/blocker;
- search for duplicates, related items, blockers, conflicts, and shared root causes;
- create evidence-backed Scout links and notes;
- choose the minimal code path, tests, runtime checks, and browser checks;
- update Scout status when the Definition of Done supports it.

Ask the user only for real blockers:

- missing access or credentials;
- destructive or irreversible action;
- product decision with incompatible requirements;
- external dependency outside the available repo/services;
- acceptance/deploy decision when the workflow requires human approval.

## Configuration

Read Scout access from environment variables first. If required variables are missing, check the current workspace for a local `.env` file and source it inside the Scout command without printing secret values. This is the default for repos where `.env` is intentionally local and gitignored; do not ask the user for Scout credentials until both exported env vars and the local `.env` fallback have been checked.

- `SCOUT_URL`: Scout base URL, for example `https://your-scout.example`.
- `SCOUT_API_KEY`: project-scoped API key in `sk_live_*` format. Prefer a key created from Scout via `Projects` → target project → `Manage integrations` → `Create agent key`.
- `SCOUT_PROJECT_SLUG`: Optional default project slug.
- `SCOUT_ITEM_ID`: Optional current item id.

Agent keys should have only the scopes needed for manual issue work, such as reading items, adding notes, workflow/triage actions, related-item links, and reading storage evidence. Never commit Scout credentials, cookies, JWTs, API keys, `.env.local`, or generated credential files. Do not paste real secrets into documentation, PR bodies, issue text, or durable notes.

Recommended shell prefix for Scout API calls when working from a repo root:

```bash
set -a
[ ! -f ./.env ] || . ./.env
set +a
```

Use that prefix only inside the command process. Do not echo `SCOUT_API_KEY`, tokens, cookies, or `.env` contents. It is fine to print `present`/`missing` for variable diagnostics.

## Intake

When the user asks to work from Scout:

1. Identify the item id from the prompt or `SCOUT_ITEM_ID`.
2. If no item id is given, use `SCOUT_PROJECT_SLUG` or the user's project name to find the relevant project, then inspect the candidate queue before choosing work.
3. Fetch the full item before editing code.
4. Read the item message, status, priority, labels, created date, URL, route, component hints, selector, element text/HTML, screenshot path, session recording path, existing notes, assignee, branch, and PR link.
5. Decide whether the item is actionable now.
6. If actionable, leave a concise Scout note that you are taking it and what local repo/branch you will use.
7. Claim the item or move it to `in_progress` only when you are actually starting work.

## Queue Triage

When selecting work from a project rather than a specific item, first inspect the queue like a bug triage owner, not like a FIFO script.

1. List open items across relevant statuses: `new`, `in_progress`, and `review` when appropriate. Prefer one `/api/items/list` call with `statuses` when Scout supports it; otherwise make separate status calls.
2. Sort by severity and urgency first, then age:
   - `critical`: production outage, data loss/corruption, security/privacy issue, broken core workflow.
   - `high`: major user-visible failure, blocked important workflow, strong business impact.
   - `medium`: normal defect or improvement with clear value.
   - `low`: polish, minor inconsistency, non-blocking improvement.
3. Within the same priority, prefer older `createdAt` items unless a newer item is clearly a regression, duplicate of a hot issue, or blocks more users.
4. Do not starve old medium/low items forever. If many old items accumulate, call that out in Scout or in the user-facing summary.
5. Treat assigned `in_progress` items carefully: do not take over another person's work unless the user explicitly asks or the item is clearly abandoned.
6. Check `review` items before starting new work when they may already contain a fix for the same area.

Recommended selection order:

1. Critical items, oldest first, grouped by suspected root cause.
2. High priority regressions or blockers, oldest first.
3. Related clusters where one fix may resolve multiple open items.
4. Remaining oldest actionable items within the requested scope.

## Related Items And Duplicate Work

Before implementing a fix, proactively look for related Scout items so one root-cause fix can close the whole cluster when appropriate. Do not wait for the user to ask for dependency analysis.

Search for related items by:

- same project and same route/page URL;
- same component file, selector, element text, or UI area;
- similar error text, labels, browser/device, status, or reproduction steps;
- same recent deployment/regression window;
- notes that mention a branch, PR, workaround, or previous investigation;
- screenshots/recordings that show the same visible failure.

Classify relationships explicitly:

- Duplicate: same symptom, same expected behavior, same root cause likely.
- Shared root cause: different symptoms caused by the same code path or data issue.
- Related but separate: same area, different cause or expected behavior.
- Blocks / blocked by: one item cannot be completed or verified until another item is handled.
- Caused by: the current item appears to be a regression or side effect of another tracked change.
- Conflicting: items request incompatible behavior and need a product decision.

Rules for handling clusters:

1. Do not blindly merge bugs by similar wording. Confirm with evidence.
2. Create Scout links yourself when evidence supports a relationship: `duplicate`, `related`, `blocks`, `blocked_by`, `caused_by`, or `conflicts`.
3. If one fix likely resolves multiple items, choose a primary item and mention related item ids in Scout notes.
4. Keep the code change cohesive. One PR may address a cluster only when the root cause and verification are shared.
5. If related items need different fixes, split the work and explain why.
6. After fixing, verify each related item's acceptance condition before moving it to `review` or `done`.
7. When closing/handing off multiple items, add a note to each item that links the shared branch/PR and explains why it is covered.
8. If items conflict, link them as `conflicts`, stop, and ask a product/owner question in Scout instead of choosing arbitrarily.
9. If no related items are found, say that in the completion note so the absence of links is intentional.

## Triage

Before implementing:

1. Classify the item: bug, regression, UX issue, feature request, copy/content, infra, test/build, data issue, or access/config issue.
2. Determine expected behavior and actual behavior from the Scout evidence.
3. Identify affected surface: frontend, backend, widget, database, integration, deploy, documentation, or unknown.
4. Consider priority, created date, and whether related higher-priority or older items should be handled together.
5. Check if the issue is already fixed, duplicate, blocked, impossible to reproduce, or outside this repo.
6. If scope or expected behavior is ambiguous, ask in Scout and stop.

## Reproduction And Diagnosis

For bugs, reproduce or collect the nearest practical evidence before fixing:

1. Use the reported URL, screenshot, selector, recording, logs, API payload, or test failure.
2. For frontend/user-visible bugs, run or use the local app and verify in a browser when feasible.
3. Trace the code path to root cause. Do not patch symptoms blindly.
4. Compare with nearby working behavior or established patterns.
5. Add temporary probes only if they help find the cause; remove them before completion.

If reproduction is impossible but the evidence is strong, say so in Scout and make the smallest evidence-backed fix.

## Large Browser Or Regression Items

When a Scout item asks for broad browser coverage, route sweeps, role matrices, query/params matrices, or "check everything", treat the runner as production tooling, not as ad hoc clicking.

1. Build inventory first: routes, query/params, roles/auth, fixtures, destructive boundaries, and expected-negative cases.
2. Do not run a long sweep through visible browser windows or many Playwright MCP contexts. Use a controlled headless runner when available, with one browser/page by default and explicit throttling.
3. Write progress and results incrementally to an artifact outside the repo, and surface periodic progress only when it changes the user's understanding.
4. Keep the runner below app rate limits. If a broad sweep creates `429` noise, slow down and rerun affected batches instead of treating the raw failures as findings.
5. Classify expected negatives before reporting: invalid-token `403`, missing required params, intentional redirects, allowed third-party/widget noise, navigation `ERR_ABORTED`, and known local-dev warnings are not automatically regressions.
6. For any suspicious failure, run a small targeted repro after the sweep. Report confirmed findings, not raw sweep counts.
7. Do not execute destructive or mass-write form actions without explicit permission and disposable local fixtures. Mark only those cases blocked; do not let them block read-only route coverage.
8. If browser tooling itself fails, diagnose the runner separately from the application and say which evidence is invalidated.

## Implementation

1. Work in the current local repository unless the user explicitly points elsewhere.
2. Check Git state before editing. Do not overwrite unrelated local changes.
3. Create or use a focused branch when the workflow calls for commits/PRs.
4. Make the minimal correct change.
5. Avoid broad refactors, dependency churn, formatting sweeps, or unrelated cleanup.
6. Preserve public/private boundaries and never add secrets to tracked files.
7. Follow existing project conventions over generic preferences.

## Commit And Handoff

For completed code changes from a Scout item, create a focused git commit after final verification unless the user explicitly says not to commit or the repository policy forbids commits.

1. Commit only the files that belong to the Scout item. Do not include unrelated local changes, generated secrets, local env files, private runbooks, or incidental reports.
2. Keep the commit message in the repository's required language. When working in this Scout repository, commit messages are English.
3. Include a durable Scout reference in the commit body, for example `Scout-Item: <SCOUT_ITEM_URL_OR_ID>`. If a project uses issue-style refs, follow that existing convention.
4. Do not push unless the user or repo workflow explicitly asks for push.
5. After the commit succeeds, update Scout with the branch name and commit hash or PR URL. If the commit cannot be created, explain the exact blocker in Scout and do not mark the item ready for review.

## Communication In Scout

Use Scout notes for durable, useful communication:

- Starting work: mention local repo/branch and initial understanding.
- Root cause found: summarize the actual cause briefly.
- Related items found: list item ids and explain duplicate/shared/separate classification.
- Question/blocker: ask exactly what is needed to proceed.
- Verification result: list commands/browser checks and result.
- Handoff: link branch/commit/PR and summarize the fix.
- Failure: explain why it cannot be completed and what evidence exists.

Write Scout notes in Russian by default, unless the Scout item or project explicitly uses another language. Keep them clear enough that a reviewer can understand what happened without reading the chat: what was done, why, how it was verified, what changed in status, and what remains. Avoid noisy command transcripts, huge stack traces, private local paths unless necessary, secrets, speculative claims, or “still working” chatter.

Minimum useful Scout updates:

1. Start note before active work: коротко что берёшь, как понял задачу, где будешь работать.
2. Root-cause note when known: фактическая причина, без догадок.
3. Completion or blocker note before handoff: реализация, проверки, commit/branch/PR, статус, остаточные риски или точный блокер.

Question note format:

```text
Question: <specific decision or missing fact>
Why it matters: <impact on implementation or verification>
Suggested default: <safe recommended assumption, if one exists>
```

Completion note format:

```text
Сделано: <краткое резюме изменения>
Причина: <корневая причина для багов или основание для улучшения>
Проверка: <команды и browser/API/runtime checks>
Commit/ветка/PR: <branch, commit hash, or PR URL>
Статус: <куда переведена задача и почему>
Осталось: <риски, пропущенные проверки или "ничего">
```

## Status Handling

Use Scout statuses deliberately:

- `new`: not yet taken or returned for later work.
- `in_progress`: actively being worked or waiting on a direct clarification after ownership was taken.
- `review`: fix is ready for human review with fresh verification evidence, a focused commit or PR reference, and a Russian Scout handoff note.
- `done`: accepted/merged/resolved according to the user's workflow.
- `cancelled`: not applicable, duplicate, invalid, or intentionally abandoned.

Do not mark `review` or `done` just because code was edited. There must be fresh verification evidence, a clear Scout handoff in Russian, and a commit/branch/PR reference unless a documented blocker or explicit no-commit instruction exists.

When a fix covers multiple Scout items:

1. Update the primary item with the full implementation and verification summary.
2. Update each related item with a shorter note referencing the primary item and shared branch/PR.
3. Move each related item only after its own acceptance condition was checked.
4. Leave unrelated or only partially covered items open, with a note explaining what remains.

## Verification

Before handoff:

1. Run the narrowest relevant checks first.
2. Run repo-required checks from `AGENTS.md`, README, package scripts, or CI docs.
3. Re-run checks after the final code change, not only before or during the fix.
4. Inspect the final diff and confirm it is limited to the Scout item's scope.
5. For frontend/user-visible changes, verify in a browser against the local app when feasible.
6. For backend/API changes, verify with tests and a targeted runtime/API check when feasible.
7. For data/deploy changes, verify with fresh state evidence and safe backups when relevant.
8. If a check cannot run, document why and what evidence was used instead.

## Definition Of Done

Do not present the item as complete until all of these are true:

1. The reported problem or requested improvement is addressed end-to-end, or a precise blocker/question is recorded in Scout.
2. The final diff was reviewed for unrelated changes, secrets, debug code, broad rewrites, and stale TODOs.
3. Fresh verification evidence exists after the final edit: commands, browser checks, API checks, or a documented reason why a check cannot run.
4. Frontend, dashboard, widget, or other user-visible changes have browser verification when feasible.
5. A focused commit exists for completed code changes and references the Scout item, unless explicitly skipped with a documented reason.
6. Scout has Russian notes covering start, root cause when relevant, completion or blocker, verification, commit/branch/PR, status change, and remaining risks.
7. The Scout status reflects reality: `in_progress` while working or blocked on clarification, `review` only when committed and ready for review, `done` only when accepted by the workflow, and no silent "left for later" work.

Final user response must be short and evidence-based:

- Item chosen and why.
- What changed.
- Verification run after the final change.
- Scout updates made.
- Commit created and Scout item reference used, or exact reason no commit was created.
- Anything not completed, with the exact blocker. If nothing remains, say so explicitly.

## Scout API Reference

All API calls are `POST` JSON unless retrieving storage assets. Authenticate with `Authorization: Bearer $SCOUT_API_KEY`.

List projects:

```bash
set -a
[ ! -f ./.env ] || . ./.env
set +a
curl -fsS "$SCOUT_URL/api/projects/list" \
  -H "Authorization: Bearer $SCOUT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"page":1,"perPage":100}'
```

List items for a project:

```bash
set -a
[ ! -f ./.env ] || . ./.env
set +a
curl -fsS "$SCOUT_URL/api/items/list" \
  -H "Authorization: Bearer $SCOUT_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"projectId\":\"$PROJECT_ID\",\"status\":\"new\",\"page\":1,\"perPage\":100}"
```

When triaging a queue, prefer one open-status call if available:

```bash
set -a
[ ! -f ./.env ] || . ./.env
set +a
curl -fsS "$SCOUT_URL/api/items/list" \
  -H "Authorization: Bearer $SCOUT_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"projectId\":\"$PROJECT_ID\",\"statuses\":[\"new\",\"in_progress\",\"review\"],\"page\":1,\"perPage\":100}"
```

Use additional list calls only when you need pagination beyond the first page, a narrower search, or compatibility with an older Scout server. Use `priority` or `search` filters when narrowing a large queue.

Get one item:

```bash
set -a
[ ! -f ./.env ] || . ./.env
set +a
curl -fsS "$SCOUT_URL/api/items/get" \
  -H "Authorization: Bearer $SCOUT_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"id\":\"$SCOUT_ITEM_ID\"}"
```

Claim item:

```bash
set -a
[ ! -f ./.env ] || . ./.env
set +a
curl -fsS "$SCOUT_URL/api/items/claim" \
  -H "Authorization: Bearer $SCOUT_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"id\":\"$SCOUT_ITEM_ID\"}"
```

Add note:

```bash
set -a
[ ! -f ./.env ] || . ./.env
set +a
curl -fsS "$SCOUT_URL/api/items/add-note" \
  -H "Authorization: Bearer $SCOUT_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"itemId\":\"$SCOUT_ITEM_ID\",\"content\":\"<CHANGE-ME-note>\"}"
```

Link related items:

```bash
set -a
[ ! -f ./.env ] || . ./.env
set +a
curl -fsS "$SCOUT_URL/api/items/link" \
  -H "Authorization: Bearer $SCOUT_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"sourceItemId\":\"$SCOUT_ITEM_ID\",\"targetItemId\":\"<CHANGE-ME-related-item-id>\",\"type\":\"related\"}"
```

Update status:

```bash
set -a
[ ! -f ./.env ] || . ./.env
set +a
curl -fsS "$SCOUT_URL/api/items/update-status" \
  -H "Authorization: Bearer $SCOUT_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"id\":\"$SCOUT_ITEM_ID\",\"status\":\"review\",\"branchName\":\"<CHANGE-ME-branch>\",\"mrUrl\":\"<CHANGE-ME-pr-url>\"}"
```

## Boundaries

- Do not run polling or background automation in this manual workflow.
- Do not mutate unrelated Scout items.
- Do not delete Scout data, screenshots, recordings, production volumes, or user data.
- Do not use destructive Git or deploy commands unless explicitly requested and safe.
- Do not bypass repo safety rules, checks, or browser verification requirements.
