# ADR 0002 — iOS-first: an OpenAPI-contracted Python API

- **Status:** Accepted
- **Date:** 2026-07-27
- **Supersedes:** the Convex backend decision (2026-07-06 session log); the
  Python scaffold's "superseded" status is **reversed**
- **Relationship to [ADR 0001](0001-auth-provider-and-native-clients.md):** its
  *auth decision* (Firebase Auth) stands unchanged and is carried into this
  stack via `firebase-admin`. Its *iOS reasoning* — that ConvexMobile makes a
  native client nearly free — is superseded by the findings below.

> **Amendment, 2026-07-27 (same day).** This ADR was written while the 454-line
> Python scaffold in `src/` still existed, and several passages below describe
> it in the present tense. It has since been **deleted** — it was written *for*
> Mason by an earlier session, which defeats the purpose of a project whose
> point is learning API development. Its design reasoning was carried into
> [`docs/build/`](../build/) as requirements first. The stack decision below is
> unaffected; only the starting position changed, from "a scaffold to fix" to "a
> spec to implement." See the "specs, not scaffolds" rule in
> [AGENTS.md](../../AGENTS.md).

## Context

### The goal moved

fantasy-platform was conceived as a clean slate to tighten the architectural
problems in fantasy-tds. **Convex was added afterwards, as a learning
opportunity** — its appeal was an API structure that was approachable to own and
maintain, at a time when iOS was not part of the conversation.

iOS is now the **primary** goal. The stated requirement:

> A service that serves both a web and iOS app with the same API endpoints, so
> logic lives in one location and does not drift between them.

That reprioritization is what forces this decision. It demotes "learn Convex"
from the project's purpose to a nice-to-have, and once that stops carrying the
architecture, Convex has to justify itself on the new goal alone.

### What the investigation found

**`convex-swift` is not ready to be the foundation of a native app.**

| | Version | Last release | Stars |
|---|---|---|---|
| `get-convex/convex-swift` | 0.8.1 | Feb 2026 (5 months) | 47 |
| `apple/swift-openapi-generator` | 1.13.0 | Jul 2026 (3 weeks) | 1,951 |

Its open issues include *"Add local database caching layer (offline-first)"* and
*"Add optimistic updates support"* — so **no offline reads and no optimistic
writes**, the two things that make an app feel native — plus an open data race
(`ConvexClientWithAuth.authBridge is mutated without synchronization`) sitting
directly on the auth path a Firebase `AuthProvider` would use.

**Using Convex as a plain HTTP API discards its value.** The escape hatch is
`httpAction`, but that is a bare `Request → Response` primitive: hand-rolled
routing, validation, auth, and error shapes, and **no OpenAPI spec**. That
surrenders the reactive typed clients that are Convex's entire proposition while
keeping the parts any framework provides.

### "Same endpoints" is not sufficient for no drift

Both clients can call `/standings/{league_id}` and still disagree about the
response *shape* — a nullable field, a renamed key, a number that became a
string. Shared endpoints prevent duplicated **logic**; they do not prevent
duplicated **assumptions**.

What enforces it is **one machine-readable contract with generated clients on
both sides**: an OpenAPI spec as the source of truth, TypeScript types generated
for web, Swift `Codable` structs generated for iOS, and CI asserting the server
still satisfies the spec. A breaking change then fails the build instead of
failing on someone's phone.

This reframing is what selects the stack, because it changes the question from
"which backend is nicest to write" to "which backend *emits a contract*."

### The scaffold already in this repo answered it

`src/` — marked superseded, never deleted — was **FastAPI + Pydantic + Postgres +
`firebase-admin`**, 454 lines across routes, a Sleeper client, ingestion
backfill/daily, config, and a connection pool. It was abandoned for the Convex
pivot, not because it was wrong. That it already existed, in the right language
with the right auth dependency, is evidence the original instinct was sound.

(Per the amendment above, the code is gone and its reasoning lives in
`docs/build/`. The point stands: the answer was already here.)

## Decision

**Build an OpenAPI-contracted Python API as the single source of truth, consumed
by generated clients on web and iOS.**

