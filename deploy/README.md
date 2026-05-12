# Deployment Examples

This directory contains generic deployment examples only. Do not commit production hostnames, SSH aliases, server paths, credentials, tokens, or real `.env` files.

Recommended production layout is to keep a local untracked compose file in this directory:

- `deploy/docker-compose.yml`
- `deploy/.env`
- `deploy/deploy.local.sh`

Use the tracked `*.example.*` files as templates and replace placeholders locally.

Important data safety rule: production `data/` and `storage/` volumes contain the SQLite database, screenshots, and session recordings. Never remove these volumes during deploy or rollback.

## GitHub Actions Deploy

The repository includes one canonical deploy workflow in `.github/workflows/deploy.yml`. It is safe for a public repository because production-specific values are read from GitHub Environments, Secrets, and Variables, not from tracked files.

The workflow always performs the same sequence: connect over SSH, back up the service mounts, update a server-side source checkout, build a local Docker image on the server, and restart the configured service with `docker compose up -d --remove-orphans`. It never removes volumes.

Configure the `production` environment with these values:

- Secret `DEPLOY_SSH_KEY` — private SSH key for deploy access.
- Variable `DEPLOY_HOST` — target host or private target IP when using a bastion.
- Variable `DEPLOY_USER` — target SSH user.
- Optional variables `DEPLOY_PORT`, `DEPLOY_BASTION_HOST`, `DEPLOY_BASTION_PORT`, `DEPLOY_BASTION_USER`.
- Variable `DEPLOY_PATH` — directory containing the server-side compose file.
- Variable `DEPLOY_SOURCE_PATH` — server-side git checkout path used for Docker builds.
- Optional variables `DEPLOY_COMPOSE_FILE`, `DEPLOY_SERVICE`, `DEPLOY_IMAGE`, `DEPLOY_BACKUP_PATH`, `DEPLOY_HEALTH_URL`.

For KAFU-like bastion setups, set `DEPLOY_HOST` to the internal target host/IP and set `DEPLOY_BASTION_*` to the jump host values.
