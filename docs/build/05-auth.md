# 05 — Auth

**Goal:** verify Firebase ID tokens, give routes a `current_user`, and land the
`users` table that carries the Sleeper account link.

**Depends on:** [01](01-foundation.md), [02](02-schema-and-migrations.md).
Background: [ADR 0001](../decisions/0001-auth-provider-and-native-clients.md).

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

**Keep the local bypass, but make it impossible in production.** The existing
scaffold returns a fake user when `firebase_project_id` is unset *and*
`app_env == "local"`. That is genuinely useful and genuinely dangerous — a
misconfigured production deploy that silently authenticates everyone as
`local-dev` is the worst possible failure. It must fail loudly instead.

---

## What to build

| Piece | File | Notes |
|---|---|---|
| Migration | `migrations/0002_users.sql` | `app.users` |
| Dependency | `src/api/deps.py` | `get_current_user`, plus an admin variant |
| Startup | `src/api/main.py` | Initialise `firebase-admin` once when configured |
| Import script | one-off, `scripts/` | Firestore `users` → `app.users` |

### `app.users`

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

The unique constraint on `sleeper_user_id` matters: without it two Firebase
accounts can claim the same Sleeper identity and every ownership check becomes
ambiguous. Nullable-unique is what you want — many rows may have `null`.

### `get_current_user`

Returns UID and email from a verified token.

- No header, or one not starting with `Bearer ` → `401`
- Token fails verification (bad signature, expired, wrong audience) → `401`
- Verified → a small user object

An admin dependency builds on it: look up `app.users` by UID, require
`is_admin`, else `403`. Note the difference — `401` means "I don't know who you
are," `403` means "I know, and no."

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

## Edge cases

- **Clock skew** rejects freshly-issued tokens as expired. `firebase-admin`
  allows a small tolerance; do not tighten it.
- **Verification is a network call** — it fetches and caches Google's public
  keys. The first request after startup is slower, and it fails if egress is
  blocked. Do not let that read as an auth failure in your logs.
- **`uid` and `sub`** are the same value; `firebase-admin` exposes `uid`. It is
  what iOS and web will both send, and what fantasy-tds keyed its Firestore
  documents by.
- **Email can be absent or change.** It is not an identity key — the UID is.
  Never join on email.
- **Revocation.** `verify_id_token` does not check revocation unless asked, and
  checking costs a network call per request. fantasy-tds checks it
  (`verifySessionCookie(cookie, true)`). Decide deliberately; for twelve people
  the cheap option is defensible, but decide rather than default.

## The import (do this with the Sleeper-linking slice)

One-off, run once: read fantasy-tds's Firestore `users` collection, map
`uid → firebase_uid`, `sleeperUserId → sleeper_user_id`,
`sleeperUsername → sleeper_username`, `isAdmin → is_admin`, drop
`lastLeagueId`. This is the only place needing service-account credentials, and
they should not outlive the script.

Write it idempotently — you will run it more than once while getting it right.

## Concepts

- [Verify ID tokens](https://firebase.google.com/docs/auth/admin/verify-id-tokens)
- [Admin SDK setup](https://firebase.google.com/docs/admin/setup)
- [FastAPI security dependencies](https://fastapi.tiangolo.com/tutorial/security/)
- [`Depends` composition](https://fastapi.tiangolo.com/tutorial/dependencies/sub-dependencies/) — how the admin dependency builds on the user one

## Done when

All twelve criteria pass — criterion 8 especially, since it is the one that
turns a silent production vulnerability into a loud startup failure.
