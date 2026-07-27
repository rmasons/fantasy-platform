import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // App-side user record. Firebase Auth owns identity (credentials, email,
  // sessions); this table owns what Firebase doesn't know about: the Sleeper
  // account link and the admin flag. Keyed by `firebaseUid` — the `subject`
  // claim returned by `ctx.auth.getUserIdentity()`.
  //
  // Replaces the `authTables` spread from @convex-dev/auth. Field shape
  // deliberately mirrors fantasy-tds's `UserProfile` (src/lib/types.ts) so the
  // existing Firestore `users` collection imports by UID with no remapping —
  // the twelve real Sleeper links survive the rebuild. See ADR 0001.
  //
  // `lastLeagueId` from fantasy-tds is intentionally NOT carried over; it
  // belongs to the multi-league slice, which will design its own shape.
  users: defineTable({
    firebaseUid: v.string(),
    email: v.optional(v.string()),
    // Denormalized from Sleeper at link time; saves a lookup for display.
    sleeperUserId: v.optional(v.string()),
    sleeperUsername: v.optional(v.string()),
    isAdmin: v.optional(v.boolean()),
  })
    .index("by_firebase_uid", ["firebaseUid"])
    .index("by_sleeper_user_id", ["sleeperUserId"]),

  leagues: defineTable({
    leagueId: v.string(),
    season: v.string(),
    name: v.string(),
    status: v.string(),
    previousLeagueId: v.optional(v.string()),
    settings: v.any(),
  }).index("by_league_id", ["leagueId"]),

  leagueUsers: defineTable({
    leagueId: v.string(),
    userId: v.string(),
    displayName: v.string(),
    teamName: v.optional(v.string()),
    avatar: v.optional(v.string()),
  }).index("by_league", ["leagueId"]),

  rosters: defineTable({
    leagueId: v.string(),
    rosterId: v.number(),
    ownerId: v.string(),
    wins: v.number(),
    losses: v.number(),
    ties: v.number(),
    fpts: v.number(),
    fptsAgainst: v.number(),
  }).index("by_league", ["leagueId"]),
});
