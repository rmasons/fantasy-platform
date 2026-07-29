# 02 — Schema & migrations

**Goal:** a first migration that creates the two-schema split and the tables the
standings slice needs.

**Depends on:** [01 — Foundation](01-foundation.md) (the migration runner).

| | |
|---|---|
| **New here** | Postgres DDL written by hand — schemas as namespaces, composite primary keys, check constraints, `numeric`. **No new Python at all.** |
| **Size** | One SQL file, on the order of eighty lines. The shortest spec here. |
| **Working when** | `python -m core.db.migrate` applies `0001_init`, and `\dt sleeper.*` in psql lists four tables. |
| **Watch out for** | This is the spec whose mistakes are expensive. Migrations are forward-only, so a wrong column type becomes a second migration and a data backfill rather than an edit. Spend the time here. |

**Getting a psql prompt** — you will want one throughout, and the criteria assume
it:

```sh
docker compose exec db psql -U fantasy -d fantasy
```

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

## The file

**`migrations/0001_init.sql`** — a new file. The only thing in `migrations/`
today is `ROLES.sql`.

An earlier version existed and was deleted with the scaffold; it is recoverable
at `git show 8cd19f0~1:migrations/0001_init.sql` if you want to compare
afterwards. It had the schema split and several tables right, but was written
against a plan that has since changed and referenced two documents that no longer
exist — so treat it as a second opinion, not a starting point.

**Write the whole file before applying any of it.** There is no
partial-run-and-iterate loop here: once `0001_init` is recorded as applied the
runner will not touch it again. Draft it, apply it, and if it is wrong, drop the
database and start over. That is cheap **now** and expensive after spec 04 puts
real data in it.

**Read `migrations/ROLES.sql` before you start.** It already names `app` and
`sleeper` and grants against them, so it is effectively a specification for the
file you are about to write. If your schema names disagree with it, `ROLES.sql`
is right.

### Objects, in the order to write them

