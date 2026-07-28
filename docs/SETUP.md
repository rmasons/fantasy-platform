# Setup — first run, in order

From a fresh clone to a running API with real data. **Do these in order** — each
step produces something the next one needs.

There is no application code here yet — that is deliberate. This page gets your
environment and accounts ready; **[docs/build/](build/)** specifies what to
build, and you write it.

Stack rationale: [ADR 0002](decisions/0002-ios-first-openapi-python-api.md).
Auth: [ADR 0001](decisions/0001-auth-provider-and-native-clients.md).

## What you're setting up, and why

| # | Thing | Why | Needed before |
|---|---|---|---|
| 1 | Python env + deps | — | everything |
| 2 | Local Postgres (Docker) | Dev database; no cloud account needed | building spec 01 |
| 3 | Firebase project ID | Verifies ID tokens from both clients | build spec 05 |
| 4 | Neon project | Hosted Postgres for `dev` / `test` / `main` | deploying |
| 5 | Cloud Run | Hosts the API | deploying |

**Steps 1–2 are all you need to start.** Then go to
**[docs/build/](build/)** — spec 01 builds the config, pool, migration runner,
and health routes; spec 02 writes the first migration. Steps 3–5 here are
deferrable until there's an auth-gated route or something worth deploying.

> There is **no application code in this repo** — that is deliberate. It is
> specified in `docs/build/` and you write it. See the "specs, not scaffolds"
> rule in [AGENTS.md](../AGENTS.md).

---

## 1 — Python environment

Python 3.12+.

```sh
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
```

> `pyproject.toml` sets `package = false` — this is an application, not a
> library. Everything runs with `PYTHONPATH=src`.
>
> The dependency list predates the build specs; you will add to it as you go
> (`pytest-httpserver` for spec 03, for one).

## 2 — Local Postgres

```sh
docker compose up -d
docker compose ps        # expect "healthy"
```

Bound to `127.0.0.1:5432`, so it is not reachable from the network. Credentials
are `fantasy` / `fantasy` / `fantasy` — fine locally, never used anywhere else.

```sh
export DATABASE_URL="postgresql://fantasy:fantasy@127.0.0.1:5432/fantasy"
```

Better: copy `.env.example` to `.env` and fill it in, so you aren't re-exporting
per shell.

## Next — build it

Everything from here is written by you, from the specs in
**[docs/build/](build/)**:

| Spec | Gets you |
|---|---|
| [01 Foundation](build/01-foundation.md) | Config, DB pool, migration runner, `uvicorn` running, `/ping` + `/health`, `/docs` |
| [02 Schema & migrations](build/02-schema-and-migrations.md) | `app.*` / `sleeper.*` split, first migration |
| [03 Sleeper client](build/03-sleeper-client.md) | Typed read-only Sleeper client |
| [04 Standings slice](build/04-standings-slice.md) | Ingest → compute → endpoint → OpenAPI |
| [05 Auth](build/05-auth.md) | Everything below in step 3 |

Once spec 01 is built, the commands in [AGENTS.md](../AGENTS.md) apply —
`uvicorn` on :8000, `/docs` for the live OpenAPI UI, and
`python -m core.db.migrate` for migrations.

## 3 — Firebase (for auth-gated routes)

Use the **same project as fantasy-tds** — shared UIDs are the point (ADR 0001).
The project ID is in `fantasy-tds/.env` as `PUBLIC_FIREBASE_PROJECT_ID`.

```sh
# in .env
FIREBASE_PROJECT_ID=<project-id>
```

`firebase-admin` verifies ID tokens against Google's public keys. **Application
Default Credentials are only needed if you also read Firestore** — for pure token
verification the project ID is enough.

Both clients send `Authorization: Bearer <firebase-id-token>`. No session
cookies, so the web and iOS auth paths are identical.

