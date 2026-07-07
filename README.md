# Fantasy Platform

A fantasy-football companion app rebuilt from the ground up on a **Convex** backend:
real-time document database + typed server functions + native scheduled ingestion,
all in TypeScript. The **SvelteKit** frontend in `web/` talks to Convex directly
via `convex-svelte` — no intermediate HTTP server.

## Architecture

```
Browser ──▶ [ SvelteKit web ]
               convex-svelte
                     │
                     ▼
             [ Convex backend ]
          ┌─────────────────────────┐
          │  queries / mutations    │ ◀──▶ Convex DB (document store)
          │  actions                │ ──▶  Sleeper API
          │  crons (daily refresh) │
          └─────────────────────────┘
```

All data access goes through typed Convex functions — there is no exposed database
endpoint. Google OAuth is handled by `@convex-dev/auth`; every authenticated function
receives a typed `ctx.auth` with the caller's identity.

- **`convex/`** — all backend logic: schema, queries, mutations, actions, crons,
  auth config, and shared library code.
- **`web/`** — SvelteKit frontend; uses `convex-svelte` for reactive queries and
  mutations.

## Prerequisites

- **Node.js** v20+
- A Convex account — sign up at convex.dev, then `npx convex login`

## Local quickstart

```bash
# 1. Install dependencies
npm install            # root (convex CLI + dev deps)
cd web && npm install  # web frontend

# 2. Start the Convex dev backend + function watcher (from root)
npx convex dev
#   → creates/links a dev deployment, pushes schema + all functions
#   → prints your PUBLIC_CONVEX_URL; paste it into web/.env.local
#   → dashboard: dashboard.convex.dev

# 3. Start the web dev server (separate terminal)
cd web && npm run dev
#   → http://localhost:5173
```

Run tests:

```bash
# Convex function tests (convex-test) + web component tests — vitest runs both
cd web && npx vitest run

# Type-check + lint
cd web && npx svelte-check && npx eslint src/
```

## Configuration

### Web (`web/.env.local`)

| Var | Purpose |
|---|---|
| `PUBLIC_CONVEX_URL` | Convex deployment URL — printed by `npx convex dev` |

### Convex backend secrets (set via CLI or dashboard — never committed to source)

```bash
# Generate JWT keys:
npx @convex-dev/auth generate-keys
npx convex env set JWT_PRIVATE_KEY "<output>"
npx convex env set JWKS "<output>"

# Set your site URL (the .convex.site URL printed by npx convex dev):
npx convex env set SITE_URL https://your-deployment.convex.site

# Google OAuth app credentials (console.cloud.google.com):
npx convex env set AUTH_GOOGLE_ID <client-id>
npx convex env set AUTH_GOOGLE_SECRET <client-secret>
```

| Var | Purpose |
|---|---|
| `SITE_URL` | Your Convex site URL — used as the OAuth redirect base |
| `JWT_PRIVATE_KEY` | Signs Convex Auth JWTs |
| `JWKS` | Public key set for JWT verification |
| `AUTH_GOOGLE_ID` | Google OAuth client ID |
| `AUTH_GOOGLE_SECRET` | Google OAuth client secret |

## Deploying

```bash
# Deploy backend to Convex production
npx convex deploy

# Deploy web frontend to Vercel (or anywhere)
# Set PUBLIC_CONVEX_URL to the production deployment URL
```

## Directory layout

```
convex/
  schema.ts            ← table definitions (no SQL migrations — pushed automatically)
  auth.config.ts       ← Convex Auth domain config
  crons.ts             ← daily ingestion schedule
  lib/
    standings.ts       ← pure computeStandings() — no DB dep, fully unit-testable
    sleeper.ts         ← Sleeper API HTTP client
  queries/
    leagues.ts         ← reactive queries (standings, live score, …)
  mutations/
    ingestion.ts       ← upsert functions for leagues / users / rosters
  actions/
    ingest.ts          ← Sleeper fetch → mutations (backfill + daily)
web/
  src/                 ← SvelteKit pages + components (Svelte 5 + Tailwind v4)
```

> **Note:** `src/` (Python FastAPI scaffold) and `migrations/` are superseded.
> They remain as reference for the data model and field mapping; all new work
> goes in `convex/`.

## Key patterns

### Schema (replaces SQL migrations)

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  leagues: defineTable({
    leagueId: v.string(),
    season: v.string(),
    name: v.string(),
    status: v.string(),
    previousLeagueId: v.optional(v.string()),
    settings: v.any(),
  }).index("by_league_id", ["leagueId"]),

  leagueUsers: defineTable({
    leagueId: v.string(),
    userId: v.string(),
    displayName: v.string(),
    teamName: v.optional(v.string()),
    avatar: v.optional(v.string()),
  }).index("by_league", ["leagueId"]),

  rosters: defineTable({
    leagueId: v.string(),
    rosterId: v.number(),
    ownerId: v.string(),
    wins: v.number(),
    losses: v.number(),
    ties: v.number(),
    fpts: v.number(),
    fptsAgainst: v.number(),
  }).index("by_league", ["leagueId"]),
});
```

### Auth (`convex/auth.ts`)

```typescript
import { convexAuth } from "@convex-dev/auth/server";
import Google from "@auth/core/providers/google";

export const { auth, signIn, signOut, store } = convexAuth({
  providers: [Google],
});
```

Sign-in from the web: redirect to `${PUBLIC_CONVEX_SITE_URL}/api/auth/signin/google?redirectTo=/auth/callback`.
The callback at `/auth/callback` exchanges the `code`+`verifier` params for a JWT.

### Crons (`convex/crons.ts`)

```typescript
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "refresh rosters",
  { hourUTC: 5, minuteUTC: 0 },
  internal.actions.ingest.daily,
);

export default crons;
```

### Frontend query (`web/src/routes/+page.svelte`)

```svelte
<script lang="ts">
  import { useQuery } from "convex-svelte";
  import { api } from "../../convex/_generated/api";

  const standings = useQuery(api.queries.leagues.getStandings, { leagueId: "12345" });
</script>

{#if $standings}
  <!-- render standings -->
{/if}
```
