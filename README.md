# Fantasy Platform

A fantasy-football companion app built **API-first**: one Python service defines
the contract, and both clients — a Svelte web app and a SwiftUI iOS app — are
generated from it, so logic lives in one place and cannot drift between them.

Rebuilt from [fantasy-tds](https://github.com/rmasons/fantasy-tds), which remains
the running production app and the parity checklist.

## Architecture

```
Sleeper API
     │  ingestion (Python, scheduled)
     ▼
[ Neon Postgres ] ◀──▶ [ FastAPI on Cloud Run ] ──▶ OpenAPI spec
                              │                        │
                    Firebase Auth (ID tokens)          ├─▶ generated TS client ──▶ Svelte SPA
                    verified via firebase-admin        └─▶ generated Swift client ─▶ SwiftUI app
```

**The OpenAPI spec is the seam.** FastAPI derives it automatically from the
Pydantic models that already validate requests and serialize responses — one
definition serving validation, serialization, and both generated clients. Rename
a field and the iOS build fails in CI, not on someone's phone.

Why this shape, and what it replaced: **[ADR 0002](docs/decisions/0002-ios-first-openapi-python-api.md)**.
Why Firebase Auth: **[ADR 0001](docs/decisions/0001-auth-provider-and-native-clients.md)**.

- **`src/`** — the API and ingestion. `api/` (FastAPI routes + deps),
  `core/` (config, Postgres pool, Sleeper client, Pydantic schemas),
  `ingestion/` (backfill + daily).
- **`migrations/`** — plain SQL, applied in order.
- **`web/`** — Svelte 5 + Vite SPA *(not started — build spec 07)*. A static
  client: no server, therefore no data path except the API.
- **`ios/`** — SwiftUI app *(not started — build spec 08)*.

There is **no application code in this repo yet**, deliberately. It is
specified in [`docs/build/`](docs/build/) and written by hand — see the
"specs, not scaffolds" rule in [AGENTS.md](AGENTS.md).

## Prerequisites

- **Python** 3.12+
- **Docker** (local Postgres via `docker-compose.yml`)
- **Node** 20+ — only once the web client exists (build spec 07)
- A [Neon](https://neon.com) project, and the fantasy-tds Firebase project

## Local quickstart

Full ordered setup — including Neon, Firebase, and the deploy targets — is in
**[docs/SETUP.md](docs/SETUP.md)**. The short version:

```bash
# 1. Python env + deps
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt

# 2. Local Postgres
docker compose up -d
```

Then start at **[docs/build/](docs/build/)**. Once spec 01 is built:

```bash
PYTHONPATH=src python -m core.db.migrate      # apply migrations
PYTHONPATH=src uvicorn api.main:app --reload  # :8000, OpenAPI UI at /docs
```

## Tests

```bash
pytest                  # pure logic, routes, ingestion
ruff check src tests    # lint
```

## Configuration

Backend (`.env`, never committed — see [.env.example](.env.example)):

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string (local Docker or Neon) |
| `FIREBASE_PROJECT_ID` | Validates Firebase ID tokens; same project as fantasy-tds |

Web (`web/.env.local`), once the client exists:

| Var | Purpose |
|---|---|
| `PUBLIC_API_BASE_URL` | Base URL of the API |
| `PUBLIC_FIREBASE_*` | Firebase web config (six values, copied from fantasy-tds) |

## Key patterns

### Pydantic models are the contract

```python
class StandingRow(BaseModel):
    roster_id: int
    display_name: str
    wins: int
    losses: int
    ties: int
    fpts: float
    avatar: str | None = None
```

One definition validates, serializes, documents, and generates both clients.
Change it and every consumer is regenerated from the same source.

### Pure logic stays free of I/O

`core/` computation takes rows and returns rows — no database handle, no HTTP
client. That is what makes it unit-testable without a database, and what would
let it feed a precomputed-snapshot cache later without rework.

### Auth is a dependency, not middleware

```python
async def current_user(token: str = Depends(bearer)) -> User:
    claims = firebase_admin.auth.verify_id_token(token)
    ...
```

Both clients send `Authorization: Bearer <firebase-id-token>`. There is no
session cookie and no server-side session state, so the web and iOS auth paths
are identical.

### Migrations are explicit

Plain SQL in `migrations/`, applied in order by `core/db/migrate.py`. Neon's
branching gives each of `dev` / `test` / `main` its own copy-on-write database,
so migrations can be rehearsed against real-shaped data.

## Branching & deployment

`dev → test → main`, with a blocking fresh-context review on each promotion.
See **[docs/pipeline.md](docs/pipeline.md)**.

## Working agreement

Who writes what, the TDD loop, and the rules for delegating to agents:
**[AGENTS.md](AGENTS.md)**. Current state and next steps:
**[HANDOFF.md](HANDOFF.md)**.
