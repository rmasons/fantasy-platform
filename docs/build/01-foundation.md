# 01 — Foundation

**Goal:** `uvicorn` starts, `/ping` answers, `/health` reports database status,
`/docs` renders, and a migration runner can apply SQL files.

**Depends on:** [SETUP.md](../SETUP.md) steps 1–2 (Python env, Docker Postgres).

| | |
|---|---|
| **New here** | `pydantic-settings`, `psycopg` 3, and FastAPI's dependency system — all three for the first time. This is the heaviest spec for reading and the lightest for typing. |
| **Size** | Seven files, none long. The migration runner is the biggest at perhaps sixty lines; several of the others are under twenty. |
| **Working when** | `uvicorn` starts with Docker *stopped*, `curl localhost:8000/ping` answers, and `/docs` lists both routes. |
| **Start by** | Reading [Learning references](#learning-references) at the bottom. Then work down [The files](#the-files) in order. |

---

## Design decisions

These are settled and they span more than one file — implement them knowingly
rather than rediscovering them. Decisions local to a single file are in that
file's section.

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

**Everything is synchronous.** `psycopg_pool.ConnectionPool` blocks. FastAPI runs
a plain `def` handler — and a plain `def` dependency — in a threadpool, where
blocking is harmless; an `async def` handler runs on the event loop, where one
blocking call stalls every other in-flight request. So **define every route and
dependency that touches the database as `def`, not `async def`.**

The alternative is `AsyncConnectionPool` with `async def` throughout: the more
scalable shape, and the one to move to if this ever needs it, but it makes every
call site `await`-flavoured for no measurable gain at twelve users. Either is
defensible; **mixing them is not**, and the failure mode stays invisible until
there is enough concurrency to notice.

---

## The files

| # | File | What it does | Closes |
|---|---|---|---|
| 1 | [`src/core/config.py`](#1-srccoreconfigpy) | Settings from env + `.env`, cached per process | — |
| 2 | [`src/core/schemas.py`](#2-srccoreschemaspy) | The `Health` response model | — |
| 3 | [`src/core/db/pool.py`](#3-srccoredbpoolpy) | One shared connection pool | — |
| 4 | [`src/api/deps.py`](#4-srcapidepspy) | A dependency yielding a pooled connection | — |
| 5 | [`src/api/routes/health.py`](#5-srcapirouteshealthpy) | `/ping` and `/health` | 2, 3, 4 |
| 6 | [`src/api/main.py`](#6-srcapimainpy) | App factory, lifespan, CORS, routers | 1, 5, 8 |
| 7 | [`src/core/db/migrate.py`](#7-srccoredbmigratepy) | Apply `migrations/*.sql`, exactly once each | 6, 7 |

**The order is dependency order** — each file only imports ones above it, so
nothing is a forward reference and nothing needs revisiting. The cost is that the
app is not runnable until file 6. If you want a server answering sooner, a
throwaway two-line `app = FastAPI()` in `main.py` is a fine thing to write early
and replace properly when you get there.

Every section ends with a **Check** you can run in a terminal. Run it. An
unverified file is one you will be debugging later, wearing another file's
symptoms.

---

### 1. `src/core/config.py`

A `pydantic-settings` model. Everything imports it, so it goes first, and it is
also the file where the unfamiliar library is — expect to spend longer here than
its length suggests.

| Field | Type | Default | Notes |
|---|---|---|---|
| `app_env` | `str` | `"local"` | `local` / `dev` / `prod` |
| `database_url` | `str` | local Docker URL | Deployed, Neon's **pooled** endpoint |
| `sleeper_base_url` | `str` | `https://api.sleeper.app/v1` | Overridable so tests can point at a fake |
| `allowed_origins` | `str` | `http://localhost:5173` | Comma-separated; expose a parsed list |
| `firebase_project_id` | `str \| None` | `None` | Spec 05. Absent means auth is not configured |

Plus a **cached accessor** — settings are read once per process, not per request.

**Decisions left to you.** Whether the origins parser is a property, a computed
field, or a validator; any is fine. Whether the cache is `@lru_cache` on a
`get_settings()` function or a module-level singleton — the `@lru_cache` version
is what FastAPI's own docs use and what makes it overridable in tests.

**Traps.**

- **Why `allowed_origins` is `str` and not `list[str]`.** For any complex field
  type, pydantic-settings **JSON-parses** the environment value first, so
  `ALLOWED_ORIGINS=http://a,http://b` against a `list[str]` field raises a JSON
  decode error rather than a useful one. A plain string plus a parsed property
  sidesteps it. (A `NoDecode` annotation also solves it; the string is less
  machinery.)
- **Parse defensively:** `a, b,` must yield two origins, not three with one
  empty. Strip and drop blanks.
- **Env names match case-insensitively**, so `DATABASE_URL` fills `database_url`
  with no aliasing needed. Prefixes and nesting need `model_config`.
- **`.env` resolves against the working directory**, not the module — running
  from a subdirectory silently reads nothing. Criterion 1 running with no `.env`
  at all is what keeps this from being load-bearing here.

**Check.** With no `.env` present:

```sh
PYTHONPATH=src python -c "from core.config import get_settings; print(get_settings())"
```

**Docs.** [FastAPI Settings tutorial](https://fastapi.tiangolo.com/advanced/settings/)
(start here — it builds this exact file) ·
[pydantic-settings](https://docs.pydantic.dev/latest/concepts/pydantic_settings/) ·
[`@lru_cache`](https://docs.python.org/3/library/functools.html#functools.lru_cache) ·
[field defaults](https://docs.pydantic.dev/latest/concepts/fields/)

---

### 2. `src/core/schemas.py`

The `Health` response model — a plain Pydantic model, no I/O, three fields.

| Field | Type | Notes |
|---|---|---|
| `status` | `str` | `"ok"` — the API answered |
| `env` | `str` | From `app_env` |
| `db` | `str` | `"ok"` or `"unavailable"` |

Trivial to write, and worth pausing on anyway: this is the first instance of the
pattern the whole project rests on. This class becomes the OpenAPI schema, which
becomes the TypeScript and Swift clients. Once file 6 is running, change a field
to `str | None`, reload `/openapi.json`, and watch the spec change — five minutes
that will make spec 04's criterion 14 obvious rather than mysterious.

**Check.** It imports. The real check is in file 5.

**Docs.** [Pydantic models](https://docs.pydantic.dev/latest/concepts/models/) ·
[Response Model](https://fastapi.tiangolo.com/tutorial/response-model/)

---

### 3. `src/core/db/pool.py`

One shared `psycopg_pool.ConnectionPool`, a context manager to borrow a
connection from it, and a close function.

- `min_size=0` — see Design decisions; this is the one that matters
- `max_size=10` — a starting point for a single container; revisit only if you
  ever run more than one
- Rows as **dicts** (`psycopg.rows.dict_row`), so callers index by column name
  rather than position
- **Bound how long a connection attempt waits.** The default is long enough that
  a down database looks like a hang instead of a failure — which is exactly what
  breaks criterion 4. This is the single most likely thing to get wrong in this
  spec.
- **Creating the pool must be safe to call twice.** The lifespan hook and a test
  fixture may both reach for it.

**Trap.** `psycopg2` answers do not apply. The pool is a separate `psycopg_pool`
package, and `dict_row` replaces `RealDictCursor`.

**Check.** With Docker **stopped**:

```sh
PYTHONPATH=src python -c "import core.db.pool"
```

Creating the pool object must not raise. If it does, `min_size` is wrong.

**Docs.** [Pool usage](https://www.psycopg.org/psycopg3/docs/advanced/pool.html)
— read the pool-startup-check part closely ·
[`ConnectionPool` API](https://www.psycopg.org/psycopg3/docs/api/pool.html) ·
[row factories](https://www.psycopg.org/psycopg3/docs/api/rows.html) ·
[psycopg3 vs psycopg2](https://www.psycopg.org/psycopg3/docs/basic/from_pg2.html)

---

### 4. `src/api/deps.py`

A single dependency that borrows a connection from the pool and yields it, so
FastAPI returns it afterwards whether or not the route raised.

A plain `def`, not `async def` — see Design decisions.

Nothing consumes it yet. It is small, and the whole content of it is
understanding what `yield` guarantees, which is why the docs link matters more
than the line count.

**Check.** Covered by file 5.

**Docs.** [Dependencies](https://fastapi.tiangolo.com/tutorial/dependencies/) →
[with `yield`](https://fastapi.tiangolo.com/tutorial/dependencies/dependencies-with-yield/)
— the second page is the one that matters, because it is what guarantees the
connection goes back

---

### 5. `src/api/routes/health.py`

An `APIRouter` with both endpoints.

**`/ping`** — returns a literal. Touches nothing. No dependency, no database.
That is the entire specification, and its emptiness is the point: it must be able
to answer when everything else is broken.

**`/health`** — takes the connection dependency, runs `SELECT 1`, and reports
`db: "ok"`. Then the part that takes the time: catch the connection failure and
return `"unavailable"` **with a `200`**, not a 500.

That last bit is worth being deliberate about. A degraded dependency is not a
failed request — the API answered correctly, and the answer is "the database is
away." Returning 500 here means an uptime checker restarts a perfectly healthy
process.

**The edge case that is not "down".** A *slow* database is worse than a stopped
one: the connection attempt hangs, the health check times out, and it reads as a
total outage. File 3's bounded wait is what prevents this; this is where you find
out whether you actually set it.

**Check.** With Docker up, `/health` → `db: "ok"`. Then `docker compose stop` →
`db: "unavailable"`, still `200`, **and it comes back fast**. Then `/ping` still
answers with Docker down. **Closes criteria 2, 3, and 4.**

**Docs.** [Bigger Applications](https://fastapi.tiangolo.com/tutorial/bigger-applications/)
for `APIRouter` ·
[Response Model](https://fastapi.tiangolo.com/tutorial/response-model/) ·
[`TestClient`](https://fastapi.tiangolo.com/tutorial/testing/)

---

### 6. `src/api/main.py`

Where it all gets wired, and the first point at which you can run something.

- **App factory** and the `app` object `uvicorn` imports
- **Lifespan** — open the pool at startup, close it at shutdown
- **CORS middleware** — fed from the parsed origins in file 1
- **Router registration** — mount the health router

**The thing to get right is that startup cannot require the database.** The
lifespan hook opens the pool; because of `min_size=0` that does not connect to
anything, so the app starts with Postgres stopped. Verify this rather than
assuming it — it is the criterion people fail by taking for granted that a pool
must connect eagerly.

**Check.** With Docker **stopped**:

```sh
PYTHONPATH=src uvicorn api.main:app --reload
```

It starts, `/ping` answers, `/docs` renders, and `/openapi.json` contains both
routes with `Health` as the response schema. Then CORS, which cannot be checked
honestly until a page exists on `:5173` (spec 07) — until then, the preflight
directly:

```sh
curl -i -X OPTIONS localhost:8000/ping \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: GET"
```

Look for an `access-control-allow-origin` header. **Closes criteria 1, 5, and 8.**

**Docs.** [Lifespan](https://fastapi.tiangolo.com/advanced/events/) ·
[CORS](https://fastapi.tiangolo.com/tutorial/cors/) ·
[Bigger Applications](https://fastapi.tiangolo.com/tutorial/bigger-applications/)

---

### 7. `src/core/db/migrate.py`

Applies numbered `*.sql` files from `migrations/` in filename order, recording
each in a tracking table so it runs exactly once.

Independent of everything except settings — you can build and test it in
isolation, and it is a reasonable thing to do on a different day from the rest.

- Tracking table: `public.schema_migrations` — `version` (text, PK),
  `applied_at` (timestamptz, default now)
- `version` is the filename stem, e.g. `0001_init`
- **Skip files whose stem does not start with a digit.** That is what excludes
  `ROLES.sql`, which is applied out-of-band — see spec 02
- **Each migration and its tracking insert commit together**, so a failure
  halfway through a set leaves earlier ones applied and the failing one *not*
  recorded — which is what makes a fix-and-rerun possible
- Print what it applies; say so when there is nothing to do
- Runnable as `PYTHONPATH=src python -m core.db.migrate`

> **Why plain SQL and not Alembic.** You can read every line that touches the
> database, and the schema is the thing you are trying to learn. Swap in Alembic
> if this outgrows itself; it will be obvious when.

**There are no numbered migrations yet** — spec 02 writes the first. So "reports
nothing to apply" is the whole test here, which feels anticlimactic and is
correct.

**Check.** Against a fresh database, twice:

```sh
PYTHONPATH=src python -m core.db.migrate
```

First run creates `public.schema_migrations` and reports nothing to apply; the
second reports the same and writes nothing. **Closes criteria 6 and 7.**

**Docs.** [Transactions](https://www.psycopg.org/psycopg3/docs/basic/transactions.html)
— the commit-together requirement ·
[`pathlib.Path.glob`](https://docs.python.org/3/library/pathlib.html#pathlib.Path.glob)

---

## Acceptance criteria

The scorecard. Each is claimed by a file above; this is the list to run at the
end, together, on a clean machine state.

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
   `public.schema_migrations` and reports there is nothing to apply.
7. Running the migration command twice is a no-op the second time.
8. A browser page served from `http://localhost:5173` can call the API without a
   CORS error.

## If you get stuck

The most common failure in this spec is a `ModuleNotFoundError` on `core` or
`api`, and it is almost always a missing `PYTHONPATH=src` rather than anything
wrong with your code. That prefix is on every command above for a reason:
`pyproject.toml` sets `[tool.uv] package = false` deliberately — this is an
application, not an installable library, so there is no editable install making
`src/` importable for you.

**Tests are the exception.** `[tool.pytest.ini_options]` already sets
`pythonpath = ["src"]`, so plain `pytest` works from the repo root. Only the
manual `python -m` and `uvicorn` invocations need the prefix.

## Learning references

This spec introduces every library the project uses, so read this before writing
code rather than looking things up after they break. Per-file docs links are in
the sections above; this is the orientation.

### The libraries, briefly

**[Pydantic](https://docs.pydantic.dev/latest/concepts/models/)** — a validation
library, and the foundation for everything else here. You declare a class with
typed fields; it coerces and validates whatever you hand it and raises a
structured error when the input does not fit. In this project it does triple
duty: validating settings, serialising responses, and supplying the field types
that FastAPI turns into the OpenAPI schema.

**[pydantic-settings](https://docs.pydantic.dev/latest/concepts/pydantic_settings/)**
— Pydantic pointed at configuration. Subclass `BaseSettings`, declare typed
fields with defaults, and on instantiation each field is filled from an
environment variable of the same name (case-insensitive), falling back to a
`.env` file, then to the default. It replaces
`os.environ.get("DATABASE_URL", "…")` scattered through the codebase. The payoff
is that a bad or missing value fails loudly at startup with a readable message,
and `app_env` arrives already typed instead of as a string every caller has to
re-check. Package docs: [pydantic-settings](https://github.com/pydantic/pydantic-settings) ·
[API reference](https://docs.pydantic.dev/latest/api/pydantic_settings/).

**[FastAPI](https://fastapi.tiangolo.com/tutorial/first-steps/)** — the web
framework. Its one big idea is that it reads your function signatures: a
Pydantic model in the return annotation becomes the response schema, a
`Depends(...)` parameter becomes an injected dependency, a path parameter
becomes a typed and validated argument. That is why the OpenAPI spec is free —
it is derived from annotations you were writing anyway, which is the whole
premise of [ADR 0002](../decisions/0002-ios-first-openapi-python-api.md).

**[psycopg 3](https://www.psycopg.org/psycopg3/docs/basic/usage.html)** — the
PostgreSQL driver, with `psycopg_pool` as its connection pool. Opening a
Postgres connection costs a round trip and a server-side process, so the pool
keeps a few open and lends them out; you borrow one in a `with` block and it
returns itself. Note the version: psycopg **3** is a different API from the
`psycopg2` most Stack Overflow answers assume.

**uvicorn** — the ASGI server that actually runs the app.
`uvicorn api.main:app` means "import `app` from `api.main` and serve it." You
will not configure it beyond `--reload` for a long time.
([repo](https://github.com/encode/uvicorn) ·
[FastAPI's page on running it](https://fastapi.tiangolo.com/deployment/manually/))

### Read these first, in this order

| | Read | Why it is on the list |
|---|---|---|
| 1 | [FastAPI — First Steps](https://fastapi.tiangolo.com/tutorial/first-steps/) | Ten minutes, and the rest of the docs assume it |
| 2 | [Settings and Environment Variables](https://fastapi.tiangolo.com/advanced/settings/) | **The best pydantic-settings introduction that exists** — it builds file 1 almost exactly, and explains why it is cached |
| 3 | [pydantic-settings concepts](https://docs.pydantic.dev/latest/concepts/pydantic_settings/) | The reference behind #2: precedence order, `.env` handling, `model_config` |
| 4 | [Response Model](https://fastapi.tiangolo.com/tutorial/response-model/) | How `Health` becomes a schema in `openapi.json` |
| 5 | [Dependencies](https://fastapi.tiangolo.com/tutorial/dependencies/) → [with `yield`](https://fastapi.tiangolo.com/tutorial/dependencies/dependencies-with-yield/) | File 4 in full |
| 6 | [Connection pools](https://www.psycopg.org/psycopg3/docs/advanced/pool.html) | Read the pool-startup-check part carefully — it is where `min_size=0` lives |

Skip the async pages. Per Design decisions, this spec is deliberately
synchronous.

## Done when

All eight criteria pass, `ruff check src` is clean, and `/docs` shows both
endpoints with correct response schemas.
