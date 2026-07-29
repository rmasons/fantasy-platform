# 03 — Sleeper client

**Goal:** one place that knows how to talk to Sleeper, so no other module builds
a URL or parses a response.

**Depends on:** [01 — Foundation](01-foundation.md) (settings).

| | |
|---|---|
| **New here** | `httpx`, and the first real testing work in the project — a fake HTTP server rather than mocks. No database, no FastAPI. |
| **Size** | Two files. One class of four methods, maybe eighty lines; a test module that will be longer than the code, which is the correct ratio here. |
| **Working when** | `get_state("nfl")` returns the live current week, and the rest of the suite passes with your network off. |
| **Why it is worth care** | This is the only module that talks to something you do not control. Every quirk you fail to absorb here leaks into ingestion and then into the database. |

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

## Before either file: look at the real responses

Unusually for this project, **explore before you specify**. You cannot write a
good client for an API whose payloads you have not seen, and Sleeper's docs do
not show every field.

```sh
curl -s https://api.sleeper.app/v1/state/nfl | python -m json.tool
curl -s https://api.sleeper.app/v1/league/<your_league_id>/rosters | python -m json.tool | head -60
curl -s https://api.sleeper.app/v1/league/<your_league_id>/users | python -m json.tool | head -40
```

Find `fpts` and `fpts_decimal` in the roster output and see for yourself whether
`fpts_decimal` is present. Find `metadata` in the users output and see whether
it is an object, `null`, or missing. The [Sleeper facts](#sleeper-facts-worth-knowing-before-you-write-either-file)
below will read as trivia until you have seen the payload they describe.

**You need a real league ID for this.** It is on the
[known-gaps list](../../HANDOFF.md#known-gaps-to-address-later) and it is now
blocking you.

---

## The files

| # | File | What it does | Closes |
|---|---|---|---|
| 1 | [`src/core/sleeper/client.py`](#1-srccoresleeperclientpy) | The client class | 1, 2, 3, 7 |
| 2 | [`tests/test_sleeper_client.py`](#2-teststest_sleeper_clientpy) | Fake server, error paths, live checks | 4, 5, 6, 8 |

They interleave more than that table suggests: build the client's happy path,
then stand up the fake server, then come back and write the error handling
against it. The order within each section says where to break off.

---

### 1. `src/core/sleeper/client.py`

A class wrapping an `httpx.Client`.

#### The shell

Constructor takes a base URL (defaulting from settings) and a timeout, builds the
`httpx.Client`, and implements `__enter__` / `__exit__` so the connection closes.

Reusing one `httpx.Client` across calls is the entire reason this is a class
rather than four functions — it keeps the connection pool warm across a backfill
that makes hundreds of requests.

**Check.** Exiting the context manager closes the underlying client.
**Closes criterion 7.**

#### The four methods

| Method | Endpoint | Returns |
|---|---|---|
| `get_state(sport="nfl")` | `/state/{sport}` | Current season, week, season type |
| `get_league(league_id)` | `/league/{id}` | League metadata, or `None` if absent |
| `get_league_users(league_id)` | `/league/{id}/users` | List of members |
| `get_rosters(league_id)` | `/league/{id}/rosters` | List of rosters |

Write `get_state` first — it takes no league ID, so it is the one you can verify
against the live API immediately. The other three are the same shape with
different paths.

**Resist a generic `_get(path)` helper** until all four exist and you can see what
they actually share. Extracting the abstraction you guessed at is harder than
extracting the one you observed.

Later slices add matchups, transactions, drafts, and players. Add them when the
slice needs them, not now.

**Check.** `get_state("nfl")` returns the live week; `get_league("<real_id>")`
returns a dict whose `league_id` matches what you asked for.
**Closes criteria 1 and 2.**

**Docs.** [httpx clients](https://www.python-httpx.org/advanced/clients/) ·
[Sleeper API](https://docs.sleeper.com/) — read the league and roster sections

#### Error handling

**Break off here and build the fake server (file 2) first.** Error handling you
cannot trigger on demand is error handling you have not tested, and you cannot
make the real Sleeper return a 500 for you.

Then, in this order:

1. **404 → `None`, not an exception.** "Does this league exist" is a question,
   and "no" is an answer. **Closes criterion 3.**
2. **A bounded timeout**, defaulting to about ten seconds. Never unbounded — a
   hung request in a backfill blocks the whole run. **Closes criterion 6.**
3. **Retry with backoff** on transient failures: connection errors, timeouts,
   5xx. A few attempts, not many. **Closes criterion 4.**
4. **Raise** on 5xx after retries are exhausted, and on unexpected 4xx.

Timeout before retry, because "retry on timeout" needs timeouts to exist first.

**The mistake to watch for** is a retry wrapper that catches everything,
including the 404 path you just built. After adding retries, re-run the 404 test
and check the call count — criterion 5 exists precisely to catch this.

**The judgment call.** Where retry logic lives: hand-rolled here, `httpx`'s
transport retries, or a library like `tenacity`. All three are defensible — but
know that `httpx`'s `Transport(retries=...)` only covers *connection* errors, not
5xx responses, so it alone will not close criterion 4.

**Docs.** [Timeouts](https://www.python-httpx.org/advanced/timeouts/) ·
[Transports](https://www.python-httpx.org/advanced/transports/)

---

### 2. `tests/test_sleeper_client.py`

Half the work of this spec, and the reason the ratio in the summary table looks
the way it does.

#### The fake server

Point `sleeper_base_url` at a local fake and assert that a normal response still
parses. That single test is what proves every later error-path test is exercising
your real request construction. **Closes criterion 8.**

**Two bits of setup the repo does not have yet**, both yours to decide rather
than pre-made for you:

- **The fake server is not installed.** `requirements-dev.txt` has only `pytest`
  and `ruff`. [`pytest-httpserver`](https://pytest-httpserver.readthedocs.io/) is
  a real dependency to add and gives you an actual socket;
  [`httpx.MockTransport`](https://www.python-httpx.org/advanced/transports/)
  ships inside `httpx` and needs nothing installed, but tests transport
  behaviour rather than a real connection. Either satisfies criterion 8.
- **A custom marker needs registering.** `@pytest.mark.live` warns unless it is
  declared under `[tool.pytest.ini_options] markers` in `pyproject.toml`. Adding
  `-m "not live"` to `addopts` makes offline the default and `pytest -m live` the
  deliberate act — which is the behaviour you want in CI.

Prefer the fake server over monkeypatching either way. You want failures in
*your* URL construction and error handling to show up, and a mock that returns
whatever you told it to cannot do that.

#### The error-path tests

| Test | Asserts | Closes |
|---|---|---|
| Fake returns 404 | Returns `None`, **and the fake was called exactly once** | 3, 5 |
| Fake returns 500 | Raises, after N attempts | 4 |
| Fake never responds | Fails on timeout; does not hang | 6 |

The call-count assertion in the first row is the real test in this spec — it is
what proves 404 escaped the retry logic.

#### The live tests

Criteria 1–3 hit the real API. Keep them few and mark them `live`.

**Check.** Disconnect from the network. Everything except the live tests passes.

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

## Sleeper facts worth knowing before you write either file

- **Sleeper returns `200` with a JSON `null` body** for some missing resources,
  rather than a 404. Handle a null body as "not found."
- **IDs are strings.** `league_id`, `user_id`, and `draft_id` are strings that
  look like numbers. Never coerce to `int` — you will lose leading characters
  and break comparisons.
- **Explicit `null` versus absent.** Sleeper sends `"previous_league_id": null`
  rather than omitting the key. `.get()` returns `None` for both, which is fine
  *here* — but spec 04 has to be careful, because "absent" and "null" can mean
  different things once you are writing to a schema.
- **`/players/nfl` is about 5 MB.** Not needed yet, but when it lands: fetch it
  at most once a day, slim it to the fields you use, and never call it per
  request. fantasy-tds caches it as a daily snapshot for exactly this reason.
- **No published rate limit does not mean no rate limit.** Be conservative,
  especially in a backfill that walks ten seasons.

## Done when

All eight criteria pass and the test suite runs offline apart from the three
live checks.
