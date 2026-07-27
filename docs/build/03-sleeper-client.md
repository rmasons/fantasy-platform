# 03 — Sleeper client

**Goal:** one place that knows how to talk to Sleeper, so no other module builds
a URL or parses a response.

**Depends on:** [01 — Foundation](01-foundation.md) (settings).

---

## Design decisions

**One client, no scattered `httpx` calls.** Sleeper's quirks — string IDs,
explicit nulls, a 5 MB players payload — get handled once, here. Every module
that instead reached for `httpx` directly would have to rediscover them.

**Read-only and unauthenticated.** Sleeper's public API needs no key and this
app never writes to it. That means there is no credential to manage, and it also
means **you are a guest**: be conservative with request volume.

**Base URL comes from settings.** Tests point it at a local fake instead of
mocking `httpx` internals — testing against a fake server exercises your actual
request construction, which mocks do not.

**Return raw dicts, not models.** Validation belongs at the ingestion boundary
(spec 04), where you decide what a missing field means for *your* schema. A
client that validated would have to change every time Sleeper added a field.

---

## What to build

`src/core/sleeper/client.py` — a class wrapping an `httpx.Client`.

### Methods needed now

| Method | Endpoint | Returns |
|---|---|---|
| `get_state(sport="nfl")` | `/state/{sport}` | Current season, week, season type |
| `get_league(league_id)` | `/league/{id}` | League metadata, or `None` if absent |
| `get_league_users(league_id)` | `/league/{id}/users` | List of members |
| `get_rosters(league_id)` | `/league/{id}/rosters` | List of rosters |

Later slices add matchups, transactions, drafts, and players. Add them when the
slice needs them, not now.

### Behaviour

- A configurable timeout, defaulting to about 10 seconds. Never unbounded — a
  hung request in the ingestion job blocks the whole run.
- Raise on 5xx and on unexpected 4xx.
- **404 returns `None`** rather than raising, for the "does this league exist"
  question. A missing league is an answer, not an error.
- Usable as a context manager so the connection closes.
- Retry on transient failures — connection errors, timeouts, 5xx — with backoff.
  A few attempts, not many. **Do not retry 404s.**

---

## Acceptance criteria

1. `get_state("nfl")` against the real API returns a dict with `season`, `week`,
   `season_type`.
2. `get_league("<real_id>")` returns a dict whose `league_id` matches what was
   asked for.
3. `get_league("0")` (nonexistent) returns `None` — it does not raise.
4. A 500 from a fake server raises after exhausting retries.
5. A 404 from a fake server returns `None` **without** retrying — assert the
   fake was called exactly once.
6. A server that never responds fails on timeout rather than hanging.
7. Exiting the context manager closes the underlying client.
8. Pointing `sleeper_base_url` at a fake server routes all calls there — no test
   touches the real API except criteria 1–3.

## Edge cases

- **Sleeper returns `200` with a JSON `null` body** for some missing resources,
  rather than a 404. Handle a null body as "not found."
- **IDs are strings.** `league_id`, `user_id`, and `draft_id` are strings that
  look like numbers. Never coerce to `int` — you will lose leading characters
  and break comparisons.
- **Explicit `null` versus absent.** Sleeper sends `"previous_league_id": null`
  rather than omitting the key. `.get()` returns `None` for both, which is fine
  here — but spec 04 has to be careful, because "absent" and "null" can mean
  different things.
- **`/players/nfl` is about 5 MB.** Not needed yet, but when it lands: fetch it
  at most once a day, slim it to the fields you use, and never call it per
  request. fantasy-tds caches it as a daily snapshot for exactly this reason.
- **No published rate limit does not mean no rate limit.** Be conservative,
  especially in a backfill that walks ten seasons.

## Testing note

Prefer a real fake server (`pytest-httpserver`, or `httpx.MockTransport`) over
monkeypatching. You want failures in *your* URL construction and error handling
to show up, and a mock that returns whatever you told it to cannot do that.

Criteria 1–3 hit the live API — keep them few, and mark them so they can be
skipped offline.

## Concepts

- [Sleeper API docs](https://docs.sleeper.com/) — read the league and roster sections
- [httpx clients](https://www.python-httpx.org/advanced/clients/) — connection reuse, timeouts
- [Timeouts](https://www.python-httpx.org/advanced/timeouts/)
- [pytest-httpserver](https://pytest-httpserver.readthedocs.io/)

## Done when

All eight criteria pass and the test suite runs offline apart from the three
live checks.
