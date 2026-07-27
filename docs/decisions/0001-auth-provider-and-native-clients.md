# ADR 0001 — Firebase Auth via OIDC, so iOS stays open and the Sleeper links survive

- **Status:** Accepted
- **Date:** 2026-07-27
- **Supersedes:** the Convex Auth (`@convex-dev/auth`) decision recorded in the
  2026-07-06 session log
- **Affects:** first-run setup, `convex/auth.config.ts`, `convex/schema.ts`,
  `web/src/lib/auth.svelte.ts`, and every future slice that gates on identity

## Context

The question that prompted this: *what would it take to ship fantasy-tds as an
iOS app?* Answering it against **fantasy-platform** instead turned up a decision
with an expiry date, so it gets recorded rather than discovered later.

### Convex has a first-party Swift client

[ConvexMobile](https://docs.convex.dev/client/swift) wraps the official Rust
client, holds a WebSocket to the deployment, and exposes queries as Combine
publishers — reactive subscriptions straight into SwiftUI. A native client calls
the same queries and mutations the web client does. There is no REST layer to
build, no bearer-token shim, no CORS, no separate mobile API surface.

This is a property of *this* architecture, not of the product. Porting
fantasy-tds would have meant the opposite: a bearer-auth shim in
`hooks.server.ts`, ~10 net-new REST endpoints, converting 21 `+page.server.ts`
SSR loads to client-fetched data, and a Capacitor shell — 8–12 days of work on
an app we are deliberately replacing, none of it transferable here.

The per-slice pattern in [AGENTS.md](../../AGENTS.md) already produces exactly
what a native client consumes. The "query contract is the handshake" rule
becomes a three-way handshake instead of two-way. That is the entire port.

### But our auth choice was closing that door

ConvexMobile supports **Auth0**, **Clerk**, or a **custom `AuthProvider`**
conforming to OIDC. It does **not** support `@convex-dev/auth`.

`@convex-dev/auth` was also the weakest part of the repo on the web side:

- No official Svelte adapter, so the OAuth flow was hand-rolled across
  `web/src/lib/auth.svelte.ts` and `web/src/routes/auth/callback/`.
- Token refresh was a known open gap — `fetchAccessToken` returned the stored
  token unchanged, with a comment saying refresh "would go here." Sessions would
  expire silently and dump users back to sign-in.
- It was already on the [HANDOFF](../../HANDOFF.md) queued-audit list as needing
  verification against current library docs before wiring.

So the incumbent was hand-rolled on web, refresh-broken, and a dead end on iOS.

### The decision was cheap *now* and expensive later

The repo is ~1,000 lines (347 in `convex/`, 672 in `web/`). First-run setup has
not happened: no `convex.json`, no linked deployment, no generated types, no
ingested rows, no users. Swapping identity providers today is a ~150-line edit.
After fifteen slices and a real league it is a user-record migration.

### Firebase Auth turned out to beat the obvious answer

The first pass of this ADR chose **Clerk**, on the strength of its first-party
Convex integration on both web and iOS. That evaluation had a gap: it compared
Clerk to Auth0 and to Convex Auth, but never to *the identity provider already
in production* — fantasy-tds runs Firebase Auth with Google sign-in.

Three things decided it:

1. **Firebase is a valid Convex OIDC provider.** Firebase ID tokens carry
   `iss: https://securetoken.google.com/<project-id>` and `aud: <project-id>`,
   and that issuer serves a conforming discovery document advertising a standard
   RS256 JWKS. Verified directly against the live endpoints, and there is
   [published precedent](https://medium.com/@spencerbergamo/convexprovider-with-firebase-auth-the-server-side-oidc-solution-058d01bc4e19)
   for the exact pairing.

2. **UID continuity preserves the data users can't re-derive.** fantasy-tds's
   `UserProfile` (`src/lib/types.ts`) is `{ uid, email, sleeperUserId,
   sleeperUsername, lastLeagueId, isAdmin }` — nearly the table this repo needs,
   already populated with twelve real Sleeper links and a hand-set admin flag.
   Same Firebase project → same UIDs → that table imports with no remapping.
   Under Clerk, all twelve members re-link their Sleeper accounts, or the mapping
   gets reconciled by hand.

3. **It removes a vendor instead of adding one**, and enables a *phased* cutover:
   fantasy-tds and fantasy-platform can run simultaneously on the same logins,
   so users can move between old and new app without noticing. Clerk would have
   forced a hard switch.

Convex also validates these tokens itself against Google's public JWKS, so the
backend needs **no `firebase-admin` and no service-account key** — strictly less
than fantasy-tds, which verifies session cookies through the Admin SDK on every
request (`fantasy-tds/src/hooks.server.ts`).

## Decision

**Use Firebase Auth — the same project as fantasy-tds — as the identity provider,
wired to Convex as a standard OIDC provider. Remove `@convex-dev/auth` and
`@auth/core`.**

Concretely:

- `convex/auth.config.ts` derives issuer and audience from `FIREBASE_PROJECT_ID`.
- `convex/auth.ts` and `web/src/routes/auth/callback/` are deleted — Firebase's
  SDK owns the popup flow; there is no redirect route to host.
- `convex/http.ts` keeps an empty router as a mount point for future webhooks.
- The `authTables` spread is replaced by an app-owned `users` table keyed by
  `firebaseUid` (the `subject` claim from `ctx.auth.getUserIdentity()`), shaped
  to mirror fantasy-tds's `UserProfile` so the Firestore collection imports
  directly.
- The web client uses the `firebase/auth` SDK from a Svelte 5 rune store —
  substantially the code already running in `fantasy-tds/src/routes/login/`.

### Why not Clerk

Clerk's real advantages are a hosted sign-in modal and a prebuilt Convex iOS
integration (`clerk-convex-swift`). Against those: the sign-in UI is ~20 lines of
`signInWithPopup(auth, new GoogleAuthProvider())` that already works in
production, and the iOS `AuthProvider` conformance is a thin wrapper over
`getIDToken(forcingRefresh:)`. Neither is worth re-linking twelve Sleeper
accounts, adding a vendor, or forfeiting the phased cutover.

## Consequences

### Good

- iOS becomes an incremental cost per slice (~30–40% on top of each web slice)
  rather than a project.
- The token-refresh gap closes as a side effect — `getIdToken(forceRefresh)` maps
  exactly onto the `forceRefreshToken` flag `convex-svelte` passes in.
- No new vendor, no new bill, no new dashboard, no new secret to rotate.
- Two files and a route are deleted; the backend drops `firebase-admin`, session
  cookies, and per-request Firestore profile reads relative to fantasy-tds.
- The `users` table seeds two roadmap slices (Sleeper account linking, admin
  surface) *and* arrives pre-populated.

### Bad / accepted

- **The Convex↔Firebase integration is "custom OIDC," not first-party.** It is
  five lines of config, but they are our five lines; nobody's docs cover this
  pairing end to end.
- **It keeps a thread back to Firebase** after a rebuild premised on leaving it.
  The rebuild's actual target was Firestore, which still goes away. An
  Auth-only Firebase project is free and near-zero maintenance.
- **We build our own sign-in UI.** Already solved in fantasy-tds; portable.
- **Learning-curve cost.** The stated point of this project is learning Convex;
  Swift would be a second curve. This ADR does not commit to writing the iOS app
  — it commits to not *foreclosing* it.

### Risks to watch

- **`convex-swift` is pre-1.0** (docs reference 0.6/0.7 features). Expect churn
  whenever the iOS client starts.
- **Type drift is now three-way.** `StandingRow` is already defined twice
  (`convex/lib/standings.ts`, `web/src/lib/standings.ts`); Swift `Codable`
  structs are hand-written, since ConvexMobile has no schema codegen. Mitigation:
  make each `docs/slices/*.md` contract normative and check all implementations
  against it. This upgrades the existing "type sharing" audit from a nuisance to
  a requirement.
- **The Firebase project becomes shared infrastructure** between two apps. Don't
  delete it when fantasy-tds is retired, and be deliberate about changes to
  sign-in providers while both run.

## Alternatives considered

| Option | Verdict |
|---|---|
| **Keep `@convex-dev/auth`, revisit at iOS time** | Rejected. Cheapest today, most expensive at the moment of the swap — real users, real Sleeper links. The refresh gap stays open meanwhile. |
| **Keep Convex Auth, write a custom Swift `AuthProvider`** | Rejected. Its token exchange is not standard OIDC from a native client, and refresh — the already-broken part — is exactly what would get hand-written, twice. |
| **Clerk** | Rejected on reflection. Best-in-class integration story, but adds a vendor, forces twelve Sleeper re-links, forfeits the phased cutover, and costs $25/mo to remove sign-in branding. |
| **Auth0** | Rejected. Same new-vendor cost as Clerk with none of its polish advantages at our scale. |
| **Ship iOS by porting fantasy-tds** | Rejected. 8–12 days on the app being replaced; nothing transfers to Convex. |

## Follow-ups

- [ ] **Confirm Convex resolves the JWKS via the discovery document.** Firebase
      serves `${iss}/.well-known/openid-configuration` (200, valid) but *not*
      `${iss}/.well-known/jwks.json` (404) — it advertises `jwks_uri` at
      `googleapis.com` instead, which is standard OIDC and what the published
      precedent relies on. Settled in five minutes once a deployment is linked;
      symptom of failure would be every authenticated query rejected.
- [ ] **Write the one-off user import** from fantasy-tds Firestore `users` →
      Convex `users`, mapping `uid → firebaseUid` and dropping `lastLeagueId`.
      Do it when the Sleeper-linking slice lands, not before.
- [ ] **Bootstrap `isAdmin`.** Imported rows carry it, so this is only a question
      for net-new users. Revisit when the admin-surface slice needs granularity.
- [ ] **Sign in with Apple — deferred** until an iOS build is actually on the
      table (decided 2026-07-27). App Store guideline 4.8 will require it
      alongside Google, so add it to the Firebase project *before* the first
      TestFlight build, not after review bounces it.
- [ ] **Revisit the iOS shell right after the standings slice goes live** — it
      validates the three-way contract pattern on the one slice already built
      and tested.

## References

- [Convex Swift client](https://docs.convex.dev/client/swift) ·
  [convex-swift](https://github.com/get-convex/convex-swift) ·
  [Introducing Convex for Swift](https://stack.convex.dev/introducing-convex-for-swift)
- [Convex custom OIDC provider](https://docs.convex.dev/auth/advanced/custom-auth)
- [ConvexProvider with Firebase Auth — server-side OIDC](https://medium.com/@spencerbergamo/convexprovider-with-firebase-auth-the-server-side-oidc-solution-058d01bc4e19)
- [Firebase Auth web SDK](https://firebase.google.com/docs/auth/web/start) ·
  [Firebase Auth iOS SDK](https://firebase.google.com/docs/auth/ios/start)
- [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) — 4.2 (minimum functionality), 4.8 (Sign in with Apple)
