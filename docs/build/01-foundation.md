# 01 — Foundation

**Goal:** `uvicorn` starts, `/ping` answers, `/health` reports database status,
`/docs` renders, and a migration runner can apply SQL files.

**Depends on:** [SETUP.md](../SETUP.md) steps 1–2 (Python env, Docker Postgres).

---

## Design decisions

These are settled — implement them knowingly rather than rediscovering them.

**The pool opens with `min_size=0`.** The API must start even when Postgres is
unreachable. A pool that demands a connection at startup turns a database blip
into a crash-loop, and on Cloud Run a crash-loop means no service at all. Start
empty, connect on demand, and let `/health` report the truth.

**Liveness and readiness are different endpoints.** `/ping` touches nothing and
always answers — it is what an uptime check and your tests hit. `/health` pings
the database and reports it as degraded rather than failing the request. If they
were one endpoint you could not distinguish "the process is dead" from "the
database is briefly away," and an uptime checker would restart a healthy API.

**Config is environment-driven with local defaults.** Identical code across
local, dev, and prod; only values change. Defaults point at local Docker so a
fresh clone runs without a `.env`.

**Settings are cached.** They are read once per process, not per request.

---

## What to build

| File | Responsibility |
|---|---|
| `src/core/config.py` | A `pydantic-settings` model, read from env + `.env`, cached per process |
| `src/core/db/pool.py` | One shared `psycopg_pool.ConnectionPool`; a context manager to borrow a connection; a close function |
| `src/core/db/migrate.py` | Apply `migrations/*.sql` in order, tracked so they run once |
| `src/api/main.py` | App factory, CORS, lifespan (open pool at start, close at stop), router registration |
| `src/api/deps.py` | A dependency yielding a pooled connection |
| `src/api/routes/health.py` | `/ping` and `/health` |
| `src/core/schemas.py` | The `Health` response model |

### Settings fields

| Field | Type | Default | Notes |
|---|---|---|---|
| `app_env` | `str` | `"local"` | `local` / `dev` / `prod` |
| `database_url` | `str` | local Docker URL | Deployed, Neon's **pooled** endpoint |
| `sleeper_base_url` | `str` | `https://api.sleeper.app/v1` | Overridable so tests can point at a fake |
| `allowed_origins` | `str` | `http://localhost:5173` | Comma-separated; expose a parsed list |
| `firebase_project_id` | `str \| None` | `None` | Spec 05. Absent means auth is not configured |

### Pool configuration

`min_size=0`, `max_size=10`, rows returned as **dicts** (`psycopg.rows.dict_row`)
so callers index by column name instead of position. `max_size=10` is a starting
point for a single container; revisit if you ever run more than one.

### Migration runner

Applies numbered `*.sql` files from `migrations/` in filename order, recording
each in a tracking table so it is applied exactly once.

- Tracking table: `public.schema_migrations` — `version` (text, PK),
  `applied_at` (timestamptz, default now)
- `version` is the filename stem, e.g. `0001_init`
- Skip files whose stem does not start with a digit (that excludes `ROLES.sql`,
  which is applied out-of-band — see spec 02)
- Each migration and its tracking insert **commit together**, so a failure
  halfway through a set leaves earlier ones applied and the failing one not
  recorded
- Print what it applies; say so when there is nothing to do
- Runnable as `PYTHONPATH=src python -m core.db.migrate`

> **Why plain SQL and not Alembic.** You can read every line that touches the
> database, and the schema is the thing you are trying to learn. Swap in Alembic
> if this outgrows itself; it will be obvious when.

### Response shape — `Health`

| Field | Type | Notes |
|---|---|---|
| `status` | `str` | `"ok"` — the API answered |
| `env` | `str` | From `app_env` |
| `db` | `str` | `"ok"` or `"unavailable"` |

---

## Acceptance criteria

1. `PYTHONPATH=src uvicorn api.main:app --reload` starts with **no `.env`
   present** and no database running.
2. `GET /ping` → `200`, does not touch the database. Verifiable by stopping
   Docker and calling it.
3. `GET /health` with the database up → `200`, `db == "ok"`.
4. `GET /health` with the database **down** → still `200`, `db ==
   "unavailable"`. This is the one most likely to be got wrong: it must not 500
   and must not hang for a long timeout.
5. `GET /docs` renders; `GET /openapi.json` returns a spec containing `/ping`
   and `/health` with `Health` as the response schema.
6. `python -m core.db.migrate` on a fresh database creates
   `public.schema_migrations` and reports there is nothing to apply (no
   numbered migrations exist until spec 02).
7. Running the migration command twice is a no-op the second time.
8. A browser page served from `http://localhost:5173` can call the API without a
   CORS error.

## Edge cases

- **Database down at startup** — covered by criteria 1 and 4. Both the pool and
  the health check must tolerate it.
- **`/health` when the database is slow, not down.** A hung connection attempt
  makes health checks time out, which reads as an outage. Bound how long it will
  wait.
- **Trailing whitespace and empty entries in `allowed_origins`.** `a, b,` should
  parse to two origins, not three with one empty.
- **Pool double-open.** Whatever creates the pool has to be safe to call more
  than once — the lifespan hook and a test fixture may both reach for it.

## Concepts

- [FastAPI lifespan](https://fastapi.tiangolo.com/advanced/events/) — startup and shutdown
- [Dependencies](https://fastapi.tiangolo.com/tutorial/dependencies/) — how `Depends` works and why it is not middleware
- [pydantic-settings](https://docs.pydantic.dev/latest/concepts/pydantic_settings/)
- [psycopg connection pools](https://www.psycopg.org/psycopg3/docs/advanced/pool.html)
- [CORS middleware](https://fastapi.tiangolo.com/tutorial/cors/)

## Done when

All eight criteria pass, `ruff check src` is clean, and `/docs` shows both
endpoints with correct response schemas.
