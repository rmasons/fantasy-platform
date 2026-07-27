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

- **Python scaffold (`src/`, 454 lines)** — FastAPI app + deps, health and
  leagues routes, Pydantic schemas, config, Postgres pool + migrate runner,
  Sleeper HTTP client, ingestion `backfill` / `daily` entrypoints. **Written,
  never run.**
- **`migrations/0001_init.sql`** + `ROLES.sql`; `docker-compose.yml` for local
  Postgres bound to 127.0.0.1.
- **CI/CD:** `dev → test → main`; advisory review on `dev`; **BLOCKING**
  `promotion-review` on `test`/`main`; branch protection (`enforce_admins`) ON;
  `CLAUDE_CODE_OAUTH_TOKEN` set. Validated end-to-end.
- **Decisions recorded:** ADR 0001 (Firebase Auth), ADR 0002 (iOS-first,
  OpenAPI-contracted Python API).
- **Salvage from the Convex detour:** `StandingsTable.svelte` + 9 passing tests,
  and the standings fixture. The component is stack-agnostic and ports directly.

### ⚠️ Reverted

The **Convex backend** (2026-07-06 → 2026-07-27) is removed — see ADR 0002. It
was adopted as a vehicle for learning Convex, before iOS became the goal; once
iOS came first, `convex-swift` (0.8.1, five months stale, no offline, no
optimistic updates) could not carry a native client, and Convex emits no API
contract. Everything it did is now done by FastAPI, Postgres, and the OpenAPI
spec.

---

## Phase 1 — Stand it up (one-time, Mason does this)

**Nothing here has ever been run.** Ordered guide: **[docs/SETUP.md](docs/SETUP.md)**.
Short version: Python env → local Postgres via Docker → migrate → run the API →
create a Neon project → point the API at Firebase for token verification.

Local-only is enough to start; Neon and Cloud Run are not needed until there is
something worth deploying.

---

## Phase 2 — Rebuild the standings slice (TDD order)

The slice is unchanged in *contract* and entirely changed in *mechanics*.
`docs/slices/standings.md` still describes the Convex version — **rewrite it
first**; the data shape and ranking rules in it are still correct.

### 2a — Migration + schema

`migrations/0002_*.sql` for `leagues`, `league_users`, `rosters`. `0001_init.sql`
predates the Convex detour — read it before adding, it may already cover this.

### 2b — Pure logic: `compute_standings` (unit, no DB)

`src/core/standings.py` + `tests/core/test_standings.py`.
Contract: ranks by wins desc, ties broken by fpts desc; null avatar handled;
joins display names from `league_users`; `avatar` is the full
`https://sleepercdn.com/avatars/thumbs/{id}` URL, not the bare ID.

### 2c — Ingestion: backfill + idempotency

Extend `src/ingestion/backfill.py` to walk `previous_league_id`. Tests assert
running twice yields the same row count.

**Fix the known Sleeper edge cases here** (carried over — they are data facts,
not Convex facts): Sleeper returns explicit `null` for `previous_league_id`,
`avatar`, and `metadata.team_name`; `fpts_decimal` / `fpts_against_decimal` can
be absent and yield `NaN`. Coerce at the boundary.

### 2d — Route + response model

`GET /leagues/{league_id}/standings` returning `list[StandingRow]`. Tests via
`TestClient`: shape, ordering, 404 for unknown league, auth gating.

### 2e — Regenerate clients, wire the web SPA

Replace `web/` (SvelteKit) with Svelte 5 + Vite. Port `StandingsTable.svelte`
and its 9 tests. Data comes from the generated TS client — no fixture, no
hand-written types.

### 2f — Auth

`current_user` dependency verifying Firebase ID tokens via `firebase-admin`;
sign-in button on the web client using the Firebase web SDK. The pattern is
already working in `fantasy-tds/src/routes/login/+page.svelte`.

---

## Known gaps to address later

- **Sleeper `null` vs absent fields** — see 2c. Details and test cases in
  `docs/slices/standings.md` (still accurate on this point).
- **`users` table** — ADR 0001 specifies a table keyed by Firebase UID, shaped to
  mirror fantasy-tds's `UserProfile` so the existing Firestore collection imports
  by UID with the twelve real Sleeper links intact. Not yet written as a
  migration. Do it with the Sleeper-linking slice.
- **`verify.yml` still runs web vitest + svelte-check only** — needs pytest +
  ruff, and the OpenAPI drift gate (regenerate clients, fail on diff). The two
  Claude review workflows are stack-agnostic and unchanged.
- **`Procfile` targets Railway**; Cloud Run is the current intent and needs a
  `Dockerfile`. Railway remains a legitimate simpler fallback — decide when
  there is something to deploy.
- **Neon is a public endpoint.** The scaffold's comments assume Railway's private
  Postgres ("no public exposure"). Accepted in ADR 0002, but revisit before the
  FAAB and dues ledgers land.
- **Sleeper league ID** — the real one is still needed for any ingestion run.
- **`docs/slices/standings.md`** is Convex-shaped; rewrite when 2a starts.

## Queued audits — good next-session tasks

- **Read `migrations/0001_init.sql` and `src/` end to end.** They were written
  before the Convex detour and have never been executed. Assume bugs; the
  scaffold is a starting point, not a verified base.
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
