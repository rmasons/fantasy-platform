# 05 — Auth

**Goal:** verify Firebase ID tokens, give routes a `current_user`, and land the
`users` table that carries the Sleeper account link.

**Depends on:** [01](01-foundation.md), [02](02-schema-and-migrations.md).
Background: [ADR 0001](../decisions/0001-auth-provider-and-native-clients.md).

| | |
|---|---|
| **New here** | `firebase-admin`, FastAPI's security dependencies, and sub-dependencies (the admin check composes onto the user check). |
| **Size** | Small in lines — a migration, two dependencies, a startup hook — and large in criteria, because ten of the twelve are failure paths. That ratio is the point. |
| **Working when** | A real Firebase ID token from fantasy-tds's project reaches a route as a UID, and every malformed variant gets a `401`. |
| **Prerequisite** | You need a way to mint a real ID token to test with. Easiest is signing in to the running fantasy-tds app and pulling the token from the browser, or the Firebase Auth REST API with the web API key. Sort this out before file 1 — it blocks criteria 4, 5, and 6. |
| **The one that matters** | Criterion 8. It is the difference between a convenience and a production vulnerability. |

---

## Design decisions

**Firebase Auth, the same project as fantasy-tds.** Not a new provider. The
decider was UID continuity: fantasy-tds's Firestore `users` collection already
holds twelve real user↔Sleeper links and a hand-set admin flag. Same project →
same UIDs → that data imports with no remapping, and both apps can run at once
during cutover.

**Bearer tokens, no session cookie.** The client sends
`Authorization: Bearer <firebase-id-token>` and this API verifies it. There is
no server-side session state, which is what makes the web and iOS auth paths
identical — the thing that made fantasy-tds unportable was its httpOnly session
cookie.

**Verification needs no service-account key.** `firebase-admin` checks
signatures against Google's public keys; it only needs the project ID.
Credentials are required only if you also read Firestore — which you will, once,
for the user import.

**The `users` table stores only what Firebase does not know.** Firebase owns
identity — email, credentials, sessions. This table owns `sleeper_user_id` and
`is_admin`. Do not mirror what the token already carries, beyond a denormalised
email for admin listings.

**Rows are created when there is something to store**, not on first sight of a
token. `get_current_user` gives you the UID from the token — enough for most
routes. The row appears when a user links their Sleeper account, which is a
deliberate write with real data. For the twelve existing members it appears via
the import instead.

**Keep the local bypass, but make it impossible in production.** Returning a fake
user when `firebase_project_id` is unset *and* `app_env == "local"` is genuinely
useful and genuinely dangerous — a misconfigured production deploy that silently
authenticates everyone as `local-dev` is the worst possible failure. It must fail
loudly instead.

---

## The files

