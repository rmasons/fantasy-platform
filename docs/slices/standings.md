# Slice: Standings

First vertical slice. Exercises the whole stack: ingestion → Convex DB → query
function → web. Built test-first on both sides (see [AGENTS.md](../../AGENTS.md)).

## Query contract (the handshake)

`api.queries.leagues.getStandings({ leagueId })` → `StandingRow[]`

```typescript
// Return type (TypeScript — used by both the Convex query and the web component)
type StandingRow = {
  rank: number;
  rosterId: number;
  teamName: string;
  ownerName: string;
  avatar: string | null;
  wins: number;
  losses: number;
  ties: number;
  fpts: number;
  fptsAgainst: number;
};
```

Equivalent REST shape (for reference / testing via `convex-test`):

```json
{
  "leagueId": "12345",
  "season": "2024",
  "standings": [
    {
      "rank": 1,
      "rosterId": 3,
      "teamName": "Team Foo",
      "ownerName": "mason",
      "avatar": "https://sleepercdn.com/avatars/thumbs/abc",
      "wins": 10, "losses": 3, "ties": 0,
      "fpts": 1623.42, "fptsAgainst": 1450.10
    }
  ]
}
```

- Ordering: `wins` desc, then `fpts` desc — computed in `computeStandings()`.
- `avatar` may be `null`. `ownerName` may equal `teamName`.
- **`streak` is deferred** to the matchups slice. The web renders without it for v1.

## Backend (Mason / Sonnet) — TDD order

### 1. Schema — `convex/schema.ts`

Add `leagueUsers` and `rosters` tables:

```typescript
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
```

### 2. Red — pure logic (`convex/lib/standings.ts`)

Write a failing vitest unit test for `computeStandings(rosters, leagueUsers)` first.
This function has **no Convex imports and no `ctx`** — just plain TypeScript:

```typescript
// convex/lib/standings.ts
export function computeStandings(
  rosters: RosterDoc[],
  users: LeagueUserDoc[],
): StandingRow[] { ... }
```

Test: ranks by wins desc then fpts desc; joins names/avatars from users; null avatar
is handled; ties in wins fall back to fpts. Run with `npx vitest run`.

### 3. Mutations — `convex/mutations/ingestion.ts` (idempotent upserts)

Write `convex-test` integration tests first (failing), then implement:
- `upsertLeague(leagueId, data)` — insert or replace league row
- `upsertLeagueUsers(leagueId, users[])` — upsert by `(leagueId, userId)` compound key
- `upsertRosters(leagueId, rosters[])` — upsert by `(leagueId, rosterId)` compound key

Idempotency assertion: call each mutation twice with the same payload → same document
count, no duplicates.

Sleeper field map:
- `leagueUsers` ← `GET /league/{id}/users`: `user_id`, `display_name`,
  `metadata.team_name`, `avatar`
- `rosters` ← `GET /league/{id}/rosters`: `roster_id`, `owner_id`,
  `settings.wins`, `settings.losses`, `settings.ties`,
  `settings.fpts` + `settings.fpts_decimal` (combine to float),
  `settings.fpts_against` + `settings.fpts_against_decimal`

### 4. Sleeper client — `convex/lib/sleeper.ts`

Port `src/core/sleeper/client.py` to TypeScript. Thin `fetch` wrapper; no Convex
imports (pure TS → unit-testable). Methods needed for this slice:
`getLeague(id)`, `getLeagueUsers(id)`, `getLeagueRosters(id)`.

### 5. Action — `convex/actions/ingest.ts`

`backfill(leagueId)`:
1. Call Sleeper client for users + rosters.
2. Call `ctx.runMutation(internal.mutations.ingestion.upsertLeagueUsers, ...)`, then `upsertRosters`.

`daily()` (no args — called by cron):
- Reads active league IDs from the DB, refreshes rosters for each.

Wire `daily` into `convex/crons.ts`:

```typescript
crons.daily("refresh rosters", { hourUTC: 5, minuteUTC: 0 }, internal.actions.ingest.daily);
```

### 6. Query — `convex/queries/leagues.ts`

`getStandings({ leagueId })`:
1. `ctx.db.query("rosters").withIndex("by_league", q => q.eq("leagueId", leagueId)).collect()`
2. `ctx.db.query("leagueUsers").withIndex("by_league", q => q.eq("leagueId", leagueId)).collect()`
3. `return computeStandings(rosters, users)`

Test with `convex-test`: seed tables → call query → assert sorted order.

**Done when:** `backfill("real_league_id")` runs successfully, the query returns
correctly ordered rows matching Sleeper data, and all tests are green in CI.

## Frontend (Opus/Sonnet) — unchanged from original plan

- Vitest unit test for the Convex doc → `StandingRow` mapper (already done as
  the snake_case→camelCase fixture mapper — confirm it matches the Convex query return type).
- Swap `load()` function fixture for `useQuery(api.queries.leagues.getStandings, { leagueId })` via `convex-svelte`.
- Reuse the existing standings UI (navy/amber theme, `font-sport`, desktop table +
  mobile cards) — no visual changes needed.