| # | Object | Why here |
|---|---|---|
| 1 | [The two schemas](#1-the-schemas) | Everything else lives inside them |
| 2 | [`sleeper.leagues`](#2-sleeperleagues) | The parent every other Sleeper table points at |
| 3 | [`sleeper.league_users`](#3-sleeperleague_users) | Child of leagues |
| 4 | [`sleeper.rosters`](#4-sleeperrosters) | Child of leagues |
| 5 | [`sleeper.nfl_state`](#5-sleepernfl_state) | Independent; introduces the singleton trick |
| 6 | [`app.app_config`](#6-appapp_config) | The singleton trick, second time |
| 7 | [Indexes](#7-indexes) | After the tables exist, if at all |

---

### 1. The schemas

`CREATE SCHEMA` for `app` and `sleeper`. Two lines, and the whole ownership
argument above rests on them.

Make them idempotent-friendly (`if not exists`) — not because the runner will
re-run this file, but because you will be dropping and recreating this database
by hand several times over the next few specs.

**Check.** `\dn` lists both.

---

### 2. `sleeper.leagues`

The root of the Sleeper data. Write it first because everything else carries a
foreign key to it.

| Column | Type | Notes |
|---|---|---|
| `league_id` | `text` | PK — Sleeper's ID, a string, not a number |
| `season` | `text` | |
| `name` | `text` | |
| `status` | `text` | `pre_draft` / `drafting` / `in_season` / `complete` |
| `previous_league_id` | `text` | Nullable — the season chain |
| `settings` | `jsonb` | not null, default `'{}'` |
| `is_final` | `boolean` | not null, default `false` |
| `synced_at` | `timestamptz` | not null, default `now()` |

**Two type decisions that are the point of this table.**

- **`league_id` is `text`.** It is a string of digits, and typing it `bigint`
  is precisely the mistake this spec exists to prevent. Same for `user_id` and
  `draft_id` later.
- **`season` is `text`, not `integer`.** Sleeper sends `"2026"`. Text matches
  upstream and avoids a conversion that buys nothing — you never do arithmetic
  on a season.

**`previous_league_id` must be nullable.** It is `null` on the earliest season,
and Sleeper sends an explicit JSON `null` rather than omitting the key. That
distinction bites in ingestion (spec 04), not here — but get the nullability
right now, because changing it later is a migration.

Deliberately **not** an FK to itself. The chain can point at a league you have
not ingested yet, and a self-FK would make ingestion order load-bearing.

---

### 3. `sleeper.league_users`

League membership and display identity, per season.

| Column | Type | Notes |
|---|---|---|
| `league_id` | `text` | PK part 1, FK → `sleeper.leagues` |
| `user_id` | `text` | PK part 2 — Sleeper's user ID |
| `display_name` | `text` | |
| `team_name` | `text` | Nullable — lives in Sleeper's `metadata.team_name` |
| `avatar` | `text` | Nullable — the **ID**, not the URL |

**Composite primary key `(league_id, user_id)`.** The same person across two
seasons is two rows, because their team name and avatar can differ per season.
This is what criterion 6 tests.

**`avatar` stores the ID.** Sleeper returns something like `"3d1a2b…"`; the image
lives at `https://sleepercdn.com/avatars/thumbs/{id}`. Store the ID and build the
URL in the response model (spec 04). Storing the URL bakes today's CDN hostname
into your data.

Write the FK to `leagues` explicitly rather than leaving it implied.

---

### 4. `sleeper.rosters`

| Column | Type | Notes |
|---|---|---|
| `league_id` | `text` | PK part 1, FK → `sleeper.leagues` |
| `roster_id` | `integer` | PK part 2 — unique within a league only |
| `owner_id` | `text` | Nullable — an orphaned roster has no owner |
| `wins` / `losses` / `ties` | `integer` | not null, default 0 |
| `fpts` / `fpts_against` | `numeric` | not null, default 0 |

**`numeric`, not `float`, for points.** Fantasy scores are decimal and get summed
and compared; binary floating point turns `104.56` into something that is not
`104.56`, and all-time records that are subtly wrong two seasons from now. This
is criterion 7, and it is worth seeing rather than believing — once the table
exists, run both of these:

```sql
select 104.56::float8   + 0.01;  -- 104.57000000000001
select 104.56::numeric  + 0.01;  -- 104.57
```

**`roster_id` is only unique within a league.** A small integer, 1..12, reused
every season. Never treat it as a global key — which is exactly why it is half of
a composite PK rather than a PK on its own.

**`owner_id` is nullable.** A roster can lose its owner when someone leaves
mid-season. It still played games and still belongs in the standings.

**Check (criterion 5).** Insert a roster row for a league ID that does not exist
and confirm the FK rejects it.

---

### 5. `sleeper.nfl_state`

Single-row table holding the current NFL week.

| Column | Type | Notes |
|---|---|---|
| `id` | `boolean` | PK, default `true`, `check (id)` |
| `season` | `text` | e.g. `"2026"` |
| `week` | `integer` | |
| `season_type` | `text` | `pre` / `regular` / `post` |
| `synced_at` | `timestamptz` | not null, default `now()` |

**The singleton trick** is the thing to learn here: the column is a boolean, the
check constraint forbids `false`, and it is the primary key — so `true` is the
only value it can hold and only one row can ever exist. No trigger, no
application-level guard, enforced by the database.

Independent of the other three tables, so its position in the file does not
matter.

**Check (criterion 4).** Insert one row; it works. Insert a second; it fails.
Then convince yourself *why* before moving on — that understanding is what makes
the next table five seconds of work.

---

### 6. `app.app_config`

Singleton, same boolean-PK pattern. `default_league_id text` for now.

Deliberately repetitive. If the pattern from table 5 did not stick, this is where
you find out, and it is a cheap place to find out.

> The old `app.faab_transactions` table in the recoverable version is from a much
> later slice. Keep it or drop it — but if you keep it, know that nothing will
> read it for months.

---

### 7. Indexes

Add only what the standings query needs, which is very likely nothing: the
primary keys above already cover lookups by `league_id`.

Resist speculative indexes. They cost writes, and you cannot tell which you need
until a query is actually slow.

---

## Applying it

```sh
PYTHONPATH=src python -m core.db.migrate
```

**Closes criteria 1 and 2** — run it twice, and the second run must apply
nothing.

**If it fails halfway**, spec 01's commit-together guarantee means `0001` is left
*unrecorded*, so you can fix the SQL and re-run — but only once the partially
created objects are gone. Dropping the whole database is the reliable reset:

```sh
docker compose down -v && docker compose up -d
```

**Then verify in psql, not in your head.** `\dn` for schemas, `\dt sleeper.*` for
tables, `\d sleeper.rosters` for one table's columns and constraints. **Closes
criterion 3.**

**Then try to violate the constraints.** Criteria 4, 5, 6, and 7 are three
deliberate failures and one deliberate success, run by hand at the prompt. Doing
them by hand is the point — you are checking your mental model of the schema, not
exercising code.

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

## Concepts

- [Postgres schemas](https://www.postgresql.org/docs/current/ddl-schemas.html) — namespaces, and `search_path`
- [Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html) — check, FK, composite PK
- [Numeric types](https://www.postgresql.org/docs/current/datatype-numeric.html) — why `numeric` for money and scores
- [`GRANT`](https://www.postgresql.org/docs/current/sql-grant.html) — for reading `ROLES.sql`

## Done when

All seven criteria pass, and you can explain why `sleeper.*` and `app.*` are
separate — that reasoning drives every later slice.
