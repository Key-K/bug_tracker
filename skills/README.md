# Scout Skills

This directory contains the canonical agent skills for working with Scout.

## `scout-manual-workflow`

Use this skill when an AI coding agent should take a Scout item and handle it manually like a professional engineer: triage, reproduce, diagnose, inspect linked runtime error context when present, fix, verify, update Scout notes/statuses, and handle related or duplicate items.

## OpenCode Commands

Scout ships one OpenCode slash command in `.opencode/commands/`: `/scout`. It is a thin entrypoint into `scout-manual-workflow`; keep lifecycle rules in the skill and let the agent infer single-item, single-next, full active queue, review/testing verification, runtime-error follow-up, changes-requested follow-up, or done/verified audit mode from arguments and live queue state.

The workflow is schema-aware: status transitions to `review` or `done` should use structured evidence with `result`, `level`, `coverage`, `scenario`, `action`, `visibleResult`, and item-specific `acceptanceScope`. `done` means the AI/operator work is ready for human acceptance via `/api/items/verify`; rejected work returns through `/api/items/request-changes` as `changes_requested`.

The command works without arguments and defaults to single-next mode. Text after `/scout` is natural-language scope input: it may identify an item, project, branch, deploy target, single-next work, full-queue work, review/testing verification, changes-requested follow-up, runtime-error follow-up, or done/verified audit behavior. Arguments are not a structured subcommand API.

## Developer linked setup

When running OpenCode from this repository, no skill installation is required. `.opencode/opencode.json` loads `skills/`, and `.opencode/commands/scout.md` provides `/scout` from the checkout.

If you develop Scout and need `/scout` outside this repository, link your global OpenCode paths to this checkout once instead of reinstalling after every edit:

```bash
repo=/path/to/scout
mkdir -p "$HOME/.config/opencode/commands" "$HOME/.config/opencode/skills"
ln -sf "$repo/.opencode/commands/scout.md" "$HOME/.config/opencode/commands/scout.md"
if [ -e "$HOME/.config/opencode/skills/scout-manual-workflow" ] || [ -L "$HOME/.config/opencode/skills/scout-manual-workflow" ]; then
  mv "$HOME/.config/opencode/skills/scout-manual-workflow" "$HOME/.config/opencode/scout-manual-workflow.backup-$(date +%Y%m%d%H%M%S)"
fi
ln -s "$repo/skills/scout-manual-workflow" "$HOME/.config/opencode/skills/scout-manual-workflow"
if [ -e "$HOME/.agents/skills/scout-manual-workflow" ] || [ -L "$HOME/.agents/skills/scout-manual-workflow" ]; then
  mv "$HOME/.agents/skills/scout-manual-workflow" "$HOME/.agents/scout-manual-workflow.backup-$(date +%Y%m%d%H%M%S)"
fi
```

Restart OpenCode after changing linked commands, skills, or OpenCode config. Do not run `npx skills update` as the local development sync mechanism.

## Released install/update

Normal users should install the released command globally from a Scout checkout:

```bash
./scripts/install-opencode-commands.sh
```

By default this copies commands to `~/.config/opencode/commands`. Override the target with `OPENCODE_COMMANDS_DIR=/path/to/commands` if needed. Restart OpenCode after installing or updating commands.

Install the released skill globally from GitHub:

```bash
npx skills add scout-dev-org/scout --skill scout-manual-workflow --full-depth -g -y
```

Install the released skill into the current project instead:

```bash
npx skills add scout-dev-org/scout --skill scout-manual-workflow --full-depth -p -y
```

Update a released global install later:

```bash
npx skills update scout-manual-workflow -g -y
```

If installed project-locally, update from that project:

```bash
npx skills update scout-manual-workflow -p -y
```

List released skills available from GitHub without installing:

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
