# HANDOFF

> **⚠️ Keep this file current.** Update it *during* and at the *end* of every working
> session — whenever state materially changes (a slice ships, a decision lands, a
> blocker clears, a new open question appears). This is the first thing to read when
> resuming work. A stale handoff means lost context. Treat updating it as part of
> finishing a task, not an afterthought.

_Last updated: 2026-06-27_

## What this is

**fantasy-platform** — a from-scratch rebuild of the fantasy-football companion app
([fantasy-tds](https://github.com/rmasons/fantasy-tds)) on a decoupled architecture:

- **Python** FastAPI API + scheduled ingestion, over a (target: private) Postgres.
- **SvelteKit** web frontend in `web/` that consumes the API over HTTP (swappable;
  reuses fantasy-tds UI/styling).
- The API is the **only** DB client. **Firebase Auth** stays (Google login).

Working model + TDD loop: see [AGENTS.md](AGENTS.md). Architecture rationale currently
lives in the **fantasy-tds** repo docs (`TARGET_ARCHITECTURE.md`,
`STORAGE_AND_INGESTION.md`, `PHASE1_APP_DATA_MIGRATION.md`).

## Status at a glance

### ✅ Done
- **Backend scaffold:** `core/` (config, db pool, plain-SQL migrate runner, Sleeper
  client), `api/` (FastAPI: `/ping`, `/health`, `/leagues/{id}`, `/leagues/{id}/live`),
  `ingestion/` (daily, backfill), `migrations/0001_init.sql` (`app.*` + `sleeper.*`
  schemas, role split in `migrations/ROLES.sql`).
- **Frontend `web/`:** SvelteKit + Svelte 5 + Tailwind v4 + Vitest; standings page
  built test-first, rendering off a fixture (no backend required). 9 tests green.
- **CI/CD:** public repo; `dev → test → main`; advisory review on `dev`; **BLOCKING**
  `promotion-review` + `verify` (pytest + vitest) on `test`/`main`; branch protection
  (`enforce_admins`) ON; `CLAUDE_CODE_OAUTH_TOKEN` set. Validated end-to-end.

### 🔨 In progress — Standings slice
Contract: [docs/slices/standings.md](docs/slices/standings.md).
- **Frontend: DONE** — fixture-backed; flips to live by setting `VITE_API_BASE_URL`.
- **Backend: PENDING (Mason)** — TDD: `compute_standings()` (red→green) →
  `migrations/0002_standings.sql` (`sleeper.league_users`, `sleeper.rosters`) → ingest
  users + rosters → `GET /leagues/{id}/standings`.

### ⛔ Blocked on Mason
- Install **uv** + **Docker** (local backend dev).
- Build the standings backend (above).
- Provide a **Sleeper league ID** — real data, and replaces the web's hardcoded `12345`.

### ❓ Open decisions
- **DB host** — leaning **Crunchy Bridge** (~$10/mo flat, private-capable); not
  finalized; current pricing not yet pulled.
- **Deploy shape** — the API tier is already in the scaffold. "Private DB from day
  one" would co-locate API + ingestion with the DB on one platform and run ingestion
  as a **platform cron** (not GitHub Actions). Decide at deploy time. Firebase prod
  creds (`FIREBASE_PROJECT_ID` + service account) needed then.

## Run it (quick ref — full setup in [README.md](README.md))
- Backend: `docker compose up -d` → `PYTHONPATH=src uv run python -m core.db.migrate`
  → `PYTHONPATH=src uv run uvicorn api.main:app --reload`
- Backend tests: `PYTHONPATH=src pytest` · Ingest: `PYTHONPATH=src uv run python -m ingestion daily`
- Web: `cd web && npm run dev` · Web tests: `cd web && npx vitest run`

## Next slices (after standings)
matchups · rosters · transactions · drafts · superlatives. Each: Opus writes the
contract → backend (Mason, TDD) + frontend (Sonnet, fixture-first) in parallel →
fresh-context review → merge through the pipeline.

## Session log
- **2026-06-27** — Scaffolded the Python backend + `web/` frontend; built the standings
  frontend test-first; stood up the public repo + enforced `dev → test → main` pipeline
  (advisory / promotion-review / verify); the gate caught & we fixed a CI-only `$lib`
  absolute-path bug; synced all branches. Paused awaiting the standings backend.
