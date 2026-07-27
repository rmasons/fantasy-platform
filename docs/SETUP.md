# Setup — first run, in order

One-time setup to get from a fresh clone to a signed-in local app. **Do these in
order** — each step produces a value the next one needs.

Supersedes "Phase 1" in [HANDOFF.md](../HANDOFF.md). Auth changed in
[ADR 0001](decisions/0001-auth-provider-and-native-clients.md): identity comes
from **the same Firebase project fantasy-tds uses**, wired to Convex as an OIDC
provider. There is no new account to create and nothing secret on the Convex
side — no signing keys, no OAuth client secret, no service-account JSON.

**Time:** ~15 minutes.

## What you're setting up, and why

| # | Thing | Why it exists | You'll end up with |
|---|---|---|---|
| 1 | Node + deps | — | `node_modules/` |
| 2 | Convex deployment | The whole backend: DB, functions, crons | `convex.json`, `convex/_generated/`, deployment URL |
| 3 | Firebase project ID → Convex | Tells Convex which token issuer to trust | `FIREBASE_PROJECT_ID` set |
| 4 | Web env file | Points the browser at Convex and Firebase | `web/.env.local` |
| 5 | Run + verify | — | Signed in, Convex accepting the token |
| 6 | Real league data | — | Rows in the dashboard |

Step 1 → 2 is a hard order (nothing in `convex/` compiles until
`convex/_generated/` exists). Steps 3 and 4 both need values you already have
from fantasy-tds, so they're quick.

---

## 1 — Prerequisites and install

Node v20+. From the repo root:

```sh
npm install            # convex CLI + function deps
cd web && npm install  # SvelteKit frontend + firebase
cd ..
```

> More: [README.md](../README.md) for architecture, [AGENTS.md](../AGENTS.md)
> for the working model and TDD rules.

## 2 — Link a Convex deployment

```sh
npx convex login   # first time only
npx convex dev     # interactive: pick or create a deployment
```

This creates `convex.json`, generates `convex/_generated/`, and pushes the schema
and functions. **Leave it running** — it watches `convex/` and pushes on save.

It prints two URLs:

- **`https://<name>.convex.cloud`** — the client/WebSocket URL → step 4
- **`https://<name>.convex.site`** — the HTTP URL, for future webhooks. Not needed for auth.

