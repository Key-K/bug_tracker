# Scout Skills

This directory contains installable agent skills for working with Scout.

## `scout-manual-workflow`

Use this skill when an AI coding agent should take a Scout item and handle it manually like a professional engineer: triage, reproduce, diagnose, fix, verify, update Scout notes/statuses, and handle related or duplicate items.

## OpenCode Commands

Scout also ships simple OpenCode slash commands in `.opencode/commands/`. These commands are thin entrypoints into `scout-manual-workflow`; keep lifecycle rules in the skill and keep commands focused on invocation mode.

- `/scout-one`: finish one Scout item completely, or choose the next actionable item when no item is specified.
- `/scout-all`: finish all actionable Scout items in scope until they are done, waiting for unavailable target verification, or honestly blocked.
- `/scout-review`: finish items already waiting in review by verifying the target environment, closing passing items, and fixing/reopening failures.
- `/scout-audit`: audit completed items with fresh evidence and repair or reopen anything that is not actually accepted.

All commands work without arguments. Any text after the command is only an optional hint, not the primary interface.

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
