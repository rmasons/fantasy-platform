# Fantasy Platform

A from-scratch **Python backend** for the fantasy-football data platform — a FastAPI
service and scheduled ingestion over a **private Postgres**. Built to run locally now
and move to **Railway** later with no code changes (everything is env-driven).

This is a separate project from `fantasy-tds` (the existing SvelteKit app); nothing
here touches it. The web frontend stays separate and swappable — it talks to this
API over HTTPS and never sees the database.

## Architecture

```
 Browser ──> [ SvelteKit web ] ──HTTPS+Firebase token──> [ FastAPI ]  ──> Postgres
             (separate, swappable)                        always-on,      private,
                                                          only DB client  no public
                                       [ ingestion ] ─────────────────────^  endpoint
                                        scheduled (cron), shares core/
```

- **`core/`** — shared library: config, DB pool, Sleeper client, business logic.
  Used by **both** the API and ingestion so they run the same code.
- **`api/`** — FastAPI, always-on, the **only** thing that connects to the DB.
  Verifies the Firebase token the web frontend forwards.
- **`ingestion/`** — scheduled jobs (backfill + daily finalize). A separate process.
- **`migrations/`** — plain-SQL migrations + a tiny runner. Two schemas: `app.*`
  (web-owned) and `sleeper.*` (ingestion-owned), with role separation.

See the design rationale in the `fantasy-tds` repo docs (`TARGET_ARCHITECTURE.md`,
`STORAGE_AND_INGESTION.md`).

## Prerequisites

- **Python 3.12** (installed).
- **Docker** — for local Postgres (`docker-compose.yml`). Install Docker Desktop.
- **uv** (recommended) or plain `pip`. Install uv: `curl -LsSf https://astral.sh/uv/install.sh | sh`

## Local quickstart

```bash
cp .env.example .env

# 1. Install deps  — uv:
uv sync --extra dev
#                 — or pip:
python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements-dev.txt

# 2. Start Postgres (local, bound to 127.0.0.1 — mirrors the private-DB model)
docker compose up -d

# 3. Apply migrations
PYTHONPATH=src python -m core.db.migrate

# 4. Run the API   (uv: prefix with `uv run`)
PYTHONPATH=src uvicorn api.main:app --reload
#   -> http://127.0.0.1:8000/health   http://127.0.0.1:8000/docs

# 5. Run ingestion (separate process)
PYTHONPATH=src python -m ingestion daily
PYTHONPATH=src python -m ingestion backfill <league_id>
```

Run tests / lint:

```bash
PYTHONPATH=src pytest        # (pyproject already sets pythonpath; `pytest` alone works too)
ruff check . && ruff format .
```

## Configuration

All via env (`.env` locally, service variables on Railway):

| Var | Purpose |
|---|---|
| `APP_ENV` | `local` enables the no-Firebase dev-bypass user |
| `DATABASE_URL` | Postgres connection string (local Docker → Railway **private** PG) |
| `SLEEPER_BASE_URL` | Sleeper API base |
| `ALLOWED_ORIGINS` | CORS — the web frontend origin(s), comma-separated |
| `FIREBASE_PROJECT_ID` | set in prod to enforce Firebase token auth |

## Moving to Railway later

The code is already Railway-ready; deploying is configuration, not changes:

1. **Postgres** — add a Railway Postgres plugin. Use its **private** connection
   string (`*.railway.internal`) as `DATABASE_URL`. Don't expose a public TCP proxy →
   the DB is reachable only from your services. This *is* the private-DB property.
2. **API service** — deploy this repo; Railway/Nixpacks uses the `Procfile` `web:`
   process. Set env vars (`DATABASE_URL`, `ALLOWED_ORIGINS`, `FIREBASE_PROJECT_ID`,
   Firebase creds). Set a usage cap.
3. **Ingestion** — add a second service from the same repo as a **cron job**, command
   `PYTHONPATH=src python -m ingestion daily`. Same private network → reaches the DB.
   (Note: this is why ingestion is here and not on GitHub Actions — Actions is external
   and can't reach a private DB.)
4. **Migrations** — run `PYTHONPATH=src python -m core.db.migrate` as a release/deploy
   step.
5. **Web frontend** — stays on Vercel (or anywhere); point it at the API's public URL.

## Status

Runnable skeleton: health/readiness, one DB-read + one live-Sleeper endpoint, the
Sleeper→DB write path (nfl_state), migrations, auth dependency, tests. The real
ingestion (matchups/transactions/drafts, the concatenation pattern) and the ported
business logic land on top of this.
