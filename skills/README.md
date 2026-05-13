# Scout Skills

This directory contains installable agent skills for working with Scout.

## `scout-manual-workflow`

Use this skill when an AI coding agent should take a Scout item and handle it manually like a professional engineer: triage, reproduce, diagnose, fix, verify, update Scout notes/statuses, and handle related or duplicate items.

Install globally from GitHub:

```bash
npx skills add scout-dev-org/scout --skill scout-manual-workflow --full-depth -g -y
```

Install into the current project instead:

```bash
npx skills add scout-dev-org/scout --skill scout-manual-workflow --full-depth -p -y
```

Update later:

```bash
npx skills update scout-manual-workflow -g -y
```

If installed project-locally, update from that project:

```bash
npx skills update scout-manual-workflow -p -y
```

List skills available in this repository without installing:

```bash
npx skills add scout-dev-org/scout --list --full-depth
```

Required runtime configuration is intentionally not stored in this repository. Set it in your shell, local `.env`, or another private credential store:

Create the key from Scout: `Projects` → target project → `Manage integrations` → `Create OpenCode key`. Scout shows the full key and a ready-to-copy env block once.

```bash
export SCOUT_URL="https://your-scout.example"
export SCOUT_API_KEY="<CHANGE-ME-sk_live-api-key>"
export SCOUT_PROJECT_SLUG="<CHANGE-ME-project-slug>"
```

Do not commit Scout API keys, cookies, JWTs, or environment files with real credentials.
