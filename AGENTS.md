# Working agreement — how we build this

Read this before doing any work in this repo. It defines who does what, the
test-driven loop, and the rules for spinning up agents. See `README.md` for setup
and architecture.

## Roles

| Role | Who | Responsibility |
|---|---|---|
| **Orchestrator / architect / reviewer** | **Opus** | Decompose work, write the contract + tests + acceptance criteria per slice, decide what to delegate, review & verify, own architecture |
| **Implementer fleet** | **Sonnet subagents** | Take a tight spec → make the failing tests pass → run checks. Used for frontend and Convex function implementation |
| **Backend / product owner** | **Mason** | Owns priorities and slice sequencing; builds ingestion logic and Convex mutations on request; gives frontend feedback |
| **VCS / rote chores** | **Haiku** | git commits, pushes, PR creation, branch ops, and other mechanical tasks — never spend a bigger model on these |

## The loop — test-driven, every slice

**TDD is non-negotiable. No implementation before a failing test that specifies it.**

1. **Contract** — Opus writes the API/data contract + acceptance criteria for the slice.
2. **Red** — write the failing tests first (they encode the contract and the behavior).
3. **Green** — implement the minimum to make them pass (Sonnet for delegated work; Mason for owned logic).
4. **Refactor** — clean up with the tests green.
5. **Review** — a **fresh-context** review agent for anything non-trivial, before it lands.
6. **Verify** — tests + lint/type-check actually run and pass. Never trust an agent's self-report.

A slice is **done** only when its tests are green in CI.

### TDD rules
- Test **behavior and contracts**, not implementation details.
- Pure logic (`convex/lib/`) → thorough **unit tests** with plain vitest (no Convex
  imports, no `ctx`).
- Convex function tests (queries / mutations / actions) → **`convex-test`** (vitest
  harness with an in-memory Convex backend); assert **idempotency** on upsert paths
  (run mutation twice, same result).
- Keep `convex/lib/` logic free of `ctx.db` so it's unit-testable without a Convex
  runtime.

### Commands
- **Convex dev:** `npx convex dev` (watches `convex/`, pushes schema + functions on change; generates `convex/_generated/`)
- **Convex function tests:** `npx vitest run` (from root — uses `vitest.config.ts` with `edge-runtime`; needs `convex-test`)
- **Web component tests:** `cd web && npx vitest run`
- **Type-check:** `cd web && npx svelte-check`
- **Lint:** `cd web && npx eslint src/`

CI runs web vitest + svelte-check. Convex function tests run locally; add them to CI once codegen is stable (requires `convex.json` committed and a deploy key set).

## Agentic rules

- **Model by task tier:** **Opus** = orchestration, architecture, reviews; **Sonnet** = implementation (default — escalate to Opus for subtle/hard tasks); **Haiku** = mechanical VCS chores (commits, pushes, PRs, branch ops). The tiering is a default, not a rule.
- **Spec quality gates output** — the orchestrator's main job is crisp, testable contracts. Vague spec → bad code.
- **Delegate sizable, well-bounded tasks**; do trivial edits inline (spawning has cost + overhead).
- **Parallel file-mutating agents run in isolated worktrees** — avoids file collisions and inflated results.
- **Reviews are fresh-context**, independent of whoever wrote the spec — same reason the PR gate uses fresh context. Self-review shares blind spots.
- **Tooling:** the Agent tool (`model: sonnet`) for individual tasks; Workflow only for structured parallel fan-out when scale genuinely warrants it — flag the cost first.

## Conventions

- **Env-driven config** — `PUBLIC_CONVEX_URL` in `web/.env.local`; backend secrets via `npx convex env set`. Nothing host-specific in code.
- **Schema is the coordination point** — `convex/schema.ts` defines the tables both queries (readers) and mutations (writers) agree on. Change the schema first; update functions second.
- **No SQL migrations** — `npx convex dev` and `npx convex deploy` push schema automatically. Convex validates that existing documents match before applying.
- **The query contract is the handshake** between Convex functions (Mason / Sonnet) and the frontend (Opus / Sonnet): agree on the return type first, build both sides against it in parallel (frontend uses a typed fixture until the live query is wired).
- **Keep [HANDOFF.md](HANDOFF.md) current** — update it during and at the end of each session whenever state materially changes. It's the resume point; updating it is part of finishing a task.
