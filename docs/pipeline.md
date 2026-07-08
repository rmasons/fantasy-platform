# Branching & CI

```
feature/* ──PR──▶ dev ──PR──▶ test ──PR──▶ main (prod)
           advisory     BLOCKING     BLOCKING
```

| PR target | Checks |
|---|---|
| `dev`  | advisory Claude review (comments only) + `verify` |
| `test` | **BLOCKING** `promotion-review` + `verify` (both required) |
| `main` | **BLOCKING** `promotion-review` + `verify` (both required) |

- **Advisory review** (`claude-code-review.yml`) — fresh-context comments on PRs into `dev`; never blocks.
- **Promotion gate** (`promotion-review.yml`) — fresh-context review on PRs into `test`/`main`; **fails the check on any high/critical finding**, so branch protection blocks the merge. Fails closed (no verdict + model error = fail).
- **`verify`** (`verify.yml`) — `cd web && npx vitest run` (web component tests) + `cd web && npx svelte-check` (type-check). Convex function tests (`npx vitest run` from repo root, `convex-test`) are **not in CI yet** — known gap in [HANDOFF.md](../HANDOFF.md); add a root vitest job once `convex.json` is committed and codegen runs in CI.
- **Branch protection** on `test` + `main` requires `promotion-review` + `verify`, with `enforce_admins` (no override).
