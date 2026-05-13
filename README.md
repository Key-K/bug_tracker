<p align="center">
  <img src="https://img.icons8.com/fluency/96/bug.png" alt="Scout" width="80" />
</p>

<h1 align="center">Scout</h1>

<p align="center">
  <strong>Self-hosted bug tracking for AI-assisted product teams</strong><br/>
  Embeddable widget &middot; Screenshots and session replay &middot; Multi-language dashboard
</p>

<p align="center">
  <a href="#quickstart">Quickstart</a> &middot;
  <a href="#widget">Widget</a> &middot;
  <a href="#dashboard">Dashboard</a> &middot;
  <a href="#agent-skill">Agent Skill</a> &middot;
  <a href="#optional-orchestrator">Optional Orchestrator</a> &middot;
  <a href="#deployment">Deployment</a> &middot;
  <a href="#api">API</a>
</p>

---

## What is Scout?

Scout is a self-hosted bug tracker for teams that want high-quality bug reports and a clean handoff to humans or coding agents. Testers report bugs via an embeddable widget that captures element context, screenshots, and session recordings. Developers and agents work from the dashboard, link related issues, add notes, and move items through the workflow.

```
Tester clicks element  →  Widget captures context + screenshot + recording
                                ↓
                        API creates item (new)
                                ↓
                        Team or agent triages → fixes → links PR
                                ↓
                        Review → done
```

## Features

| Area | Details |
|------|---------|
| **Widget** | Shadow DOM isolation, element picker with instruction banner, html2canvas-pro screenshot with element highlight, rrweb session recording (60s buffer), cross-domain SSO |
| **Dashboard** | React SPA, rrweb session player, items/projects/users/webhooks management, locale switcher |
| **i18n** | Russian, English, Uzbek (Latin). Dashboard + widget. Server error codes translated on client |
| **Agent workflows** | Manual agent skill for controlled bug work; optional orchestrator scaffold for automated polling |
| **Auth** | JWT + API keys (`sk_live_*`), system roles (admin/member/agent), project roles (owner/manager/developer/reporter/viewer), cross-domain SSO |
| **Infra** | Single process (API + SPA + widget on one port), SQLite, Docker, publishable GHCR image |

## Quickstart

### Docker

```bash
docker run -d \
  --name scout \
  -p 10009:10009 \
  -e SCOUT_JWT_SECRET=$(openssl rand -hex 32) \
  -e SCOUT_ADMIN_EMAIL=admin@example.com \
  -e SCOUT_ADMIN_PASSWORD='<CHANGE-ME-admin-password>' \
  -v scout-data:/app/data \
  -v scout-storage:/app/storage \
  ghcr.io/<your-org>/scout:master
```

Open http://localhost:10009 and sign in with the admin credentials from `SCOUT_ADMIN_EMAIL` / `SCOUT_ADMIN_PASSWORD`.

Local development auto-seeds `admin@scout.local` / `admin`, `agent@scout.local` / `agent`, and a demo project when the database is empty. **Never use default credentials outside local development.**

### From source

```bash
git clone https://github.com/scout-dev-org/scout.git && cd scout
pnpm install
pnpm db:seed     # create DB with test data
pnpm dev:all     # API + dashboard + widget (hot reload)
```

## Widget

```html
<script>
  window.__SCOUT_CONFIG__ = {
    apiUrl: 'https://your-scout.example',
    projectSlug: 'my-project',
  };
</script>
<script src="https://your-scout.example/widget/scout-widget.js" async></script>
```

The dashboard shows a ready-to-copy snippet for each project on the **Projects** page.

**What it captures:** CSS selector, element text/HTML, page URL, viewport size, browser/OS metadata, screenshot (with element highlight), session recording (last 60 seconds).

**SSO:** Users log in once — session shared across all sites via cookie (subdomains) or popup (cross-domain).

**Language:** Auto-detected from `navigator.language`. Supports `ru`, `en`, `uz`.

**Config options:**

| Option | Default | Description |
|--------|---------|-------------|
| `apiUrl` | — | Scout server URL (required) |
| `projectSlug` | — | Project slug (required) |
| `enabled` | `true` | Set `false` to hide. `?scout=1` in URL overrides |

## Dashboard

Responsive React SPA served from the same port as the API.

- **Items** — List with status/priority filters, search, pagination. Detail view with screenshot lightbox, rrweb session player, notes timeline, related items, resolve modal
- **Projects** — CRUD with allowed origins for CORS/SSO, auto-fix toggle, ready-to-copy widget snippet
- **Users** — CRUD with system roles and per-project role assignment
- **Webhooks** — Per-project event notifications (Slack-compatible)
- **Language** — Switcher in sidebar (RU / EN / UZ)

## Roles And Permissions

Scout has two layers of access control:

| Layer | Values | Purpose |
|-------|--------|---------|
| System role | `admin`, `member`, `agent` | Account type and global administration |
| Project role | `owner`, `manager`, `developer`, `reporter`, `viewer` | Per-project permissions |

System `admin` can access everything. Non-admin users get access through `projectRoles` on each project.

