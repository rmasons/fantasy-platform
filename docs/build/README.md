# Build specs

**You write the code. These specify what it has to do.**

Each spec gives the goal, the design decisions and *why* they were made, a
precise contract, acceptance criteria you can check, and the edge cases worth
knowing before you hit them. None of them contain implementations.

Where the line falls:

| These specs give you | You write |
|---|---|
| Table field lists, types, constraints | the `CREATE TABLE` SQL |
| Response shapes (field, type, nullable) | the Pydantic models |
| Endpoint method, path, status codes | the route handlers |
| Function signatures and behaviour | the function bodies |
| Edge cases and required behaviour | the code that handles them |

Tests are the carve-out in [AGENTS.md](../../AGENTS.md): you write the
implementation, a session writes the coverage and treats it as a review.

## Order

Each spec depends on the ones above it. **01 → 02 → 03** gets you a running API
with a real schema; **04** is the first feature that goes end to end.

| # | Spec | Status |
|---|---|---|
| 01 | [Foundation](01-foundation.md) | in progress — files 1–4 of 7 |
| 02 | [Schema & migrations](02-schema-and-migrations.md) | not started |
| 03 | [Sleeper client](03-sleeper-client.md) | not started |
| 04 | [Standings slice](04-standings-slice.md) | not started |
| 05 | [Auth](05-auth.md) | not started |
| 06 | OpenAPI clients & CI gate | spec not written |
| 07 | Web SPA | spec not written |
| 08 | iOS app | spec not written |

## What's in each

Every spec opens with a summary table — what's new, roughly how big, how you'll
know it works — then a **The files** manifest, then **one section per file**.
Each file section is self-contained: what it does, its contract, the decisions
left to you, the traps, a terminal check, which criteria it closes, and the docs
links for it. Read the summary table first; it tells you what you're in for.

The manifest is in dependency order, so working top to bottom means never
writing against something that doesn't exist yet.

**[01 — Foundation](01-foundation.md).** The app skeleton: a settings class, a
Postgres connection pool, a migration runner, and two health endpoints. Nothing
here is a feature; all of it is what specs 02–05 stand on. **This is the
reading-heaviest spec** — it introduces `pydantic-settings`, `psycopg` 3, and
FastAPI's dependency system all at once, and it carries a Learning references
section that the others don't need. Budget more time on the docs than the code.
*Done when `uvicorn` starts with Docker stopped and `/docs` renders.*

**[02 — Schema & migrations](02-schema-and-migrations.md).** One SQL file, and no
Python at all. It creates the `sleeper.*` / `app.*` split — the schema divided by
who writes it, which is the decision the whole data model hangs off — plus the
four tables standings needs. Being one file, it's organised **per table** rather
than per file. **The mistakes here are the expensive ones**: migrations are
forward-only, so a wrong column type is a second migration and a backfill rather
than an edit. *Done when the migration applies twice cleanly and you can explain
the two-schema split.*

**[03 — Sleeper client](03-sleeper-client.md).** One class over `httpx` that owns
every quirk of the upstream API — string IDs, explicit nulls, 404-means-no — plus
its test module, where half the work is. The project's first real testing work: a
fake HTTP server rather than mocks, so that your own URL construction is what's
under test. **Start by curling the real API** and reading the payloads; the
edge-case list is trivia until you've seen them. *Done when the suite passes with
your network off, apart from three live checks.*

**[04 — Standings slice](04-standings-slice.md).** The first vertical: Sleeper →
database → computed → HTTP → OpenAPI. Nothing new technically, but the largest
spec — it's specs 01–03 joined up, and it establishes the three-layer shape
(pure logic / ingestion / route) that every later feature copies. **Build the
middle first**: `compute_standings` is pure, needs no I/O, and closes six of the
fourteen criteria before anything is running — so it's file 1 in the manifest,
not the third thing left-to-right would suggest. *Done when your real league
returns in rank order and `openapi.json` describes it correctly.*

**[05 — Auth](05-auth.md).** Firebase ID token verification as a FastAPI
dependency, the `app.users` table, and the admin check composed on top. Short in
lines, long in criteria — ten of the twelve are rejections, which is why
`deps.py` is built in three passes with **the refusals before the happy path**.
*Done when a real token reaches a route as a UID and every malformed variant gets
a 401.*

**06–08 are deliberately unwritten.** Specifying something three months out means
designing against shapes that don't exist yet — the same mistake as writing the
code early. 06 is generated TypeScript and Swift clients plus the CI drift gate;
07 is the Svelte 5 + Vite SPA; 08 is SwiftUI. They get written when you reach
them.

Feature slices past standings are sequenced in [ROADMAP.md](../ROADMAP.md); each
gets a spec here when it starts.

## How to work through one

Each spec has the same four sections, in reading order:

| Section | What it's for |
|---|---|
| Summary table | What's new, how big, how you'll know it works. Read this first. |
| **Design decisions** | Settled choices *and why*, but only the ones spanning more than one file. The reasoning matters more than the checklist — it's what lets you make the next decision yourself. |
| **The files** | A manifest in dependency order, then one self-contained section per file. This is the bulk of the spec and where you'll live while building. |
| Acceptance criteria | The scorecard. Each is claimed by a file section; this is the list to run at the end, all together. |

Each file section follows the same shape: what it does → the contract (fields,
types, status codes) → decisions left to you → traps → **Check** → which criteria
it closes → docs links.

Then:

1. Read the whole spec before writing anything, Design decisions included.
2. Work down the file manifest in order. It's dependency-ordered, so nothing is a
   forward reference — but the order is *not* always what you'd guess. Spec 04
   starts with the pure function, not the ingestion; spec 05 starts with the
   migration and the config guard, not the token handling.
3. Run each file's **Check** before moving on. An unverified file is one you'll
   debug later, wearing another file's symptoms.
4. Write a failing test first wherever it's testable — always for pure logic,
   rarely for a `CREATE TABLE`.
5. Ask for a coverage pass once the criteria are green.

Where a file gets built in more than one pass — spec 03's client, spec 05's
`deps.py` — that's called out inside its section rather than split across the
manifest, so everything about a file stays in one place.

If a spec seems wrong, say so. They are written ahead of the code, which means
they are written with incomplete information — the scaffold they replaced had
bugs in it too.

## Before you start

Nothing in this repo has ever run. [docs/SETUP.md](../SETUP.md) steps 1–2 get
you a Python env and a local Postgres in Docker; spec 01 assumes both.
