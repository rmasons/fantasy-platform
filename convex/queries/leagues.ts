import { v } from "convex/values";
import { internalQuery, query } from "../_generated/server";
import { computeStandings } from "../lib/standings";

export const getStandings = query({
  args: { leagueId: v.string() },
  handler: async (ctx, { leagueId }) => {
    const [rosters, users] = await Promise.all([
      ctx.db
        .query("rosters")
        .withIndex("by_league", (q) => q.eq("leagueId", leagueId))
        .collect(),
      ctx.db
        .query("leagueUsers")
        .withIndex("by_league", (q) => q.eq("leagueId", leagueId))
        .collect(),
    ]);
    return computeStandings(rosters, users);
  },
});

export const activeLeagueIds = internalQuery({
  args: {},
  handler: async (ctx) => {
    const leagues = await ctx.db
      .query("leagues")
      .filter((q) => q.eq(q.field("status"), "in_season"))
      .collect();
    return leagues.map((l) => l.leagueId);
  },
});
