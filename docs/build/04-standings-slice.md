# 04 — Standings slice

**Goal:** the first vertical slice. Sleeper → database → computed → HTTP →
OpenAPI spec. Everything after this is the same shape with different data.

**Depends on:** [01](01-foundation.md), [02](02-schema-and-migrations.md), [03](03-sleeper-client.md).

| | |
|---|---|
| **New here** | Nothing, technically — it is the first three specs joined up. What is new is the *shape*: pure logic, ingestion, and route as three separable layers. |
| **Size** | The largest so far — five files, fourteen criteria. Expect it to take longer than 01–03 combined. |
| **Working when** | `curl localhost:8000/leagues/<id>/standings` returns your real league in the right order, and `openapi.json` describes it correctly. |
| **The one that matters** | Criterion 14. Everything before it produces a working endpoint; criterion 14 is what makes it a *contract*, and spec 06 turns that contract into two clients. Get it wrong here and it is wrong on your phone. |

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

## The files

| # | File | What it does | Closes |
|---|---|---|---|
| 1 | [`src/core/standings.py`](#1-srccorestandingspy) | `compute_standings`, pure | 1–6 |
| 2 | [`src/core/schemas.py`](#2-srccoreschemaspy) | `StandingRow` | — |
| 3 | [`src/ingestion/backfill.py`](#3-srcingestionbackfillpy) | Upsert league, users, rosters | 7–10 |
| 4 | [The repository query](#4-the-repository-query) | Rosters joined to users | — |
| 5 | [`src/api/routes/leagues.py`](#5-srcapiroutesleaguespy) | `GET /leagues/{id}/standings` | 11–14 |

**Build the middle first.** The instinct is left-to-right — fetch, store,
compute, serve — but `compute_standings` is the piece with the actual thinking in
it, it needs no database or network, and you can finish and fully test it in an
afternoon with hand-written dicts. Doing it first means the six hardest tests in
this spec are green before you have touched I/O.

---

### 1. `src/core/standings.py`

The pure function. **Test-first, with fabricated input** — there is no reason to
have a database running while you write this.

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

**The interesting rule is the tiebreak that is not written down.** Criterion 2
asks for a stable, deterministic order on an *identical* wins-and-fpts tie.
Python's sort is stable with respect to input order — and your input order comes
from a database whose row order is not guaranteed. So you need a third sort key
and you have to choose it. `roster_id` is the obvious one.

**Check.** Write criterion 1's test with three hand-typed roster dicts, watch it
fail, make it pass. Then 2 through 6 the same way. No database, no Sleeper, no
fixtures. **Closes criteria 1–6** — six of fourteen, with nothing running.

---

### 2. `src/core/schemas.py`

`StandingRow`, appended to the module that already holds `Health`.

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

**Two decisions here are visible in the generated Swift and expensive to
change**, so make them deliberately rather than by default:

- **How `fpts` serialises.** Points are `numeric` in Postgres and arrive as
  `Decimal` in Python. Pydantic will serialise a `Decimal` — decide whether the
  API emits a JSON number or a string, because both clients have to agree with
  that choice.
- **How nullable fields are declared.** `str | None` and `Optional[str]` with a
  default produce *different* OpenAPI schemas. Criterion 14 checks the result.

**Docs.** [Pydantic optional fields](https://docs.pydantic.dev/latest/concepts/models/#fields-with-non-hashable-default-values)
— nullable and defaulted are different things in OpenAPI

---

### 3. `src/ingestion/backfill.py`

Sleeper client (03) → normalise → upsert into the tables from 02, for one league.

Every write is an `INSERT ... ON CONFLICT` on the natural key. Idempotency is
much easier to build now than to retrofit, and you will run this command dozens
of times over the next few specs.

**This is where the Sleeper edge cases actually bite.** Read this list before
writing the file, not after. These are facts about the upstream data, and they
caused real bugs in the previous implementation.

- **Explicit `null` versus absent.** Sleeper sends
  `"previous_league_id": null`, `"avatar": null`,
  `"metadata": {"team_name": null}`. Code that assumes a missing key will not see
  these. **Normalise here, at the boundary, once** — rather than defending
  against it in every downstream consumer.
- **`fpts_decimal` may be missing entirely.** Sleeper splits points into `fpts`
  (whole) and `fpts_decimal` (fractional). When the fractional part is absent,
  naive addition produces `NaN` — which then poisons every sum and comparison,
  and sorts unpredictably, so standings silently scramble. Default the missing
  part to zero.
- **`metadata` itself can be `null`**, not just its keys. Reaching into it
  without checking raises.
- **A nonexistent league ID must exit cleanly** with a message, not a traceback.
  Spec 03's client returns `None` for this; handle it.

**Check.** Run it against your real league, then look at the rows in psql.
**Closes criterion 7.** Then immediately run it a *second* time and diff the row
counts — unchanged, with `synced_at` updated. **Closes criterion 8.** Then find a
league whose `previous_league_id` is `null` (your earliest season) and run that.
**Closes criterion 9.** Then a garbage league ID. **Closes criterion 10.**

Criterion 9 and the `fpts_decimal` case are the two that will actually bite, and
neither shows up with well-behaved test data. **Write the nasty fixture.**
Ingestion bugs found here are cheap; found in spec 06 they look like
client-generation bugs and cost a day.

**Docs.** [`INSERT ... ON CONFLICT`](https://www.postgresql.org/docs/current/sql-insert.html#SQL-ON-CONFLICT)

---

### 4. The repository query

Where this lives is your call — a `queries.py`, a function beside the route,
whatever reads well at this size.

One SQL statement joining `sleeper.rosters` to `sleeper.league_users`. It returns
**plain rows** and hands them to `compute_standings`.

That boundary is the whole design. If you find yourself wanting to sort or rank
in SQL, that is the signal you are dissolving it — the ordering logic belongs in
the pure function where it is testable without a database.

---

### 5. `src/api/routes/leagues.py`

| | |
|---|---|
| Route | `GET /leagues/{league_id}/standings` |
| Returns | `list[StandingRow]`, ordered |
| `200` | Found, possibly an empty list |
| `404` | League not in the database |
| `401` | Missing/invalid token, once spec 05 lands |

Thin: fetch rows, call the pure function, return them. A plain `def`, not
`async def` — see spec 01's Design decisions.

**The only real logic is the 404-vs-empty distinction**, and it is a genuine
decision rather than a formality. "League not ingested" and "league ingested,
has no rosters" are different answers to the user. An ingested league with no
rosters is `200` with `[]`.

**Check.** An ingested league returns rows in rank order with `rank` starting at
1; an unknown league returns `404`; an ingested league with no rosters returns
`200` and `[]`. **Closes criteria 11–13.**

**Then read the generated spec by eye** — this is the step that makes the slice a
contract:

```sh
curl -s localhost:8000/openapi.json | python -m json.tool
```

Confirm the path is there with `StandingRow` as the array item schema, and that
`owner_id` and `avatar` are actually marked nullable. This is where file 2's
`Optional` decision shows its consequences. **Closes criterion 14.**

**Docs.** [Response models](https://fastapi.tiangolo.com/tutorial/response-model/)
— how they shape the OpenAPI schema ·
[`TestClient`](https://fastapi.tiangolo.com/tutorial/testing/)

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

## Done when

All fourteen criteria pass, `ruff` is clean, and `openapi.json` shows the
endpoint correctly. That spec is what spec 06 turns into two generated clients —
if it is wrong here, it is wrong on your phone.
