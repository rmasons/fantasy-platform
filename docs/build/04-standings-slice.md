# 04 — Standings slice

**Goal:** the first vertical slice. Sleeper → database → computed → HTTP →
OpenAPI spec. Everything after this is the same shape with different data.

**Depends on:** [01](01-foundation.md), [02](02-schema-and-migrations.md), [03](03-sleeper-client.md).

This supersedes the retired `docs/slices/standings.md` (Convex-shaped). Its
ranking rules and edge cases were correct and are carried below.

---

## Design decisions

**Computation is a pure function.** `compute_standings` takes rows and returns
rows. No database handle, no HTTP client, no settings. This is not stylistic:

- it is unit-testable with plain data and no fixtures,
- it is the piece that later gets precomputed into a cache without rework,
- and it is where every interesting bug will live, so it needs to be the easiest
  thing in the codebase to test.

If it ever needs a connection, something has been layered wrong.

**Ingestion is idempotent.** Every write is an upsert keyed on the natural key.
Running a backfill twice must produce the same rows — not duplicates, not
errors. You will run it more than twice; assume it.

**Read from the database, not from Sleeper, on the request path.** The endpoint
queries Postgres. It never calls Sleeper. Otherwise every page load depends on
someone else's uptime and rate limits.

**The response model is the contract.** It generates the OpenAPI schema, which
generates the TypeScript and Swift clients. Field names and nullability here are
API surface — changing them later breaks both clients, which is exactly what the
CI drift gate is meant to catch.

---

## What to build

| Piece | File | Notes |
|---|---|---|
| Ingestion | `src/ingestion/backfill.py` | Upsert league, users, rosters for one league |
| Pure logic | `src/core/standings.py` | `compute_standings` |
| Response model | `src/core/schemas.py` | `StandingRow` |
| Route | `src/api/routes/leagues.py` | `GET /leagues/{league_id}/standings` |
| Repository query | your call | The SQL that fetches rosters joined to users |

### `compute_standings`

**Input:** roster rows and league-user rows (plain dicts or small dataclasses —
your choice, but not database cursors).
**Output:** an ordered list of standings rows.

Rules:

1. Sort by **wins descending**.
2. Break ties by **`fpts` descending**.
3. Join `rosters.owner_id` → `league_users.user_id` for the display name.
4. Prefer `team_name` when present, else `display_name`.
5. Build the full avatar URL — `https://sleepercdn.com/avatars/thumbs/{avatar}`
   — or `None` when there is no avatar.
6. Assign `rank` starting at 1, in the sorted order.

### `StandingRow`

| Field | Type | Nullable | Notes |
|---|---|---|---|
| `rank` | `int` | no | 1-based |
| `roster_id` | `int` | no | Unique within the league only |
| `owner_id` | `str` | **yes** | Orphaned rosters have no owner |
| `display_name` | `str` | no | Team name if set, else display name, else a fallback |
| `avatar` | `str` | **yes** | Full URL, not the ID |
| `wins` / `losses` / `ties` | `int` | no | |
| `fpts` / `fpts_against` | `float` | no | Two decimal places |

Deliberately **not** in v1: `streak` (needs matchups — a later slice). Adding a
field later is easy; removing one is a breaking change for two clients.

### `GET /leagues/{league_id}/standings`

| | |
|---|---|
| Returns | `list[StandingRow]`, ordered |
| `200` | Found, possibly an empty list |
| `404` | League not in the database |
| `401` | Missing/invalid token, once spec 05 lands |

The distinction in `404` matters: "league not ingested" and "league has no
rosters" are different states. An ingested league with no rosters is `200` with
`[]`.

---

## Acceptance criteria

**Pure logic** (no database):

1. Three rosters at 5–2, 5–2, 3–4 with differing `fpts` sort by wins then fpts.
2. An identical wins-and-fpts tie produces a stable, deterministic order.
3. A roster with `owner_id = None` still appears, with a fallback display name.
4. A user with `avatar = None` yields `avatar = None`, not a broken URL.
5. `team_name` wins over `display_name` when both exist.
6. An empty input returns an empty list — no exception.

**Ingestion:**

7. Backfilling a real league inserts one league, N users, N rosters.
8. Backfilling the **same** league again leaves the row counts unchanged and
   updates `synced_at`.
9. A league whose `previous_league_id` is `null` backfills without error.
10. A nonexistent league ID exits cleanly with a message — no traceback.

**Endpoint:**

11. `GET /leagues/{id}/standings` on an ingested league returns rows in rank
    order, `rank` starting at 1.
12. An unknown league returns `404`.
13. An ingested league with no rosters returns `200` and `[]`.
14. `openapi.json` contains the path with `StandingRow` as the array item
    schema, and `owner_id` and `avatar` marked nullable.

## Edge cases

These are facts about Sleeper's data. They caused real bugs in the previous
implementation.

- **Explicit `null` versus absent.** Sleeper sends `"previous_league_id": null`,
  `"avatar": null`, `"metadata": {"team_name": null}`. Code that assumes a
  missing key will not see these. Normalise at the ingestion boundary, once,
  rather than defending everywhere downstream.
- **`fpts_decimal` may be missing entirely.** Sleeper splits points into
  `fpts` (whole) and `fpts_decimal` (fractional). When the fractional part is
  absent, naive addition produces `NaN`, which then poisons every sum and
  comparison — and `NaN` sorts unpredictably, so standings silently scramble.
  Default the missing part to zero.
- **`metadata` itself can be `null`**, not just its keys. Reaching into it
  without checking raises.
- **Orphaned rosters.** A roster can have `owner_id = null` when someone left
  the league mid-season. It still played games and still belongs in the
  standings.
- **`roster_id` is per-league**, a small reused integer. Never a global key.
- **Points are `numeric` in Postgres and arrive as `Decimal` in Python.**
  Pydantic will serialise a `Decimal` — decide deliberately whether the API
  emits a JSON number or a string, because both clients have to agree with that
  choice.

## Concepts

- [`INSERT ... ON CONFLICT`](https://www.postgresql.org/docs/current/sql-insert.html#SQL-ON-CONFLICT) — the upsert
- [Response models](https://fastapi.tiangolo.com/tutorial/response-model/) — how they shape the OpenAPI schema
- [`TestClient`](https://fastapi.tiangolo.com/tutorial/testing/)
- [Pydantic optional fields](https://docs.pydantic.dev/latest/concepts/models/#fields-with-non-hashable-default-values) — nullable vs. defaulted, which are different in OpenAPI

## Done when

All fourteen criteria pass, `ruff` is clean, and `openapi.json` shows the
endpoint correctly. That spec is what spec 06 turns into two generated clients —
if it is wrong here, it is wrong on your phone.
