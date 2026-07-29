# HANDOFF

> **⚠️ Keep this file current.** Update it *during* and at the *end* of every working
> session — whenever state materially changes (a slice ships, a decision lands, a
> blocker clears, a new open question appears). This is the first thing to read when
> resuming work. A stale handoff means lost context. Treat updating it as part of
> finishing a task, not an afterthought.

_Last updated: 2026-07-27_

## What this is

**fantasy-platform** — an API-first rebuild of the fantasy-football companion app
([fantasy-tds](https://github.com/rmasons/fantasy-tds)), which remains the running
production app and the parity checklist.

- **FastAPI + Pydantic** on **Neon Postgres** is the entire backend. Pydantic
  models generate the **OpenAPI spec**, which generates **both clients** — so
  logic lives in one place and cannot drift.
- **Svelte 5 + Vite SPA** for web (static; no server, therefore no data path
  except the API).
- **SwiftUI** for iOS, using `swift-openapi-generator` — the primary target.
- **Firebase Auth** for identity (same project as fantasy-tds), ID tokens
  verified server-side by `firebase-admin`.

**iOS is the primary goal.** That is the decision everything else hangs off; see
[ADR 0002](docs/decisions/0002-ios-first-openapi-python-api.md). Auth rationale
is [ADR 0001](docs/decisions/0001-auth-provider-and-native-clients.md), which
stands unchanged.

Working model + TDD loop: [AGENTS.md](AGENTS.md). Architecture: [README.md](README.md).

## Status at a glance

### ✅ Done

- **Build specs in [`docs/build/`](docs/build/)** — 01 Foundation, 02 Schema &
  migrations, 03 Sleeper client, 04 Standings slice, 05 Auth. Each carries the
  goal, the design decisions *and their reasoning*, a precise contract,
  checkable acceptance criteria, and the Sleeper edge cases. **Mason writes the
  implementation from these** — see the "specs, not scaffolds" rule in
  [AGENTS.md](AGENTS.md).
- **`migrations/ROLES.sql`**; `docker-compose.yml` for local Postgres bound to
  127.0.0.1.
- **CI/CD:** `dev → test → main`; advisory review on `dev`; **BLOCKING**
  `promotion-review` on `test`/`main`; branch protection (`enforce_admins`) ON;
  `CLAUDE_CODE_OAUTH_TOKEN` set. Validated end-to-end.
- **Decisions recorded:** ADR 0001 (Firebase Auth), ADR 0002 (iOS-first,
  OpenAPI-contracted Python API).
- **Repo cleaned to only what is live** — the SvelteKit `web/` app, the
  scaffold's `tests/`, the Railway `Procfile`, and `docs/slices/` are gone.
  `StandingsTable.svelte` and its 9 tests are stack-agnostic and recoverable at
  `8cd19f0~1` for build spec 07.

### 🚧 In progress

- **Build spec 01 — Foundation.** Files 1–4 of seven are written:
  `src/core/config.py`, `src/core/schemas.py`, `src/core/db/pool.py`,
  `src/api/deps.py`. Remaining: `routes/health.py`, `api/main.py`,
  `core/db/migrate.py`. No acceptance criteria are formally green yet — the app
  is not runnable until file 6 — but the pieces built so far are verified
  against a live local Postgres.

### ⚠️ Reverted

The **Convex backend** (2026-07-06 → 2026-07-27) is removed — see ADR 0002. It
was adopted as a vehicle for learning Convex, before iOS became the goal; once
iOS came first, `convex-swift` (0.8.1, five months stale, no offline, no
optimistic updates) could not carry a native client, and Convex emits no API
contract. Everything it did is now done by FastAPI, Postgres, and the OpenAPI
spec.

---

## Phase 1 — Stand it up (one-time, Mason does this)

**Steps 1–2 are done.** `.venv` exists, local Postgres is running in Docker, and
`.env` has been copied from `.env.example`. Everything past that is untouched.
Ordered guide: **[docs/SETUP.md](docs/SETUP.md)**. Short version: Python env →
local Postgres via Docker → migrate → run the API → create a Neon project →
point the API at Firebase for token verification.

Local-only is enough to start; Neon and Cloud Run are not needed until there is
something worth deploying.

---

## Phase 2 — Build it

Work through [`docs/build/`](docs/build/) in order. 01 → 02 → 03 gets a running
API on a real schema; 04 is the first feature that goes end to end.

| # | Spec | Gets you |
|---|---|---|
| 01 | [Foundation](docs/build/01-foundation.md) | Config, DB pool, migration runner, app entry, health routes |
| 02 | [Schema & migrations](docs/build/02-schema-and-migrations.md) | The `app.*` / `sleeper.*` split and the first migration |
| 03 | [Sleeper client](docs/build/03-sleeper-client.md) | Typed, tested read-only Sleeper client |
| 04 | [Standings slice](docs/build/04-standings-slice.md) | Ingest → compute → endpoint → OpenAPI |
| 05 | [Auth](docs/build/05-auth.md) | Firebase token verification, `users` table, Sleeper link |

Specs 06 (OpenAPI clients + CI drift gate), 07 (web SPA), and 08 (iOS) are
deliberately unwritten — speccing them now means designing against shapes that
do not exist yet. They get written when you reach them.

Ask for a coverage pass once a spec's acceptance criteria are green; per
[AGENTS.md](AGENTS.md) you implement, a session writes the tests as a review.

## Known gaps to address later

- **Sleeper `null` vs absent fields** — explicit JSON `null` for
  `previous_league_id` / `avatar` / `metadata.team_name`, and a missing
  `fpts_decimal` that yields `NaN`. Full detail and required behaviour in
  [build spec 04](docs/build/04-standings-slice.md#edge-cases).
- **`users` table** — ADR 0001 specifies a table keyed by Firebase UID, shaped to
  mirror fantasy-tds's `UserProfile` so the existing Firestore collection imports
  by UID with the twelve real Sleeper links intact. Not yet written as a
  migration. Do it with the Sleeper-linking slice.
- **`verify.yml` runs ruff + pytest** and no-ops loudly while there is nothing
  to check. **The OpenAPI drift gate is still missing** — add it before the
  first slice lands. The two Claude review workflows are unchanged.
- **No deployment config.** Cloud Run needs a `Dockerfile`; Railway needs a
  `Procfile` (the old one was removed as premature). Both paths are documented
  in [SETUP.md](docs/SETUP.md) — write one when there is something to deploy.
- **Neon is a public endpoint.** The scaffold's comments assume Railway's private
  Postgres ("no public exposure"). Accepted in ADR 0002, but revisit before the
  FAAB and dues ledgers land.
- **Sleeper league ID** — the real one is still needed for any ingestion run.
- **`.env` holds the `your-firebase-project-id` placeholder.** Spec 05's
  criterion 8 branches on `firebase_project_id` being *unset*; a placeholder
  string reads as set, so the local bypass will not engage and `firebase-admin`
  will initialise against a project that does not exist. Comment the line out
  until the real ID is in hand.
- **`.venv` console scripts have stale shebangs.** `pip`, `pytest`, and `dotenv`
  point at the retired `~/Desktop/development` path and will not execute;
  `uvicorn` was reinstalled after the move and is fine. Use
  `.venv/bin/python -m <tool>`, or recreate the venv. `ruff` is not installed at
  all — only `pytest` made it in from the dev extras.
- **No web or iOS client exists.** `web/` (SvelteKit) was removed in the
  cleanup; `StandingsTable.svelte`, its 9 tests, and the standings fixture are
  recoverable from git at `8cd19f0~1` and should be ported when build spec 07 is
  written.

## Queued audits — good next-session tasks

- **`migrations/ROLES.sql` has never been applied.** It defines `ingest_rw` /
  `web_rw` least-privilege roles and is applied out-of-band, not by the
  migration runner (managed hosts provision roles differently — Neon does not
  hand you superuser). Read it before the first deploy; spec 02 explains the
  ownership split it enforces.
- **OpenAPI drift gate** — decide the mechanism (commit generated clients, CI
  regenerates and diffs) and add it to `verify.yml` before the first slice
  lands, so it is never retrofitted.
- **iOS project skeleton** — worth standing up early enough to prove the
  generated Swift client works end to end, but not before an endpoint exists.

## Next slices (after standings)

Full sequenced plan: **[docs/ROADMAP.md](docs/ROADMAP.md)**. The feature
sequence and dependencies are stack-agnostic and survive the pivot intact.

Foundations first (players, nflState, season chains), then matchups → rosters →
transactions → drafts → superlatives, then the fantasy-tds parity buildouts, then
the new features. Per-slice pattern: migration → pure logic → ingestion → route +
response model → regenerate clients → web/iOS view.

## Session log

- **2026-06-27** — Scaffolded Python/FastAPI backend + `web/` frontend; built the
  standings frontend test-first; stood up `dev → test → main`; gate validated.
- **2026-07-06** — Pivoted backend to Convex as a Convex-learning vehicle. Python
  scaffold marked superseded. Full `convex/` scaffold written; web wired to
  `convex-svelte`. Blocked on `npx convex dev` first run.
- **2026-07-07** — Plan audit; fixed doc inaccuracies; flagged latent ingest bugs;
  added `docs/ROADMAP.md` with parity buildouts and a beyond-parity section.
- **2026-07-27** — Scoped iOS feasibility, which cascaded into two decisions.
  **(1)** Replaced `@convex-dev/auth` with **Firebase Auth** — the provider
  already in production — wired as a custom OIDC provider. Decider was UID
  continuity: fantasy-tds's `users` collection holds twelve real user↔Sleeper
  links, and shared UIDs let them import unchanged while both apps run side by
  side. ([ADR 0001](docs/decisions/0001-auth-provider-and-native-clients.md),
  commit `0902282`.) **(2)** Then **iOS became the primary goal**, which demoted
  Convex from "the point" to "a means" — and it does not survive that. Research
  found `convex-swift` at 0.8.1, five months stale, 47 stars, no offline reads,
  no optimistic updates, and an open data race on the auth path; and Convex emits
  no OpenAPI spec, so it cannot satisfy the one-contract-two-clients requirement
  without hand-rolling it. Reverted to the **FastAPI + Pydantic + Postgres**
  scaffold that was already here: Python is Mason's working language, FastAPI
  generates the OpenAPI spec for free, and the analytical roadmap suits SQL.
  Neon over Supabase on seasonal idle behavior (auto-resume vs. 7-day pause and
  manual restore); Cloud Run because `psycopg-pool` needs a long-lived process;
  Svelte SPA over SvelteKit because a serverless client makes drift structurally
  impossible. ([ADR 0002](docs/decisions/0002-ios-first-openapi-python-api.md).)
  Still blocked on Phase 1 — nothing in this repo has ever been run.
- **2026-07-27 (later)** — Switched working mode: **build specs instead of
  scaffolds**. The 454-line `src/` scaffold was written *for* Mason by an earlier
  session, which defeats the point of a project whose purpose is learning API
  development in Python. Deleted it (recoverable at `38813c3~1`) and replaced it
  with `docs/build/01`–`05`, which carry the scaffold's design reasoning —
  `app.*`/`sleeper.*` ownership split, `min_size=0` so the API boots with the DB
  down, `/ping` vs `/health` as liveness vs readiness, the local-auth bypass and
  why it must fail loudly in prod — as *requirements* rather than as code.
  Recorded the rule in AGENTS.md so future sessions don't re-scaffold.
- **2026-07-27 (cleanup)** — Pruned the repo to what is actually live. Removed
  the SvelteKit `web/` app (superseded by build spec 07; `StandingsTable.svelte`
  and its 9 tests recoverable at `8cd19f0~1`), `tests/test_health.py` (tested a
  deleted route), the Railway `Procfile` (premature), and `docs/slices/`
  (superseded by `docs/build/`). Rewrote `verify.yml` for ruff + pytest — it
  previously ran web vitest and svelte-check, which deleting `web/` would have
  broken; both steps now no-op with a visible `::notice::` so a green check
  never quietly means "skipped". What remains is docs, specs, CI, dependency
  manifests, `docker-compose.yml`, and `migrations/ROLES.sql`.
- **2026-07-27 (spec usability)** — The specs said what had to be true but never
  what to do first, and the contract, the reasoning, and the traps for any one
  file were scattered across four sections. **Restructured all five around
  files.** Each now opens with a summary table (what's new, size, how you know it
  works), then a manifest in dependency order, then **one self-contained section
  per file**: what it does → contract → decisions left open → traps → a terminal
  **Check** → which criteria it closes → docs links. Acceptance criteria remain
  as a scorecard; the standalone "Edge cases" sections were distributed into the
  files they belong to. Ordering that isn't obvious is stated with its reason —
  04 starts with the pure function, 05 with the migration and the config guard.
  Where a file is built in passes (03's client, 05's `deps.py`) that stays inside
  its own section. Spec 01 also gained a **Learning references** section, since
  it introduces every library at once. Spec 02 is organised per *table*, being
  one SQL file. `docs/build/README.md` rewritten to match. Two substantive
  additions rather than restatements: **spec 01 now specifies sync `def`
  handlers** — the sync `psycopg_pool` would block the event loop under
  `async def`, and the spec was silent on it — and **spec 03 flags that
  `pytest-httpserver` is not in `requirements-dev.txt`** and that
  `@pytest.mark.live` needs registering in `pyproject.toml`. Fixed a stale
  pointer in spec 02 to `migrations/0001_init.sql`, deleted in `8cd19f0` and now
  cited by git path. All links, anchors, and relative paths verified.
- **2026-07-27 (spec 01, files 1–4)** — First implementation code in the repo.
  `core/config.py` (settings + `@lru_cache`d `get_settings()`),
  `core/schemas.py` (`Health`), `core/db/pool.py`, `api/deps.py` (`get_db`
  yielding a pooled connection, plus a `DbConn` annotated alias). Verified
  against live local Postgres: settings resolve from `.env`, `dict_row` returns
  dicts, a borrow against an unreachable database fails in **5.00s** rather than
  the 30s default, and the dependency returns its connection to the pool.
  Version-specific findings worth not rediscovering, all confirmed against the
  installed versions rather than assumed:
  **(1)** `psycopg_pool` 3.3.1 emits a `DeprecationWarning` unless `open=` is
  passed explicitly — the default flips to `False` in a future release. The pool
  is constructed `open=False` and started by `open_pool()` from the lifespan
  hook, which is also what keeps importing the module from connecting to
  anything. Borrowing before that raises `PoolClosed`, not `PoolTimeout` — the
  migration runner (file 7) has no lifespan and must open the pool itself.
  **(2)** `row_factory` is a *connection* argument, so it rides in
  `ConnectionPool(kwargs={...})`; there is no `cursor_factory` and no
  `RealDictCursor` — psycopg2 answers actively mislead here.
  **(3)** Pydantic v2 does **not** infer a default from `str | None` the way v1
  did, so `firebase_project_id` needed an explicit `= None`. Same distinction
  resurfaces as spec 04's criterion 14, where nullable-vs-optional changes the
  OpenAPI `required` array and therefore the generated Swift.
  **(4)** `pydantic-settings` ignores `.env` entirely unless `model_config` sets
  `env_file`, and its `extra` defaults to `forbid` — which only governs keys in
  the dotenv file, not unmatched environment variables.
  Remaining in spec 01: `routes/health.py`, `api/main.py`, `core/db/migrate.py`,
  and the parsed-origins accessor on `Settings` that CORS needs.