| Project role | Main permissions |
|--------------|------------------|
| `owner` | Full project management: project settings, members, integrations, item workflow/triage |
| `manager` | Triage items: update, cancel, reopen, delete, assign, workflow |
| `developer` | Claim, update workflow status, resolve, comment, link related items |
| `reporter` | Create items, comment, view, cancel own `new` items |
| `viewer` | Read-only project access |

User APIs use `projectRoles` for per-project access assignment.

## Agent Skill

Scout also ships an installable agent skill for manual bug-tracker work. It is useful when a coding agent should take a Scout item, triage related items, reproduce the bug, fix it in a local repository, verify the result, and update Scout notes/statuses without relying on background automation.

Install globally:

```bash
npx skills add scout-dev-org/scout --skill scout-manual-workflow --full-depth -g -y
```

Update later:

```bash
npx skills update scout-manual-workflow -g -y
```

See `skills/README.md` for project-local install commands and required `SCOUT_*` environment variables.

## Optional Orchestrator

The repository contains an experimental orchestrator scaffold in `orchestrator/`. It can poll Scout, claim `new` items, run a configured AI agent binary, and open PRs through `gh`. It is not required for normal Scout usage; the recommended operational path is the manual agent skill above.

```bash
pnpm orchestrator
```

Configure project-to-repo mapping in `orchestrator/agent.yaml`. See `orchestrator/README.md` before running it against a real project.

## API

All endpoints are `POST` with JSON body. Auth via `Authorization: Bearer <jwt|api-key>`.

Base path: `/api/v1/` (or `/api/` for backward compatibility).

Interactive docs: `https://your-scout.example/api/docs`

**Key endpoints:**

| Endpoint | Description |
|----------|-------------|
| `/api/auth/login` | Get JWT token |
| `/api/items/create` | Create bug report |
| `/api/items/list` | List items (filtered) |
| `/api/items/get` | Get item with notes, related items, and current-user permissions |
| `/api/items/claim` | Assign to self |
| `/api/items/resolve` | Mark as done |
| `/api/items/link` | Link related/duplicate/blocking items |
| `/api/auth/validate` | Validate token/API key |

## Deployment

### Docker Compose with HTTPS

Generic, non-production examples are available in `deploy/`. Keep real production compose files, `.env`, hostnames, SSH aliases, and server paths local and untracked.

```yaml
services:
  caddy:
    image: caddy:2-alpine
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data

  scout:
    image: ghcr.io/<your-org>/scout:master
    environment:
      - SCOUT_JWT_SECRET=${SCOUT_JWT_SECRET}
      - SCOUT_ADMIN_EMAIL=${SCOUT_ADMIN_EMAIL}
      - SCOUT_ADMIN_PASSWORD=${SCOUT_ADMIN_PASSWORD}
    volumes:
      - scout-data:/app/data
      - scout-storage:/app/storage

volumes:
  caddy_data:
  scout-data:
  scout-storage:
```

```
# Caddyfile
scout.example.com {
    reverse_proxy scout:10009
}
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SCOUT_JWT_SECRET` | dev secret | **Required in production** |
| `SCOUT_ADMIN_EMAIL` | — | Initial admin email when a production database has no users |
| `SCOUT_ADMIN_PASSWORD` | generated if omitted | Initial admin password when `SCOUT_ADMIN_EMAIL` is set |
| `SCOUT_PORT` | `10009` | Server port |
| `SCOUT_DB_PATH` | `data/scout.db` | SQLite database path |
| `SCOUT_CORS_ORIGINS` | — | Comma-separated allowed origins |
| `SMTP_HOST` | — | SMTP server for email notifications |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_USER` | — | SMTP username |
| `SMTP_PASS` | — | SMTP password |
| `SMTP_FROM` | — | Sender email address |
| `LOG_LEVEL` | `info` | Pino log level |

### CI/CD

Push to `dev` → typecheck + tests.

Push to `master` → typecheck + tests → Docker build + publish to GHCR.

The repository also includes a generic GitHub Actions deploy workflow. It is safe for forks because all production-specific hosts, paths, SSH keys, and health URLs come from GitHub Environment secrets/variables, not from tracked files. Operators may also deploy the published image manually using the examples in `deploy/`.

### Backup

```bash
docker cp scout:/app/data/scout.db ./backup/scout-$(date +%Y%m%d).db
```

## Development

```bash
pnpm dev          # API server (port 10009)
pnpm dev:all      # API + dashboard + widget (hot reload)
pnpm test         # unit tests (Vitest)
pnpm test:e2e     # E2E tests (Playwright — chromium/firefox/webkit)
pnpm typecheck    # TypeScript check
pnpm build        # production build
pnpm db:seed      # seed database with test data
pnpm db:generate  # generate DB migration after schema change
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| API | Hono, Drizzle ORM, better-sqlite3, Zod |
| Dashboard | React 19, Tailwind CSS 4, Vite 6 |
| Widget | Vanilla TS, html2canvas-pro, rrweb, fflate |
| Auth | JWT, bcrypt, API keys |
| Tests | Vitest (unit), Playwright (E2E) |
| Deploy | Docker, GHCR, Caddy |

## License

MIT