```
Sleeper API
    ↓ ingestion (Python, scheduled)
Neon Postgres ── FastAPI on Cloud Run ── OpenAPI spec
                                          ├─ generated TS client → Svelte SPA
                                          └─ generated Swift client → SwiftUI
                 Firebase Auth (ID tokens verified via firebase-admin)
```

| Layer | Choice |
|---|---|
| API | **FastAPI + Pydantic** — OpenAPI generation is automatic, not assembled |
| Database | **Neon Postgres** |
| API hosting | **Cloud Run** (container; Railway is the simpler fallback) |
| Identity | **Firebase Auth** (unchanged from ADR 0001) |
| Web | **Svelte 5 + Vite SPA**, static-hosted on Firebase Hosting |
| iOS | **SwiftUI** + `swift-openapi-generator` client |

### Why Python

1. **The contract is free.** FastAPI derives the OpenAPI spec from the Pydantic
   models that already validate requests and serialize responses. One definition
   serves validation, serialization, and both generated clients. Convex emits no
   spec; Hono needs a Zod→OpenAPI layer wired and maintained by hand.
2. **It is the language Mason already works in.** The stated goal was "an API
   structure I could understand and maintain." That is maximized in his
   professional language, not in a runtime he has never used. Learning Node to
   write an API is a real cost with no payoff against this goal.
3. **It fits where the roadmap goes.** Luck and schedule analysis, Monte Carlo
   playoff odds, bench-regret tracking, all-time records — analytical work over
   historical data. SQL and Python are the right tools and his strongest ones.
4. **Consistency with ADR 0001.** `firebase-admin` is already a scaffold
   dependency; the Firebase Auth decision carries over untouched.

### Why Postgres, and why Neon

The data is genuinely relational — leagues, seasons, rosters, matchups,
transactions, chained by `previous_league_id` — and the differentiating features
are historical aggregations across seasons. A document store pushes those into
application code.

Neon over Supabase, decided on **idle behavior**, because fantasy football is
dead February–July:

| | Free-tier idle |
|---|---|
| Supabase | Pauses after **7 days** low activity; **manual restore** from the dashboard |
| Neon | Scale-to-zero after 5 min; **auto-resumes on next connection** |

Supabase's common workaround is a keep-alive cron that exists only to defeat the
platform's own policy. Neon also gives 10 branches per project on the free tier,
which maps onto `dev → test → main`, and it is plain Postgres rather than a
platform whose auth, storage, realtime, and RLS we have already declined.

### Why Cloud Run

The scaffold uses `psycopg-pool`, which needs a **long-lived process**. That
rules out serverless functions, where every invocation cold-starts and pooling
cannot work — the classic serverless-plus-Postgres footgun. Cloud Run scales to
zero, sits in the same Google project as Firebase, and Docker is transferable.
Railway remains the simpler fallback if deployment friction outweighs the
learning.

### Why a Svelte SPA instead of SvelteKit

A static SPA **has no server, so it cannot reach data by any path except the
API.** The drift is not merely fixed; it becomes structurally impossible. It
also deletes the machinery that caused the problem — SSR, adapters, the
`+page.server.ts` / `+page.ts` duality, form actions, `hooks.server.ts` — while
keeping Svelte 5, which is already familiar.

## Consequences

### Good

- One contract, two generated clients, no drift by construction.
- iOS depends on a first-party Apple tool at 1.13 rather than a third-party
  client at 0.8.1 — and gains offline and optimistic updates, because those
  become the client's business rather than a library's missing feature.
- Widgets, App Intents, and notification extensions work over plain HTTPS.
- The API is portable: nothing about it is tied to a hosting vendor.
- Analytical features land in the language and query engine suited to them.

### Bad / accepted

- **~3,900 lines of fantasy-tds server logic must be ported** to Python —
  keeper cost, power rankings, superlatives, trade analytics, rivalry. This is
  the real bill. It is *not* new cost relative to the original plan: a clean
  slate always implied rewriting that logic, and a Convex rebuild would have
  required it too. This decision only changes the target language.
- **Two languages in the tree** (Python API, TypeScript web). The OpenAPI spec
  is the seam, which is the point.
