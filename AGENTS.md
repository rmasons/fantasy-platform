# Working agreement — how we build this

Read this before doing any work in this repo. It defines who does what, the
test-driven loop, and the rules for spinning up agents. See `README.md` for setup
and architecture, and [ADR 0002](docs/decisions/0002-ios-first-openapi-python-api.md)
for why the stack is what it is.

## Roles

| Role | Who | Responsibility |
|---|---|---|
| **Orchestrator / architect / reviewer** | **Opus** | Decompose work, write the contract + tests + acceptance criteria per slice, decide what to delegate, review & verify, own architecture |
| **Implementer fleet** | **Sonnet subagents** | Take a tight spec → make the failing tests pass → run checks. Used for web client and delegated API work |
| **Backend / product owner** | **Mason** | Owns priorities and slice sequencing; **writes the FastAPI routes and ingestion himself — this project is his vehicle for learning API development in Python**; gives frontend feedback |
| **VCS / rote chores** | **Haiku** | git commits, pushes, PR creation, branch ops, and other mechanical tasks — never spend a bigger model on these |

## The loop — test-driven, every slice

**TDD is non-negotiable. No implementation before a failing test that specifies it.**
(One sanctioned exception: Mason-authored API code — see TDD rules below.)

1. **Contract** — Opus writes the API/data contract + acceptance criteria for the
   slice. For this stack the contract is **Pydantic models plus the endpoint
   signature**, because that is what generates the OpenAPI spec and therefore
   both clients.
2. **Red** — write the failing tests first (they encode the contract and behavior).
3. **Green** — implement the minimum to make them pass (Sonnet for delegated work;
   Mason for owned logic).
4. **Refactor** — clean up with the tests green.
5. **Review** — a **fresh-context** review agent for anything non-trivial, before
   it lands.
6. **Verify** — tests + lint/type-check actually run and pass. Never trust an
   agent's self-report.

A slice is **done** only when its tests are green in CI **and the generated
clients are regenerated and committed**.

### TDD rules

- Test **behavior and contracts**, not implementation details.
- Pure logic (`src/core/`) → thorough **unit tests** with plain pytest. No
  database handle, no HTTP client, no fixtures beyond plain data.
- Route tests → **`fastapi.testclient.TestClient`** against a transactional test
  database; assert status codes, response schema, and auth gating (401 without a
  token, 403 for the wrong user).
- Ingestion tests → assert **idempotency** on upsert paths (run twice, same row
  count, no duplicates) and tolerance of Sleeper's `null`-vs-absent fields.
- Keep `src/core/` computation free of I/O so it is testable without a database.
- **Mason's API code gets session-written tests.** Because this project is
  Mason's vehicle for *learning API development*, he writes the routes and
  ingestion himself; a Claude session then writes the coverage. This is the one
  sanctioned deviation from strict test-first: the contract still comes first,
  but for Mason-authored code the tests may follow the implementation. The
  session writing them should treat it as a review — test the contract, probe
  edges (null/absent Sleeper fields, idempotency, auth gaps), and flag anything
  that looks wrong rather than writing tests that enshrine a bug. Use the tests
  to explain FastAPI and SQL concepts back to Mason where relevant.

### Commands

- **API (dev):** `PYTHONPATH=src uvicorn api.main:app --reload` → http://localhost:8000, interactive docs at `/docs`
- **Local Postgres:** `docker compose up -d`
- **Migrations:** `PYTHONPATH=src python -m core.db.migrate`
- **Ingestion:** `PYTHONPATH=src python -m ingestion backfill --league-id <id>` / `... daily`
- **Tests:** `pytest`
- **Lint:** `ruff check src tests`
- **Web tests:** once the web client exists (build spec 07)

CI runs ruff + pytest, and no-ops loudly while there is nothing to check.

## Conventions

- **Build specs live in [docs/build/](docs/build/)** — one per buildable unit,
  written just ahead of the work, never months ahead. That is the only place
  contracts live; there is no separate slices directory.
- **The OpenAPI spec is the coordination point.** Pydantic models define it;
  both clients are generated from it. Change the model first, regenerate second,
  update consumers third. Never hand-write a client type.
- **Generated clients are committed**, so a stale regeneration shows up as a diff
  in review rather than a runtime surprise. CI fails if regenerating produces a
  change.
- **Env-driven config** — `DATABASE_URL` and `FIREBASE_PROJECT_ID` on the API;
  `PUBLIC_API_BASE_URL` and `PUBLIC_FIREBASE_*` on the web client. Nothing
  host-specific in code.
- **Migrations are forward-only** — a new numbered file in `migrations/`, never
  an edit to one already applied. Rehearse against a Neon branch.
- **The web app is a client, not a server.** No SSR, no server routes, no data
  path except the API. This is load-bearing: it is what makes drift structurally
  impossible, not merely discouraged.
- **Keep [HANDOFF.md](HANDOFF.md) current** — update it during and at the end of
  each session whenever state materially changes. It is the resume point;
  updating it is part of finishing a task.

## Agentic rules

- **Model by task tier:** **Opus** = orchestration, architecture, reviews;
  **Sonnet** = implementation (default — escalate to Opus for subtle/hard tasks);
  **Haiku** = mechanical VCS chores (commits, pushes, PRs, branch ops). The
  tiering is a default, not a rule.
- **Specs, then stub scaffolds — never working logic.** This project is Mason's
  vehicle for learning API development in Python, so **do not hand him working
  implementation code**. Deliver two things, in order. **(1)** A build spec in
  `docs/build/`: goal, design decisions *and their reasoning*, the contract
  (field tables, response shapes, signatures), acceptance criteria, edge cases.
  **(2)** The stub files themselves — imports, signatures, decorators, type
  annotations, and structural wiring (router registration, `__main__` guards,
  config constants) in place, with **every body `raise NotImplementedError`**
  under a `TODO(spec NN section M)` saying what goes there and why. He writes
  the bodies.
  - **The line is setup vs. logic.** Scaffoldable: layout, imports, signatures,
    response-model annotations, decorators, registration, constants. Not
    scaffoldable: route bodies, SQL, parsing, computation, error handling.
  - **Reasoning goes in the docstring**, not only the spec, so it is legible
    where the code gets written.
  - **Leave it non-runnable** — never half-implement to make it start. Verify
    the stubs import cleanly and `ruff check src` is clean; say so, and say
    plainly that no acceptance criteria are green yet.
  - Tests are the carve-out above: he implements, a session covers.
- **Spec quality gates output** — the orchestrator's main job is crisp, testable
  contracts. Vague spec → bad code.
- **Delegate sizable, well-bounded tasks**; do trivial edits inline (spawning has
  cost + overhead).
- **Parallel file-mutating agents run in isolated worktrees** — avoids file
  collisions and inflated results.
- **Reviews are fresh-context**, independent of whoever wrote the spec — same
  reason the PR gate uses fresh context. Self-review shares blind spots.
- **Tooling:** the Agent tool (`model: sonnet`) for individual tasks; Workflow
  only for structured parallel fan-out when scale genuinely warrants it — flag
  the cost first.
