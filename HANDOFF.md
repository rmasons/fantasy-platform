# HANDOFF

> **⚠️ Keep this file current.** Update it *during* and at the *end* of every working
> session — whenever state materially changes (a slice ships, a decision lands, a
> blocker clears, a new open question appears). This is the first thing to read when
> resuming work. A stale handoff means lost context. Treat updating it as part of
> finishing a task, not an afterthought.

_Last updated: 2026-07-06_

## What this is

**fantasy-platform** — a from-scratch rebuild of the fantasy-football companion app
([fantasy-tds](https://github.com/rmasons/fantasy-tds)) on a **Convex** backend:

- **Convex** (TypeScript queries / mutations / actions + document DB + native crons)
  is the sole backend. No separate HTTP server, no managed Postgres.
- **SvelteKit** frontend in `web/` consuming Convex directly via `convex-svelte`
  (reactive, real-time queries — no REST polling).
- **Convex Auth** with Google OAuth — `@convex-dev/auth` on the backend;
  manual OAuth redirect + JWT storage on the SvelteKit frontend (no official Svelte
  adapter exists yet; custom flow wired in `web/src/lib/auth.svelte.ts` +
  `web/src/routes/auth/callback/`).

*The Python FastAPI scaffold (`src/`, `migrations/`) is superseded. It remains in the
repo as a data-model reference; all new work goes in `convex/`.*

Working model + TDD loop: see [AGENTS.md](AGENTS.md). Architecture details in [README.md](README.md).

## Status at a glance

### ✅ Done

- **Frontend (`web/`):** SvelteKit + Svelte 5 + Tailwind v4 + Vitest; standings page
  built test-first off a fixture (no backend required). 9 tests green.
- **CI/CD:** `dev → test → main`; advisory review on `dev`; **BLOCKING**
  `promotion-review` + `verify` on `test`/`main`; branch protection (`enforce_admins`)
  ON; `CLAUDE_CODE_OAUTH_TOKEN` set. Validated end-to-end.
- **Convex backend scaffold:** all files written to `convex/` —
  `schema.ts` (authTables + leagues/leagueUsers/rosters),
  `auth.ts` (Google OAuth via `@convex-dev/auth`),
  `auth.config.ts`, `http.ts`, `crons.ts`,
  `lib/standings.ts` (pure `computeStandings` — unit-testable without Convex),
  `lib/sleeper.ts` (fetch wrapper for Sleeper API),
  `queries/leagues.ts` (`getStandings` + `activeLeagueIds`),
  `mutations/ingestion.ts` (idempotent upserts),
  `actions/ingest.ts` (`backfill` + `daily`).
- **Web Convex wiring:** `convex` + `convex-svelte` added to `web/package.json`;
  `setupConvex` + `setupAuth` in layout; auth store + OAuth callback route scaffolded.
- **CI fixed:** `verify.yml` now runs web vitest + svelte-check only (Python steps removed).
- **Root package.json:** `convex`, `@convex-dev/auth`, `@auth/core` as deps;
  `convex-test`, `vitest`, `typescript` as devDeps for Convex function tests.
- **Env documented:** `.env.example` (Convex secrets); `web/.env.example`
  (`PUBLIC_CONVEX_URL`, `PUBLIC_CONVEX_SITE_URL`).

---

## Phase 1 — Enable (one-time, Mason does this)

**All `convex/` code imports from `convex/_generated/` — nothing runs until the
deployment is linked. Do these steps in order, once, before any dev work.**

### Step 1 — Install and link Convex

```bash
npm install                  # root: convex, @convex-dev/auth, @auth/core + devDeps
npx convex dev               # interactive: log in, pick/create a deployment
                             # creates convex.json, generates convex/_generated/
                             # prints URLs — copy them for the next steps
```

Keep `convex dev` running; it watches `convex/` and pushes changes live.

### Step 2 — Set Convex backend env vars

```bash
# Replace the placeholder with the .convex.site URL printed by convex dev:
npx convex env set SITE_URL https://your-deployment.convex.site

# Generate JWT keys (one command, prints two values):
npx @convex-dev/auth generate-keys
npx convex env set JWT_PRIVATE_KEY "<from above>"
npx convex env set JWKS "<from above>"
```

### Step 3 — Google OAuth credentials

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials → Create OAuth 2.0 Client ID (Web application).
2. **Authorized redirect URI:** `https://your-deployment.convex.site/api/auth/callback/google`
3. Copy the client ID and secret:

```bash
npx convex env set AUTH_GOOGLE_ID <client-id>
npx convex env set AUTH_GOOGLE_SECRET <client-secret>
```

### Step 4 — Web env

```bash
cp web/.env.example web/.env.local
# Edit web/.env.local — fill in PUBLIC_CONVEX_URL and PUBLIC_CONVEX_SITE_URL
# (both URLs are printed by `npx convex dev`)
cd web && npm install && npm run dev
```

### Step 5 — Verify auth end-to-end

Open `http://localhost:5173`, click Sign in with Google, confirm you land back on the
site and `localStorage` has `fantasy-platform:auth-token`.

---

## Phase 2 — Build (standings slice, TDD order)

**Do Phase 1 first.** All tasks below assume `convex/_generated/` exists and types compile.

### 2a — Convex function tests: `computeStandings` (pure unit, no DB)

File: `convex/lib/standings.test.ts`  
Runner: `npx vitest run` (root, edge-runtime)  
Contract: ranks by wins desc, ties broken by fpts desc; null avatar handled; joins names from leagueUsers.

Write the tests first (red), then confirm `convex/lib/standings.ts` makes them green.

### 2b — Convex function tests: upsert idempotency (`convex-test`)

File: `convex/mutations/ingestion.test.ts`  
Import: `import { convexTest } from "convex-test"; import schema from "../schema";`  
Assert: call each upsert mutation twice with the same payload → same document count, no duplicates.

### 2c — Convex function test: `getStandings` query (end-to-end, `convex-test`)

File: `convex/queries/leagues.test.ts`  
Seed rosters + leagueUsers → call `getStandings` → assert sorted order matches expected ranking.

### 2d — Wire real Sleeper data

Once Mason provides a real league ID:
```bash
# From the Convex dashboard or via a one-off action call:
npx convex run actions/ingest:backfill '{"leagueId":"<real_id>"}'
```
Confirm the `getStandings` query returns correct rows in the dashboard.

### 2e — Swap standings page fixture for live query

File: `web/src/routes/standings/+page.ts`  
Replace the `getStandings` fixture call with:
```typescript
import { useQuery } from "convex-svelte";
import { api } from "../../../convex/_generated/api";
const standings = useQuery(api.queries.leagues.getStandings, { leagueId: "..." });
```
Keep the existing `StandingsTable` component — no visual changes needed.

### 2f — Sign-in button

File: `web/src/routes/+page.svelte` (or a nav component)  
Add a button that calls `authStore.signInUrl(PUBLIC_CONVEX_SITE_URL, window.location.origin)` and navigates to it. Show sign-out link when `authStore.isAuthenticated`.

---

## Known gaps to address later

- **Token refresh** — `authStore.fetchAccessToken` returns the stored token as-is. Wire a refresh call once `@convex-dev/auth` documents the refresh endpoint for non-React clients.
- **Sleeper league ID** — hardcoded `"12345"` in the web standings page; replace once Mason provides the real ID.
- **Convex function tests in CI** — add a `convex-test` job to `verify.yml` once `convex.json` is committed and a read-only deploy key is available for codegen in CI.

## Run it

```bash
# 1. Install root deps (Convex CLI + function deps)
npm install

# 2. Link Convex deployment + start function watcher
npx convex dev
#   → creates convex.json, generates convex/_generated/
#   → set env vars per .env.example via: npx convex env set KEY value

# 3. Web dev server (separate terminal)
cd web && npm install && npm run dev

# 4. Tests
cd web && npx vitest run   # web component tests (9 passing)
npx vitest run             # convex function tests (none yet — add alongside each slice)
```

## Next slices (after standings)

matchups · rosters · transactions · drafts · superlatives.

Pattern per slice: schema table(s) → mutation (upsert) → action (ingest from Sleeper)
→ query → web component. Opus writes the contract; Sonnet builds the web fixture-first
then wires the live query; Mason owns or delegates ingestion + logic.

## Session log

- **2026-06-27** — Scaffolded Python backend + `web/` frontend; built standings
  frontend test-first; stood up `dev → test → main` pipeline; gate validated end-to-end.
- **2026-07-06** — Pivoted backend to Convex. Python scaffold superseded. Plan rewritten
  (README, AGENTS, slices, pipeline). Full `convex/` backend scaffold written (schema,
  auth, http, crons, lib, queries, mutations, actions). Web updated: convex-svelte wired,
  auth store + OAuth callback route scaffolded, CI fixed. Auth: Google OAuth via
  `@convex-dev/auth`; web uses custom redirect flow (no official Svelte adapter).
  Blocked on `npx convex dev` first run to generate types.