- **Cold starts compound** — ~1–2s for a Python container plus a few hundred ms
  for Neon on the first request after idle. Acceptable for twelve users; the
  price of a $0 idle bill.
- **The DB is no longer private-by-network.** The scaffold's comments assume
  Railway's private Postgres plugin ("no public exposure"). Neon is an
  internet-reachable endpoint protected by TLS and credentials, with IP
  allowlisting only on paid tiers. A deliberate downgrade of the network model
  in exchange for the idle behavior — acceptable for this data, but it must not
  be forgotten when the FAAB ledger and dues ledger land.
- **Convex is discarded** (347 lines) along with the learning opportunity that
  motivated it. Available again later as a side project with lower stakes.

### What survives

- ADR 0001's Firebase Auth decision, intact.
- The whole feature roadmap — it was never stack-specific.
- The slice discipline and TDD loop from `AGENTS.md`, retargeted to pytest.
- `StandingsTable.svelte` and its 9 passing tests.
- `docker-compose.yml` (local Postgres) and `migrations/ROLES.sql`.
- The scaffold's *design reasoning*, carried into `docs/build/` as requirements
  after the code itself was removed (see the 2026-07-27 entry in HANDOFF): the
  `app.*`/`sleeper.*` ownership split, `min_size=0` so the API boots with the DB
  down, `/ping` vs `/health` as liveness vs readiness, and the local-auth bypass
  that must fail loudly outside local.

## Alternatives considered

| Option | Verdict |
|---|---|
| **Extend fantasy-tds into the API** | Strongest rival. Reuses ~3.9k lines of working logic and 30 live endpoints — fastest route to a working iOS app. Rejected because it forfeits the clean slate that is fantasy-platform's original purpose, keeps the Vercel + Firestore + Redis + Blob stack, and leaves the API in a language Mason is less confident maintaining. |
| **Convex + `convex-swift`** | Rejected. Pre-1.0, five months stale, no offline, no optimistic updates, open auth-path data race. |
| **Convex as a headless HTTP API** | Rejected. Emits no OpenAPI spec and surrenders Convex's actual value; the remaining benefit over a conventional API is small. |
| **Convex + static JSON snapshots to object storage** | Genuinely good, and still available *as a caching layer* later. Rejected as the primary answer because it does not address the contract problem — snapshots need a schema too. |
| **Hono + Zod OpenAPI (Node/TS)** | Viable and would keep one language. Rejected: requires learning Node for no benefit against the stated goal, and assembles by hand what FastAPI provides natively. |
| **Firestore instead of Postgres** | Rejected. Lower ops burden, but pushes historical aggregation — the app's differentiator — into application code. |
| **Supabase instead of Neon** | Rejected on the 7-day pause plus manual restore, against a seasonal usage pattern. |

## Follow-ups

- [ ] Delete `convex/`, root `tsconfig.json`, `vitest.config.ts`, and the root
      `package.json` (Convex-only). Separate commit from the docs.
- [ ] Rewrite `.github/workflows/verify.yml` for pytest + ruff; the two
      Claude review workflows are stack-agnostic and unchanged.
- [ ] Replace `web/` (SvelteKit) with a Svelte 5 + Vite SPA; port
      `StandingsTable.svelte` and its tests.
- [ ] Add the OpenAPI drift gate to CI: regenerate clients, fail if the
      committed spec or generated types are stale.
- [x] ~~Rewrite `docs/slices/standings.md`~~ — superseded by
      [build spec 04](../build/04-standings-slice.md); the directory is gone.
- [ ] Add a `Dockerfile` (Cloud Run) or `Procfile` (Railway) once the hosting
      target is final. Both were removed as premature.
- [ ] Revisit ADR 0001's ConvexMobile follow-ups — now moot.

## References

- [convex-swift](https://github.com/get-convex/convex-swift) ·
  [Convex Swift docs](https://docs.convex.dev/client/swift)
- [apple/swift-openapi-generator](https://github.com/apple/swift-openapi-generator)
- [FastAPI](https://fastapi.tiangolo.com/) ·
  [Neon scale to zero](https://neon.com/docs/introduction/scale-to-zero) ·
  [Supabase project pausing](https://supabase.com/docs/guides/platform/free-project-pausing)
