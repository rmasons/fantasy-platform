# 02 — Schema & migrations

**Goal:** a first migration that creates the two-schema split and the tables the
standings slice needs.

**Depends on:** [01 — Foundation](01-foundation.md) (the migration runner).

---

## Design decisions

**Two Postgres schemas, split by who writes them.**

| Schema | Contains | Written by |
|---|---|---|
| `sleeper.*` | Ingested Sleeper history — leagues, rosters, matchups, transactions | the ingestion job only |
| `app.*` | App-owned data — users, FAAB ledger, keeper overrides, config | the API only |

This is the most important decision in the schema and worth understanding before
you write it. Sleeper data is **regenerable** — if it is wrong you re-ingest and
the truth is upstream. App data is **authoritative** — a FAAB adjustment exists
nowhere else, and losing it means losing it. Keeping them in separate schemas
means the two never get confused: you can truncate and rebuild `sleeper.*`
without fear, and you never do that to `app.*`.

It also makes least-privilege possible. `migrations/ROLES.sql` defines
`ingest_rw` (write `sleeper`, read `app`) and `web_rw` (write `app`, read
`sleeper`). A bug in ingestion then cannot destroy the FAAB ledger, because it
lacks the grant.

**`ROLES.sql` is applied out-of-band, not by the migration runner.** Managed
Postgres providers provision roles differently — Neon does not hand you
superuser, and role creation may need doing through their console or a
differently-privileged connection. The runner deliberately skips files whose
name does not start with a digit.

**Migrations are forward-only.** New numbered file, never an edit to one already
applied. An edited migration produces two databases with the same recorded
version and different shapes, which is unresolvable. Rehearse against a Neon
branch instead.

**Ingested tables carry `synced_at` and `is_final`.** `synced_at` tells you how
stale a row is. `is_final` marks data that can no longer change — a completed
season's matchups are immutable, and knowing that is what later lets you skip
re-ingesting them and cache them indefinitely.

---

## What to build

`migrations/0001_init.sql` — replacing the existing file. Read the current one
first: it has the schema split and some tables right, but was written for a
plan that has since changed, and it references two documents that no longer
exist (`docs/PHASE1`, `docs/STORAGE_AND_INGESTION`).

### `sleeper.nfl_state`

Single-row table holding the current NFL week. Singleton enforced by a boolean
primary key with a check constraint — a small trick worth knowing: the column
can only hold `true`, so only one row can ever exist.

| Column | Type | Notes |
|---|---|---|
| `id` | `boolean` | PK, default `true`, `check (id)` |
| `season` | `text` | e.g. `"2026"` — Sleeper sends this as a string |
| `week` | `integer` | |
| `season_type` | `text` | `pre` / `regular` / `post` |
| `synced_at` | `timestamptz` | not null, default `now()` |

### `sleeper.leagues`

| Column | Type | Notes |
|---|---|---|
| `league_id` | `text` | PK — Sleeper's ID, a string, not a number |
| `season` | `text` | |
| `name` | `text` | |
| `status` | `text` | `pre_draft` / `drafting` / `in_season` / `complete` |
| `previous_league_id` | `text` | Nullable. The season chain — see edge cases |
| `settings` | `jsonb` | not null, default `'{}'` |
| `is_final` | `boolean` | not null, default `false` |
| `synced_at` | `timestamptz` | not null, default `now()` |

### `sleeper.league_users`

League membership and display identity, per season.

| Column | Type | Notes |
|---|---|---|
| `league_id` | `text` | PK part 1, FK → `sleeper.leagues` |
| `user_id` | `text` | PK part 2 — Sleeper's user ID |
| `display_name` | `text` | |
| `team_name` | `text` | Nullable — lives in Sleeper's `metadata.team_name` |
| `avatar` | `text` | Nullable. Store the **ID**, not the URL — see edge cases |

Composite primary key `(league_id, user_id)`: the same person across two seasons
is two rows, because their team name and avatar can differ per season.

### `sleeper.rosters`

| Column | Type | Notes |
|---|---|---|
| `league_id` | `text` | PK part 1, FK → `sleeper.leagues` |
| `roster_id` | `integer` | PK part 2 — unique within a league only |
| `owner_id` | `text` | Nullable — an orphaned roster has no owner |
| `wins` / `losses` / `ties` | `integer` | not null, default 0 |
| `fpts` / `fpts_against` | `numeric` | not null, default 0 — see edge cases |

### `app.app_config`

Singleton, same boolean-PK pattern. `default_league_id text` for now.

> The existing `app.faab_transactions` table is from a later slice. Keep it or
> drop it — but if you keep it, know that nothing will read it for months.

### Indexes

Add only what the standings query needs: the primary keys above already cover
lookups by `league_id`. Resist adding speculative indexes — they cost writes and
you cannot tell which you need until a query is slow.

---

## Acceptance criteria

1. `python -m core.db.migrate` on a fresh database applies `0001_init` and
   records it in `public.schema_migrations`.
2. Running it again applies nothing.
3. `\dn` shows `app` and `sleeper`; `\dt sleeper.*` shows the four tables.
4. Inserting two rows into `sleeper.nfl_state` fails on the second.
5. Inserting a `sleeper.rosters` row for a nonexistent league fails the FK.
6. The same `user_id` can exist in `league_users` for two different
   `league_id`s.
7. `fpts` stores `104.56` and reads back exactly `104.56`, not `104.55999...`.

## Edge cases

- **`previous_league_id` is `null` on the earliest season**, and Sleeper sends
  an explicit JSON `null` rather than omitting it. That distinction bites in
  ingestion (spec 04), not here — but the column must be nullable.
- **`avatar` is an ID, not a URL.** Sleeper returns something like
  `"3d1a2b..."`; the image lives at
  `https://sleepercdn.com/avatars/thumbs/{id}`. Store the ID and build the URL
  in the response model. Storing the URL bakes today's CDN hostname into your
  data.
- **Use `numeric`, not `float`, for points.** Fantasy scores are decimal and get
  summed and compared; binary floating point makes `104.56` into something that
  is not `104.56`, and all-time records that are subtly wrong. This is the kind
  of bug that surfaces two seasons later.
- **`season` is text, not integer.** Sleeper sends `"2026"`. Storing it as text
  matches upstream and avoids a conversion that buys nothing — you never do
  arithmetic on it.
- **`roster_id` is only unique within a league.** It is a small integer, 1..12,
  reused every season. Never treat it as a global key.

## Concepts

- [Postgres schemas](https://www.postgresql.org/docs/current/ddl-schemas.html) — namespaces, and `search_path`
- [Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html) — check, FK, composite PK
- [Numeric types](https://www.postgresql.org/docs/current/datatype-numeric.html) — why `numeric` for money and scores
- [`GRANT`](https://www.postgresql.org/docs/current/sql-grant.html) — for reading `ROLES.sql`

## Done when

All seven criteria pass, and you can explain why `sleeper.*` and `app.*` are
separate — that reasoning drives every later slice.
