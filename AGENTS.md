# Working agreement — how we build this

Read this before doing any work in this repo. It defines who does what, the
test-driven loop, and the rules for spinning up agents. See `README.md` for setup
and architecture.

## Roles

| Role | Who | Responsibility |
|---|---|---|
| **Orchestrator / architect / reviewer** | **Opus** | Decompose work, write the contract + tests + acceptance criteria per slice, decide what to delegate, review & verify, own architecture |
| **Implementer fleet** | **Sonnet subagents** | Take a tight spec → make the failing tests pass → run checks. Used for frontend, and for backend drafts when asked |
| **Backend / DB owner + product** | **Mason** | Owns the Python backend, DB, and priorities; gives frontend feedback; pulls in agent help on backend on request |
| **VCS / rote chores** | **Haiku** | git commits, pushes, PR creation, branch ops, and other mechanical tasks — never spend a bigger model on these |

## The loop — test-driven, every slice

**TDD is non-negotiable. No implementation before a failing test that specifies it.**

1. **Contract** — Opus writes the API/data contract + acceptance criteria for the slice.
2. **Red** — write the failing tests first (they encode the contract and the behavior).
3. **Green** — implement the minimum to make them pass (Sonnet for delegated work; Mason for owned backend).
4. **Refactor** — clean up with the tests green.
5. **Review** — a **fresh-context** review agent for anything non-trivial, before it lands.
6. **Verify** — tests + lint/compile actually run and pass. Never trust an agent's self-report.

A slice is **done** only when its tests are green in CI.

### TDD rules
- Test **behavior and contracts**, not implementation details.
- Pure logic (standings sort, keeper cost, trade value, …) → thorough **unit tests**.
- DB / ingestion → **integration tests** against a disposable test schema; assert **idempotency** (run twice, same result).
- Keep `core/` logic storage-agnostic so it's unit-testable without a DB.

### Commands
- Backend tests: `PYTHONPATH=src pytest`
- Lint/format: `ruff check . && ruff format .`
- Frontend tests (once the frontend lands): `vitest` (+ Playwright for e2e)

## Agentic rules

- **Model by task tier:** **Opus** = orchestration, architecture, reviews; **Sonnet** = implementation (default — escalate to Opus for subtle/hard tasks); **Haiku** = mechanical VCS chores (commits, pushes, PRs, branch ops). The tiering is a default, not a rule.
- **Spec quality gates output** — the orchestrator's main job is crisp, testable contracts. Vague spec → bad code.
- **Delegate sizable, well-bounded tasks**; do trivial edits inline (spawning has cost + overhead).
- **Parallel file-mutating agents run in isolated worktrees** — avoids the file collisions / inflated results we hit before.
- **Reviews are fresh-context**, independent of whoever wrote the spec — same reason the PR gate uses fresh context. Self-review shares blind spots.
- **Tooling:** the Agent tool (`model: sonnet`) for individual tasks; the Workflow tool only for structured parallel fan-out when scale genuinely warrants it — and flag the cost first.

## Conventions

- **Env-driven config** — identical code runs on local Docker and Railway; nothing host-specific in code.
- **Schema ownership** — `app.*` (web-owned) vs `sleeper.*` (ingestion-owned), with DB-role separation (`migrations/ROLES.sql`).
- **Migrations** — plain numbered SQL in `migrations/`, applied by `core.db.migrate`.
- **The API contract is the coordination point** between backend (Mason) and frontend (Opus/Sonnet): agree on the JSON shape first, build both sides against it in parallel (frontend mocks it until the endpoint is live).
- **Keep [HANDOFF.md](HANDOFF.md) current** — update it during and at the end of each session whenever state materially changes (a slice ships, a decision lands, a blocker clears). It's the resume point; updating it is part of finishing a task.
