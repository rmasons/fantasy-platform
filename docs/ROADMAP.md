# Roadmap — slices beyond standings

Sequenced buildout for reaching (then passing) feature parity with
[fantasy-tds](https://github.com/rmasons/fantasy-tds). Audited 2026-07-07 against
the live fantasy-tds feature surface; **the sequence and dependencies below are
stack-agnostic and survived the 2026-07-27 pivot to an OpenAPI-contracted Python
API intact** ([ADR 0002](decisions/0002-ios-first-openapi-python-api.md)).

Per-slice pattern: **migration → pure logic (`src/core/`) → ingestion → route +
Pydantic response model → regenerate clients → web/iOS view**, TDD per
[AGENTS.md](../AGENTS.md). Each slice gets a `docs/slices/*.md` contract when it
starts — and because the response model *is* the contract, that doc now defines
Pydantic shapes rather than prose.

**iOS is the primary client.** Each slice is done when its endpoint is in the
OpenAPI spec and both generated clients are regenerated and committed.

## Foundations — do these before/alongside the next core slices

These aren't user-facing but nearly every later slice depends on them.

| Slice | What | Why first |
|---|---|---|
| **players** | Ingest `GET /players/nfl` (~5 MB, all NFL players), slim to `player_id / name / position / team / status`, upsert into a `players` table, refresh daily. fantasy-tds slims the same payload into a daily Vercel Blob snapshot; here it is just a table. | Rosters, transactions, drafts, and matchup detail are unreadable ID lists without player names. Blocks three of the five planned slices. |
| **nflState** | Ingest `GET /state/nfl` → current `season`, `week`, `season_type` (single-row table, or folded into the daily ingestion run). | Matchups need "current week"; the scheduler needs to know when the season is live vs. off-season. |
| **season chains** | Extend `backfill` to walk `previous_league_id` and ingest every prior season of the league (leagues + users + rosters, later matchups/drafts/transactions per season). | All history features (records, manager careers, superlative archives, historical year-walk) read from this. Cheap to do now, and it is where Postgres earns its place — these are cross-season aggregations. |

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
| **Power rankings** | Weekly power-ranking algorithm (port `powerRankings.ts` → `src/core/`) | matchups |
| **Records & history** | All-time single-game highs, season totals, superlative podium archive; historical year-walk on every page | season chains, matchups |
| **Manager profiles** | Per-manager career pages: season-by-season, head-to-head splits | season chains, matchups |
| **Rivalry** | Auto head-to-head analyzer + weekly "grudge match" digest | matchups, manager profiles |
| **Trade & waiver analytics** | Most-lopsided trades, FAAB steals/busts (starter-points ROI), all-time variants | transactions, matchups, players |
| **Keepers + FAAB ledger** | Keeper cost calculator (draft round × years kept, cap from `max_keepers`), scenario planner, commissioner FAAB grant/penalty ledger, admin overrides | drafts, transactions, auth |
| **Admin surface** | Register league ID, nav config, keeper/FAAB overrides, superlative editing — needs a role/permission model on top of Firebase Auth (`is_admin` on the `users` table, per ADR 0001) | auth |
| **Sleeper account linking** | Map the signed-in Firebase user to a Sleeper `user_id` (drives "my team", membership-gated writes — fantasy-tds gates writes on live roster ownership). **Ships with the one-off import** of fantasy-tds's Firestore `users` collection: same Firebase UIDs, so the twelve existing links carry over unchanged (ADR 0001) | auth |
| **Multi-league support** | League switcher + public landing. fantasy-tds is single-league-by-config; this schema is already league-keyed, so mostly a routing/UX slice | — |
| **Notifications** | Scheduled job → email/push: draft reminders, rivalry digest, "your keeper cost changed". Was roadmap-only in fantasy-tds. **APNs via FCM** using the Firebase project already in the stack — and push is also what justifies the iOS app under App Store guideline 4.2 | rivalry, keepers |
| **E2E smoke tests** | Playwright happy-path on web (sign in → standings renders) in `verify`; XCUITest equivalent for iOS | — |

Explicitly **out of scope** (carried over from fantasy-tds decisions): live
in-game scoring; the FAAB easter-egg hunt (slated for removal there). The
Contentful blog is **not** carried over as-is — it moves into our own storage,
folded into the blog + LLM recap feature below.

## New features — beyond fantasy-tds

Ideas the old app never had, ranked roughly by value-for-effort. Everything here
is computable from data the slices above already ingest — **no projections
provider needed** (the Monte Carlo uses each team's own scoring history). The
first three are almost pure `src/core/` functions — no I/O, unit-testable
without a database, and squarely in Python's wheelhouse. Cheap, high delight.

| Feature | What | Depends on |
|---|---|---|
| **Luck & schedule analysis** | All-play record (your record if you played everyone every week), expected wins vs. actual, "with X's schedule you'd be 9–4" swaps. The classic league argument, settled with math | matchups |
| **Optimal-lineup / bench-regret tracker** | Weekly "points left on bench," lineup-efficiency %, season leaderboard of worst start/sit calls (`players_points` is in the matchup payload) | matchups, players |
| **Playoff odds (Monte Carlo)** | Simulate the rest of the season by sampling each team's scoring distribution → playoff/bye/title odds per team, updated weekly; clinch/elimination scenarios | matchups, nflState |
| **Blog + LLM weekly recap** (replaces Contentful) | `posts` table (Markdown body) + `comments` table; media in **Firebase Storage** (already in the stack). Posts are LLM-written (Claude API from a scheduled job — blowouts, narrow escapes, bench regrets, records approached, rivalry results) as drafts; admin editor for touch-ups + media upload. **Media is compressed at upload** — object storage does no transforms (unlike Contentful's Images API), so the upload path must: client-side canvas resize/re-encode for images (cap dimensions, WebP) and gif → MP4/WebM, storing only the compressed asset. A one-off migration pulls existing posts/assets from the Contentful export API through the same path. Kills the Contentful dependency, its creds, and per-league CMS config. Feeds the notification layer as an email/digest | matchups, records, admin surface; pairs with notifications |
| **Preseason predictions & ballots** | Members predict final standings + champion before week 1; ballots lock, auto-score at season end, bragging-rights leaderboard | auth |
| **League votes & polls** | Rule-change votes with quorum + a recorded constitution changelog. Live tallies need polling or SSE — no longer free, so keep the refresh cadence honest | auth, admin |
| **Live draft companion** | Real-time draft board (poll `/draft/{id}/picks` during the draft) with **keeper costs overlaid** and best-available by positional need — the thing Sleeper's own UI can't show because it doesn't know the league's keeper rules | drafts, players, keepers |
| **Dues & payouts ledger** | Who's paid, payout structure, side pots — same auditable-ledger pattern as FAAB, for real money | auth, admin |
| **Record-chase alerts** | Weekly cron diff: someone's approaching an all-time record (season points pace, single-game high) → notify the league before it happens, not after | records, notifications |
| **Punishment tracker** | Last-place punishment history with photo evidence (Firebase Storage) — the page nobody wants to be on | season chains |

Suggested first pick: **luck & schedule analysis** — it lands right after the
matchups slice with no new ingestion, and it's the feature leagues actually argue
about weekly.

## Design track (parallel — never blocks backend work)

Since the backend is the learning focus, design runs as a side track against
fixtures — and since the OpenAPI spec fixes the data shapes, designs can be
produced for any slice before its endpoint exists:

1. **Extract before designing.** The existing `web/` standings page already sets
   the visual language (navy/amber, `font-sport`, desktop table + mobile cards).
   First step is extracting a design system (`system.md`) from that code so every
   later page stays consistent instead of inventing its own look.
2. **Design only the novel surfaces.** Data-table pages (standings, matchups,
   rosters, transactions) are covered by the fixture-first TDD flow — mockups add
   little. Design-first pays off on pages with no fantasy-tds precedent: the
   **blog reading experience**, the **live draft companion**, and the
   **luck / playoff-odds dashboards** (chart-heavy; deserve a deliberate
   visualization pass).
3. Slice contracts define the data shapes, so designs can be produced against
   fixtures at any time without waiting on ingestion.

## Platform / infra follow-ups

- **CI for the Python API** — `verify.yml` still runs web vitest + svelte-check
  only; it needs pytest + ruff, plus the **OpenAPI drift gate** (regenerate both
  clients, fail on any diff). Add the gate before the first slice lands so it is
  never retrofitted (known gap in [HANDOFF.md](../HANDOFF.md)).
- **Ingestion isolation** — `daily` should process leagues independently so one
  league's failure doesn't abort the rest, and log per-league outcomes.
- **Schedule cadence** — daily 05:00 UTC is fine off-season; in-season add a
  Tuesday "finalize week" run (matchups/transactions settle Mon night) keyed off
  nflState.
- **Connection pooling** — the API holds a `psycopg-pool`; deployed, point
  `DATABASE_URL` at Neon's **pooled** endpoint and size the local pool for a
  scale-to-zero container.
- **Query indexes** — active-league lookup and the cross-season history queries
  are the first places to need them. Add with the slice that makes them slow,
  not speculatively.
- **iOS client generation** — pin the `swift-openapi-generator` version and run
  it in CI, so a spec change that breaks Swift codegen fails there rather than
  in Xcode.
