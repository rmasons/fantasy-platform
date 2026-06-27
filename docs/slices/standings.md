# Slice: Standings

First vertical slice. Exercises the whole stack: ingestion → DB → API → web.
Built test-first on both sides (see [AGENTS.md](../../AGENTS.md)).

## API contract (the handshake)

`GET /leagues/{league_id}/standings` → `200`

```json
{
  "league_id": "12345",
  "season": "2024",
  "standings": [
    {
      "rank": 1,
      "roster_id": 3,
      "team_name": "Team Foo",
      "owner_name": "mason",
      "avatar": "https://sleepercdn.com/avatars/thumbs/abc",
      "wins": 10, "losses": 3, "ties": 0,
      "fpts": 1623.42, "fpts_against": 1450.10
    }
  ]
}
```

- JSON is **snake_case** (idiomatic Python API). The web `load` maps it to the
  component's `StandingRow` shape (camelCase: `teamName`, `ownerName`, `fptsAgainst`).
- Ordering is computed **server-side in Python**: `wins` desc, then `fpts` desc.
- `avatar` may be `null`. `owner_name` may equal `team_name`.
- **`streak` is deferred** to the matchups slice (needs week-by-week results). The
  web renders without the streak column for v1.

## Backend (Mason) — TDD order

1. **Red — pure logic.** `tests/test_standings.py` for
   `compute_standings(rosters, users) -> list[StandingRow]`: ranks by wins desc then
   fpts desc, joins names/avatars. No DB.
2. **Schema** — `migrations/0002_standings.sql`: `sleeper.league_users`
   (PK `league_id,user_id`: `display_name`, `team_name`, `avatar`) and
   `sleeper.rosters` (PK `league_id,roster_id`: `owner_id`, `wins`, `losses`,
   `ties`, `fpts`, `fpts_against`).
3. **Ingestion (integration test, idempotent).** Extend `backfill.run()` to upsert
   users (`GET /league/{id}/users`) + rosters (`GET /league/{id}/rosters`); extend
   `daily.run()` to refresh current rosters. Field map: records/points live under
   roster `settings` (`wins`, `losses`, `ties`, `fpts`+`fpts_decimal`,
   `fpts_against`+`fpts_against_decimal`); team name is user `metadata.team_name`.
4. **Endpoint (contract test).** `GET /leagues/{id}/standings` returns the shape above.

**Done when:** backfill a real league, the endpoint returns correctly ordered rows
matching Sleeper, all tests green.

## Frontend (Opus/Sonnet) — TDD where it pays

- Vitest unit test for the API→`StandingRow` mapper (snake_case → camelCase, null avatar).
- Component render test against the contract fixture.
- Reuse the `fantasy-tds` standings look (navy/amber theme, `font-sport`, desktop
  table + mobile cards) minus the streak column. Drives off a fixture/mock until the
  live endpoint exists, then flips to the real `VITE_API_BASE_URL`.
