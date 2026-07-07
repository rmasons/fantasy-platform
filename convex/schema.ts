import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,

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
