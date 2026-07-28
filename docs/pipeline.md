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
- **`verify`** (`verify.yml`) — `ruff check src tests` + `pytest`. Both no-op with a visible `::notice::` while the repo has no code yet, so a green check never quietly means "skipped". **Still missing: the OpenAPI drift gate** — regenerate the TypeScript and Swift clients and fail on any diff, so a contract change can never land without its clients. Add it before the first slice lands; known gap in [HANDOFF.md](../HANDOFF.md).
- **Branch protection** on `test` + `main` requires `promotion-review` + `verify`, with `enforce_admins` (no override).