| # | File | What it does | Closes |
|---|---|---|---|
| 1 | [`migrations/0002_users.sql`](#1-migrations0002_userssql) | `app.users` | 11 |
| 2 | [`src/core/config.py`](#2-srccoreconfigpy) | Refuse to start unconfigured outside local | 8 |
| 3 | [`src/api/main.py`](#3-srcapimainpy) | Initialise `firebase-admin` once | 7 |
| 4 | [`src/api/deps.py`](#4-srcapidepspy) | `get_current_user` and the admin variant | 1–6, 9, 10 |
| 5 | [`src/api/routes/leagues.py`](#5-srcapiroutesleaguespy) | Apply it to spec 04's endpoints | 12 |
| — | [`scripts/import_users.py`](#not-in-this-spec-the-firestore-import) | *Deferred to the Sleeper-linking slice* | — |

Files 1 and 2 are independent of each other and of everything else; do them in
either order. The ordering that matters is *inside* file 4.

---

### 1. `migrations/0002_users.sql`

Shaped to mirror fantasy-tds's `UserProfile` (`src/lib/types.ts`) so the import
is a straight copy.

| Column | Type | Notes |
|---|---|---|
| `firebase_uid` | `text` | PK — the token's `sub` / `uid` claim |
| `email` | `text` | Nullable, denormalised for admin listings |
| `sleeper_user_id` | `text` | Nullable, **unique** — one Sleeper account per person |
| `sleeper_username` | `text` | Nullable |
| `is_admin` | `boolean` | not null, default `false` |
| `created_at` / `updated_at` | `timestamptz` | not null, default `now()` |

`lastLeagueId` from fantasy-tds is deliberately not carried — it belongs to the
multi-league slice.

**The unique constraint on `sleeper_user_id` is the load-bearing one.** Without
it, two Firebase accounts can claim the same Sleeper identity and every ownership
check becomes ambiguous. Nullable-unique is what you want: Postgres allows many
`null`s under a unique constraint, which is exactly right here and worth
confirming rather than assuming.

**Check.** Apply it, then try inserting two rows with the same
`sleeper_user_id`, and separately two rows with `null`. **Closes criterion 11.**

---

### 2. `src/core/config.py`

One addition: **`firebase_project_id` unset with `app_env != "local"` → refuse to
start.**

Do this early, while there is no auth code to be distracted by. It is the
criterion that matters most in this spec and the easiest one to leave for last
and then forget.

**Where it lives is a real decision.** A `pydantic-settings` validator on the
`Settings` model fails earlier and covers anything that imports settings; an
explicit check in the lifespan hook produces a clearer message. Either closes the
criterion.

**Check.**

```sh
APP_ENV=prod PYTHONPATH=src uvicorn api.main:app
```

with no project ID configured must exit non-zero — a startup failure, not a 500
per request. **Closes criterion 8.**

**Docs.** [Pydantic validators](https://docs.pydantic.dev/latest/concepts/validators/)

---

### 3. `src/api/main.py`

Initialise `firebase-admin` in the lifespan hook — once per process, guarded so
it cannot double-initialise, and **skipped entirely when unconfigured-and-local**,
which is the other branch of file 2's condition.

The local bypass must log a warning when it engages. Do not skip the warning: it
is the entire difference between a visible development convenience and a silent
one.

**Check.** The app starts both with and without a project ID configured, and the
unconfigured-local case logs the warning. **Closes criterion 7.**

**Docs.** [Admin SDK setup](https://firebase.google.com/docs/admin/setup)

---

### 4. `src/api/deps.py`

Two dependencies, and **the order you build them in is the point of this spec.**

Ten of the twelve criteria are things that must be *rejected*, and a dependency
that accepts everything passes exactly one of them. So build the refusals first
and add the happy path last, where it cannot mask a hole.

#### `get_current_user`

Returns UID and email from a verified token.

- No header, or one not starting with `Bearer ` → `401`
- Token fails verification (bad signature, expired, wrong audience) → `401`
- Verified → a small user object

**Build it in three passes:**

1. **Header parsing, with no verification at all.** Extract and reject: missing
   header, wrong scheme, empty token. Stub the rest — return a hardcoded user for
   anything shaped like `Bearer <something>`. **Closes criteria 1 and 2.**
2. **Real verification.** Replace the stub with `verify_id_token`. Catch its
   exceptions and turn them into `401` — the failure mode to avoid is letting a
   raised `ValueError` become a 500, which tells an attacker more than a 401
   does. **Closes criteria 3, 4, and 5.**
3. **The happy path.** Only now. **Closes criterion 6.**

**Criterion 5 — a token from a different Firebase project — is the valuable
one**, and the one people skip because a foreign-project token is awkward to
produce. It is the only test that catches a project-ID typo, and a project-ID
typo is a total auth bypass.

**Edge cases in this function:**

- **Clock skew** rejects freshly-issued tokens as expired. `firebase-admin`
  allows a small tolerance; do not tighten it.
- **Verification is a network call** — it fetches and caches Google's public
  keys. The first request after startup is slower, and it fails outright if
  egress is blocked. Do not let that read as an auth failure in your logs.
- **`uid` and `sub` are the same value**; `firebase-admin` exposes `uid`. It is
  what iOS and web both send, and what fantasy-tds keyed its Firestore documents
  by.
- **Email can be absent or change.** It is not an identity key — the UID is.
  Never join on email.
- **Revocation.** `verify_id_token` does not check revocation unless asked, and
  checking costs a network call per request. fantasy-tds checks it
  (`verifySessionCookie(cookie, true)`). Decide deliberately; for twelve people
  the cheap option is defensible, but decide rather than default.

#### The admin dependency

Composed on top of `get_current_user` — `Depends` inside `Depends`. It looks up
`app.users` by UID and requires `is_admin`, else `403`.

This is the first dependency that needs a database connection *and* a token, so
it is also where the two halves of the app meet.

**Note the status codes.** `401` means "I don't know who you are"; `403` means "I
know, and no." A valid token with no `app.users` row is `403`, not `404` and not
`401` — the user is authenticated, they simply are not an admin.

**Check.** No row → `403`; row with `is_admin = false` → `403`; `true` →
allowed. **Closes criteria 9 and 10.**

**Docs.** [Verify ID tokens](https://firebase.google.com/docs/auth/admin/verify-id-tokens) ·
[FastAPI security](https://fastapi.tiangolo.com/tutorial/security/) ·
[Sub-dependencies](https://fastapi.tiangolo.com/tutorial/dependencies/sub-dependencies/)

---

### 5. `src/api/routes/leagues.py`

One dependency added to spec 04's endpoints. A small change, and it confirms the
dependency actually composes with routes written before it existed.

**Check.** The standings endpoint returns `401` without a token.
**Closes criterion 12.**

---

### Not in this spec: the Firestore import

Scoped to the Sleeper-linking slice. It is here so you know it is coming, not so
you build it now — it is the only piece needing service-account credentials, and
there is nothing to link yet.

One-off, run once: read fantasy-tds's Firestore `users` collection, map
`uid → firebase_uid`, `sleeperUserId → sleeper_user_id`,
`sleeperUsername → sleeper_username`, `isAdmin → is_admin`, drop `lastLeagueId`.
Write it idempotently — you will run it more than once while getting it right.
The credentials should not outlive the script.

---

## Acceptance criteria

1. No `Authorization` header → `401`.
2. `Authorization: Basic ...` → `401`.
3. A malformed/garbage bearer token → `401`, not a 500.
4. An expired token → `401`.
5. A token from a **different Firebase project** → `401`. This is the one that
   catches a project-ID misconfiguration.
6. A valid token → the route runs and sees the correct UID.
7. `firebase_project_id` unset with `app_env == "local"` → bypass user, and a
   warning is logged.
8. **`firebase_project_id` unset with `app_env != "local"` → the app refuses to
   start.** Not a 500 per request — a startup failure.
9. Admin dependency: valid token, no `app.users` row → `403`.
10. Admin dependency: row with `is_admin = false` → `403`; `true` → allowed.
11. Two users cannot claim the same `sleeper_user_id`.
12. The endpoints from spec 04 return `401` without a token.

## Done when

All twelve criteria pass — criterion 8 especially, since it is the one that
turns a silent production vulnerability into a loud startup failure.
