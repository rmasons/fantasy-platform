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

| # | Spec | Gets you | Status |
|---|---|---|---|
| 01 | [Foundation](01-foundation.md) | Config, DB pool, migration runner, app entry, health routes | not started |
| 02 | [Schema & migrations](02-schema-and-migrations.md) | The `app.*` / `sleeper.*` split and the first migration | not started |
| 03 | [Sleeper client](03-sleeper-client.md) | A typed, tested read-only client for the Sleeper API | not started |
| 04 | [Standings slice](04-standings-slice.md) | First vertical: ingest → compute → endpoint → generated clients | not started |
| 05 | [Auth](05-auth.md) | Firebase ID token verification, `users` table, Sleeper linking | not started |
| 06 | OpenAPI clients & CI gate | Generated TS + Swift clients, drift gate in CI | spec not written |
| 07 | Web SPA | Svelte 5 + Vite replacing SvelteKit | spec not written |
| 08 | iOS app | SwiftUI + generated client | spec not written |

Specs 06–08 are deliberately unwritten. Writing a spec for something three
months out means designing against shapes that don't exist yet — the same
mistake as writing the code early. They get written when you reach them.

Feature slices past standings are sequenced in [ROADMAP.md](../ROADMAP.md); each
gets a spec here when it starts.

## How to work through one

1. Read the whole spec, including **Design decisions** — the reasoning matters
   more than the checklist.
2. Write a failing test for the first acceptance criterion.
3. Implement until it passes.
4. Repeat down the criteria.
5. Ask for a coverage pass when the spec's criteria are green.

If a spec seems wrong, say so. They are written ahead of the code, which means
they are written with incomplete information — the scaffold they replaced had
bugs in it too.

## Before you start

Nothing in this repo has ever run. [docs/SETUP.md](../SETUP.md) steps 1–2 get
you a Python env and a local Postgres in Docker; spec 01 assumes both.
