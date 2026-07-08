# Roadmap — slices beyond standings

Sequenced buildout for reaching (then passing) feature parity with
[fantasy-tds](https://github.com/rmasons/fantasy-tds). Audited 2026-07-07 against
the live fantasy-tds feature surface. Per-slice pattern stays the same
(schema → mutations → action → query → web, TDD per [AGENTS.md](../AGENTS.md));
each slice gets a `docs/slices/*.md` contract when it starts.

## Foundations — do these before/alongside the next core slices

These aren't user-facing but nearly every later slice depends on them.

| Slice | What | Why first |
|---|---|---|
| **players** | Ingest `GET /players/nfl` (~5 MB, all NFL players), slim to `playerId / name / position / team / status`, upsert into a `players` table, refresh daily via cron. fantasy-tds does the same slimming into a daily Vercel Blob snapshot. | Rosters, transactions, drafts, and matchup detail are unreadable ID lists without player names. Blocks three of the five planned slices. |
| **nflState** | Ingest `GET /state/nfl` → current `season`, `week`, `season_type` (single-row table or included in the daily action). | Matchups need "current week"; crons need to know when the season is live vs. off-season. |
| **season chains** | Extend `backfill` to walk `previous_league_id` and ingest every prior season of the league (leagues + users + rosters, later matchups/drafts/transactions per season). | All history features (records, manager careers, superlative archives, historical year-walk) read from this. Cheap to do now — the schema already stores `previousLeagueId`. |

## Core slices (already planned — with dependency notes)

1. **matchups** — `GET /league/{id}/matchups/{week}` per week; brings back the
   deferred `streak` for standings. Fold in the **playoff bracket**
   (`/winners_bracket`, `/losers_bracket`) — fantasy-tds renders it on the
   matchups/history pages. Depends on: nflState.
2. **rosters** — current roster contents (`players`/`starters` arrays on the
   roster payload — extend the existing `rosters` table). Depends on: players.
3. **transactions** — `GET /league/{id}/transactions/{week}`, all weeks.
   Depends on: players, nflState.
4. **drafts** — `GET /league/{id}/drafts` + `GET /draft/{id}/picks`.
   Depends on: players, season chains (per-year boards).
5. **superlatives** — end-of-season awards computed from matchup + transaction
   history (fantasy-tds has ~20, admin-editable). Depends on: matchups,
   transactions, season chains.

## Proposed further buildouts (not currently planned)

Everything below exists in fantasy-tds today and is absent from this repo's plan,
roughly in suggested order:

| Feature | What it is | Depends on |
|---|---|---|
| **Power rankings** | Weekly power-ranking algorithm (port `powerRankings.ts`) | matchups |
| **Records & history** | All-time single-game highs, season totals, superlative podium archive; historical year-walk on every page | season chains, matchups |
| **Manager profiles** | Per-manager career pages: season-by-season, head-to-head splits | season chains, matchups |
| **Rivalry** | Auto head-to-head analyzer + weekly "grudge match" digest | matchups, manager profiles |
| **Trade & waiver analytics** | Most-lopsided trades, FAAB steals/busts (starter-points ROI), all-time variants | transactions, matchups, players |
| **Keepers + FAAB ledger** | Keeper cost calculator (draft round × years kept, cap from `max_keepers`), scenario planner, commissioner FAAB grant/penalty ledger, admin overrides | drafts, transactions, auth |
| **Admin surface** | Register league ID, nav config, keeper/FAAB overrides, superlative editing — needs a role/permission model on top of Convex Auth | auth |
| **Sleeper account linking** | Map the signed-in Google user to a Sleeper `userId` (drives "my team", membership-gated writes — fantasy-tds gates writes on live roster ownership) | auth |
| **Multi-league support** | League switcher + public landing. fantasy-tds is single-league-by-config; this schema is already league-keyed, so mostly a routing/UX slice | — |
| **Notifications** | Convex crons → email/push: draft reminders, rivalry digest, "your keeper cost changed". Was roadmap-only in fantasy-tds; Convex scheduler makes it cheap | rivalry, keepers |
| **E2E smoke tests** | Playwright happy-path (sign in → standings renders) in `verify` | — |

Explicitly **out of scope** (carried over from fantasy-tds decisions): live
in-game scoring; the FAAB easter-egg hunt (slated for removal there); the
Contentful blog (revisit only if the league asks).

## Platform / infra follow-ups

- **Convex function tests in CI** — root `npx vitest run` job in `verify.yml`
  once `convex.json` is committed and codegen works in CI (known gap in
  [HANDOFF.md](../HANDOFF.md)).
- **Ingestion fan-out** — `daily` should `ctx.scheduler.runAfter(0, …)` per
  league instead of `ctx.runAction` + `Promise.all` (see standings slice doc).
- **Cron cadence** — daily 05:00 UTC is fine off-season; in-season add a Tuesday
  "finalize week" run (matchups/transactions settle Mon night) keyed off nflState.
- **Auth token refresh** — known gap; wire once `@convex-dev/auth` documents the
  refresh endpoint for non-React clients.
- **`activeLeagueIds`** — currently a full-table `filter` on `status`; add an
  index if/when league count grows beyond trivial.
