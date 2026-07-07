import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

export const upsertLeague = internalMutation({
  args: {
    leagueId: v.string(),
    season: v.string(),
    name: v.string(),
    status: v.string(),
    previousLeagueId: v.optional(v.string()),
    settings: v.any(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("leagues")
      .withIndex("by_league_id", (q) => q.eq("leagueId", args.leagueId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, args);
    } else {
      await ctx.db.insert("leagues", args);
    }
  },
});

export const upsertLeagueUsers = internalMutation({
  args: {
    leagueId: v.string(),
    users: v.array(
      v.object({
        userId: v.string(),
        displayName: v.string(),
        teamName: v.optional(v.string()),
        avatar: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { leagueId, users }) => {
    const existing = await ctx.db
      .query("leagueUsers")
      .withIndex("by_league", (q) => q.eq("leagueId", leagueId))
      .collect();
    const existingByUserId = new Map(existing.map((u) => [u.userId, u]));

    for (const user of users) {
      const doc = existingByUserId.get(user.userId);
      if (doc) {
        await ctx.db.patch(doc._id, { leagueId, ...user });
      } else {
        await ctx.db.insert("leagueUsers", { leagueId, ...user });
      }
    }
  },
});

export const upsertRosters = internalMutation({
  args: {
    leagueId: v.string(),
    rosters: v.array(
      v.object({
        rosterId: v.number(),
        ownerId: v.string(),
        wins: v.number(),
        losses: v.number(),
        ties: v.number(),
        fpts: v.number(),
        fptsAgainst: v.number(),
      }),
    ),
  },
  handler: async (ctx, { leagueId, rosters }) => {
    const existing = await ctx.db
      .query("rosters")
      .withIndex("by_league", (q) => q.eq("leagueId", leagueId))
      .collect();
    const existingByRosterId = new Map(existing.map((r) => [r.rosterId, r]));

    for (const roster of rosters) {
      const doc = existingByRosterId.get(roster.rosterId);
      if (doc) {
        await ctx.db.patch(doc._id, { leagueId, ...roster });
      } else {
        await ctx.db.insert("rosters", { leagueId, ...roster });
      }
    }
  },
});
