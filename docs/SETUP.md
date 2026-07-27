# Setup — first run, in order

From a fresh clone to a running API with real data. **Do these in order** — each
step produces something the next one needs.

Nothing in this repo has ever been executed. Treat the scaffold as a starting
point, not a verified base: expect to fix things in steps 3–4.

Stack rationale: [ADR 0002](decisions/0002-ios-first-openapi-python-api.md).
Auth: [ADR 0001](decisions/0001-auth-provider-and-native-clients.md).

## What you're setting up, and why

| # | Thing | Why | Needed before |
|---|---|---|---|
| 1 | Python env + deps | — | everything |
| 2 | Local Postgres (Docker) | Dev database; no cloud account needed | 3 |
| 3 | Migrations | Creates the schema | 4 |
| 4 | Run the API | Confirms the scaffold works; `/docs` is the live OpenAPI UI | 5 |
| 5 | Firebase project ID | Verifies ID tokens from both clients | auth-gated routes |
| 6 | Neon project | Hosted Postgres for `dev` / `test` / `main` | deploying |
| 7 | Cloud Run | Hosts the API | deploying |

**Steps 1–4 are enough to start building.** Steps 5–7 are deferrable until
there's an auth-gated route or something worth deploying.

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

## 3 — Apply migrations

```sh
PYTHONPATH=src python -m core.db.migrate
```

Applies `migrations/*.sql` in filename order.

> `0001_init.sql` was written before the Convex detour and has never run. If it
> errors, fix it — do not work around it. Read `ROLES.sql` too; it may assume a
> role setup that Neon provisions differently than local Postgres.

Verify:

```sh
docker compose exec db psql -U fantasy -d fantasy -c '\dt'
```

## 4 — Run the API

```sh
PYTHONPATH=src uvicorn api.main:app --reload
```

- http://localhost:8000/health → expect `{"status": "ok"}` or similar
- **http://localhost:8000/docs** → the interactive OpenAPI UI

That `/docs` page is worth pausing on: it is generated from your Pydantic models,
and it is the same spec that will generate the TypeScript and Swift clients. If
an endpoint looks wrong there, it is wrong everywhere.

The raw spec is at http://localhost:8000/openapi.json.

## 5 — Firebase (for auth-gated routes)

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

## 6 — Neon (hosted Postgres)

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

## 7 — Cloud Run (hosting the API)

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

**Simpler alternative:** Railway. The existing `Procfile` already targets it, and
ingestion is already modelled as a separate cron service there. If deployment
friction is costing more than it's teaching, take Railway.

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
| Slice sequence to parity and beyond | [ROADMAP.md](ROADMAP.md) |
| Why this stack | [ADR 0002](decisions/0002-ios-first-openapi-python-api.md) |
| Why Firebase Auth | [ADR 0001](decisions/0001-auth-provider-and-native-clients.md) |
| Branch model and review gates | [pipeline.md](pipeline.md) |

## Troubleshooting

| Symptom | Cause |
|---|---|
| `ModuleNotFoundError: api` / `core` | Missing `PYTHONPATH=src` |
| `connection refused` on 5432 | `docker compose up -d` not run, or container unhealthy |
| Migration errors on first run | Expected — `0001_init.sql` has never executed. Fix it, don't skip it |
| `/docs` empty or missing routes | Router not registered in `api/main.py` |
| 401 on every request | `FIREBASE_PROJECT_ID` unset, or the client is sending a token from a different project |
| First request after idle takes seconds | Neon + Cloud Run cold starts. Expected on free tiers |