> Until this runs, every file in `convex/` has unresolved imports from
> `convex/_generated/` and typechecking fails. Expected, not a bug.
>
> More: [Convex Svelte quickstart](https://docs.convex.dev/quickstart/svelte) ·
> [dashboard](https://dashboard.convex.dev)

## 3 — Point Convex at the Firebase project

Use the **same project as fantasy-tds** — shared UIDs are the whole point
(ADR 0001). The project ID is in `fantasy-tds/.env` as
`PUBLIC_FIREBASE_PROJECT_ID`, or in the Firebase console under
**Project settings → Project ID**.

```sh
npx convex env set FIREBASE_PROJECT_ID <project-id>
```

`convex/auth.config.ts` builds both halves of the OIDC config from it:

| | |
|---|---|
| `domain` | `https://securetoken.google.com/<project-id>` — matches the token's `iss` |
| `applicationID` | `<project-id>` — matches the token's `aud` |

Restart `npx convex dev` after setting it so the config re-pushes.

**No Firebase console changes are needed.** Google sign-in is already enabled on
that project, and `localhost` is an authorized domain by default. If you later
serve the web app from a new domain, add it under
**Firebase console → Authentication → Settings → Authorized domains**.

> Background: [Convex custom OIDC provider](https://docs.convex.dev/auth/advanced/custom-auth)

## 4 — Web env file

```sh
cp web/.env.example web/.env.local
```

| Var | From |
|---|---|
| `PUBLIC_CONVEX_URL` | step 2, the `.convex.cloud` URL |
| `PUBLIC_FIREBASE_*` (six) | copy verbatim from `fantasy-tds/.env` |

All six Firebase values are public by design — they identify the project, they
don't authorize anything. Access is controlled by Firebase Auth and by
function-level checks in Convex.

## 5 — Run it and verify auth end-to-end

```sh
cd web && npm run dev    # http://localhost:5173
```

Verify in order — each failure points somewhere specific:

1. **Page loads, "Sign in with Google" visible.** A console warning about
   `PUBLIC_FIREBASE_*` being unset means step 4 didn't take — restart Vite, env
   changes aren't hot-reloaded.
2. **Click it → Google popup → back, signed in as your email.** Popup blocked or
   `auth/unauthorized-domain` means the serving origin isn't in Firebase's
   authorized domains.
3. **Convex accepts the token.** Convex dashboard → Logs: a query from a
   signed-in browser should show an authenticated identity. Failures here mean
   step 3's project ID doesn't match the one minting tokens in step 4.
4. **`ctx.auth.getUserIdentity()` returns non-null** inside a function. Its
   `subject` is the Firebase UID the `users` table is keyed by — and the same UID
   fantasy-tds already stores.

> If step 3 fails while 1–2 pass, see the JWKS-resolution follow-up in
> [ADR 0001](decisions/0001-auth-provider-and-native-clients.md). Firebase
> advertises its JWKS via the discovery document rather than at
> `${iss}/.well-known/jwks.json`; this is the one unverified assumption in the
> setup.

## 6 — Load real data

Once a real Sleeper league ID is on hand:

```sh
npx convex run actions/ingest:backfill '{"leagueId":"<real_id>"}'
```

> **Fix the known ingest bugs first** — Sleeper returns explicit `null` for
> `previous_league_id` / `avatar` / `metadata.team_name`, which `v.optional()`
> rejects, and missing `fpts_decimal` yields `NaN`. `backfill` throws on the
> first real league otherwise. Details and test cases:
> [docs/slices/standings.md](slices/standings.md), tracked in
> [HANDOFF.md](../HANDOFF.md) known gaps.

Then confirm `getStandings` returns sorted rows in the dashboard and swap the
standings page off its fixture (HANDOFF step 2e).

### Importing existing users (later, not now)

The `users` table is shaped to mirror fantasy-tds's `UserProfile`, so the
existing Firestore `users` collection imports by UID with no remapping —
preserving everyone's Sleeper link and the admin flag. Write that one-off import
when the Sleeper-linking slice lands; there's nothing reading the table before
then.

---

## Where to read more

| Topic | File |
|---|---|
| Architecture, directory layout, key patterns | [README.md](../README.md) |
| Working model, model tiers, TDD rules | [AGENTS.md](../AGENTS.md) |
| Current state, known gaps, next tasks | [HANDOFF.md](../HANDOFF.md) |
| Slice sequence to parity and beyond | [docs/ROADMAP.md](ROADMAP.md) |
| Why Firebase Auth, and the iOS implications | [ADR 0001](decisions/0001-auth-provider-and-native-clients.md) |
| Branch model and review gates | [docs/pipeline.md](pipeline.md) |
| Per-slice data contracts | [docs/slices/](slices/) |

## Deploying

```sh
npx convex deploy        # backend → Convex production
```

Production needs the project ID set on the prod deployment, and the web env set
wherever the frontend is hosted:

```sh
npx convex env set --prod FIREBASE_PROJECT_ID <project-id>
```

Vercel env: `PUBLIC_CONVEX_URL` (prod deployment) + the six `PUBLIC_FIREBASE_*`.

Unlike a Clerk-style setup there is no separate dev/prod identity instance —
both Convex deployments validate against the same Firebase project, which is
what lets fantasy-tds and fantasy-platform share logins during cutover. The
trade-off is that dev and prod share a user pool; keep that in mind before
destructive user writes.

## Troubleshooting

| Symptom | Cause |
|---|---|
| `Cannot find module './_generated/api'` | Step 2 hasn't run, or `convex dev` isn't running |
| `auth/unauthorized-domain` on sign-in | Serving origin missing from Firebase authorized domains |
| Signed in on the web, but Convex logs show unauthenticated queries | `FIREBASE_PROJECT_ID` (step 3) ≠ `PUBLIC_FIREBASE_PROJECT_ID` (step 4), or the JWKS follow-up in ADR 0001 |
| Env change ignored | Vite doesn't hot-reload `.env.local`; restart `npm run dev`. Convex env changes need `convex dev` restarted |
| Convex function tests fail in CI | Expected — CI runs web tests only. Known gap in [HANDOFF.md](../HANDOFF.md) |
