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
- **`verify`** (`verify.yml`) — currently `cd web && npx vitest run` + `cd web && npx svelte-check` only. **Needs rewriting for the Python API** (ADR 0002): `pytest` + `ruff check src tests`, plus the **OpenAPI drift gate** — regenerate the TypeScript and Swift clients and fail on any diff, so a contract change can never land without its clients. Known gap in [HANDOFF.md](../HANDOFF.md).
- **Branch protection** on `test` + `main` requires `promotion-review` + `verify`, with `enforce_admins` (no override).
