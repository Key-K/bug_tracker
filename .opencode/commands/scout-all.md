---
description: Finish all actionable Scout items
subtask: false
---

Load and follow the `scout-manual-workflow` skill.

Mode: batch all actionable Scout items.

Goal: process all actionable Scout items in scope until each is `done`, honestly blocked, or waiting in `review`/`testing` only because target-environment verification is unavailable, not allowed, or still underway.

Arguments: `$ARGUMENTS` is optional scope only: project, label, priority, release target, item set, or other narrowing hint. Empty arguments mean use `SCOUT_PROJECT_SLUG` or available Scout context.

Use the skill as the source of truth for queue discovery, durable ledger, clustering, status gates, commits, deploy/target verification, structured evidence, Russian Scout notes, and blockers.

Final response: starting counts, final counts, items completed/reviewed/testing/blocked/cancelled, commits/PRs/deploys, ledger path, verification summary, and exact remaining blockers if any.
