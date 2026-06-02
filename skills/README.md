# Scout Skills

This directory contains installable agent skills for working with Scout.

## `scout-manual-workflow`

Use this skill when an AI coding agent should take a Scout item and handle it manually like a professional engineer: triage, reproduce, diagnose, inspect linked runtime error context when present, fix, verify, update Scout notes/statuses, and handle related or duplicate items.

## OpenCode Commands

Scout ships one OpenCode slash command in `.opencode/commands/`: `/scout`. It is a thin entrypoint into `scout-manual-workflow`; keep lifecycle rules in the skill and let the agent infer single-item, full active queue, review/testing verification, runtime-error follow-up, or done-audit mode from arguments and live queue state.

The command works without arguments. Any text after `/scout` is an optional hint, item id, item URL, project, branch, deploy target, or scope, not a separate mode selector.

Install the commands globally for use in any repository:

```bash
./scripts/install-opencode-commands.sh
```

By default this copies commands to `~/.config/opencode/commands`. Override the target with `OPENCODE_COMMANDS_DIR=/path/to/commands` if needed. Restart OpenCode after installing or updating commands.

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

Required runtime configuration is intentionally not stored in this repository. Set it in your shell, local `.env`, or another private credential store.

Create the key from Scout: `Projects` → target project → `Manage integrations` → `Create agent key`. Scout shows the full key and a ready-to-copy env block once.

For a shell session, use `export`:

```bash
export SCOUT_URL="https://your-scout.example"
export SCOUT_API_KEY="<CHANGE-ME-sk_live-api-key>"
export SCOUT_PROJECT_SLUG="<CHANGE-ME-project-slug>"
```

For a dotenv file, omit `export`:

```dotenv
SCOUT_URL=https://your-scout.example
SCOUT_API_KEY=<CHANGE-ME-sk_live-api-key>
SCOUT_PROJECT_SLUG=<CHANGE-ME-project-slug>
```

If you load a dotenv file with plain shell `source`, export variables before launching the agent:

```bash
set -a
source .env
set +a
opencode
```

Do not commit Scout API keys, cookies, JWTs, or environment files with real credentials.

For runtime error group work, the agent key also needs the relevant `errors:*` scopes. Use `errors:read` for linked error inspection, `errors:triage` for ignore/unignore actions, and `errors:write` only for ingestion/upsert automation. The Alertmanager bridge shared secret is server-side integration material, not a normal manual-agent credential.