> More: [Firebase Admin SDK](https://firebase.google.com/docs/admin/setup) ·
> [Firebase Auth web](https://firebase.google.com/docs/auth/web/start) ·
> [Firebase Auth iOS](https://firebase.google.com/docs/auth/ios/start)

## 4 — Neon (hosted Postgres)

Create a project at [neon.com](https://neon.com). Free tier: 0.5 GB and 100
CU-hours per project — orders of magnitude more than one league needs.

**Create a branch per environment** (`dev`, `test`, `main`) — each is a
copy-on-write fork, so migrations can be rehearsed against real-shaped data
before promotion. Ten branches on the free tier.

Copy the **pooled** connection string (Neon's PgBouncer endpoint) into
`DATABASE_URL` for the deployed API.

> **Expect a cold start.** Free-tier computes suspend after 5 minutes idle and
> auto-resume on the next connection — no manual restore, but the first request
> after idle is slow. That behavior is why Neon was chosen over Supabase, whose
> free tier pauses after 7 days and requires a manual restore — bad for an app
> that goes quiet February to July.
>
> More: [Neon scale to zero](https://neon.com/docs/introduction/scale-to-zero) ·
> [branching](https://neon.com/docs/introduction/branching)

## 5 — Cloud Run (hosting the API)

The API needs a **container**, not serverless functions: `psycopg-pool` keeps
long-lived connections, which per-invocation runtimes cannot hold.

Needs a `Dockerfile` (not yet written — see HANDOFF). Roughly:

```sh
gcloud run deploy fantasy-api --source . --region us-central1 \
  --set-env-vars FIREBASE_PROJECT_ID=<id> \
  --set-secrets DATABASE_URL=projects/<proj>/secrets/database-url:latest
```

Scales to zero, so idle cost is nothing — and combined with Neon's suspend, the
first request after a quiet period pays both cold starts (~1–2s + a few hundred
ms). Fine for twelve users.

**Simpler alternative:** Railway, which needs a `Procfile` instead of a
`Dockerfile` — one line for the web process, plus a separate cron service for
ingestion. If deployment friction is costing more than it's teaching, take
Railway.

> More: [Cloud Run](https://cloud.google.com/run/docs/deploying-source-code) ·
> [Railway](https://docs.railway.app/)

---

## Ingestion

```sh
PYTHONPATH=src python -m ingestion backfill --league-id <real_id>
PYTHONPATH=src python -m ingestion daily
```

Deployed, `daily` runs as a scheduled job — Cloud Scheduler hitting a job, or a
Railway cron service. Off-season a daily run is plenty; in-season add a Tuesday
run once matchups settle Monday night.

## Where to read more

| Topic | File |
|---|---|
| Architecture and key patterns | [README.md](../README.md) |
| Working model, TDD rules, commands | [AGENTS.md](../AGENTS.md) |
| Current state, next steps, known gaps | [HANDOFF.md](../HANDOFF.md) |
| What to build, in order | [build/](build/) |
| Slice sequence to parity and beyond | [ROADMAP.md](ROADMAP.md) |
| Why this stack | [ADR 0002](decisions/0002-ios-first-openapi-python-api.md) |
| Why Firebase Auth | [ADR 0001](decisions/0001-auth-provider-and-native-clients.md) |
| Branch model and review gates | [pipeline.md](pipeline.md) |

## Troubleshooting

| Symptom | Cause |
|---|---|
| `ModuleNotFoundError: api` / `core` | Missing `PYTHONPATH=src` |
| `connection refused` on 5432 | `docker compose up -d` not run, or container unhealthy |
| Migration errors on first run | Your first migration is spec 02's; re-read its field tables and constraints |
| `/docs` empty or missing routes | Router not registered in the app factory — spec 01 |
| 401 on every request | `FIREBASE_PROJECT_ID` unset, or the client is sending a token from a different project |
| First request after idle takes seconds | Neon + Cloud Run cold starts. Expected on free tiers |
