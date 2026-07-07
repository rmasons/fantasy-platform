import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { sleeper } from "../lib/sleeper";

export const backfill = internalAction({
  args: { leagueId: v.string() },
  handler: async (ctx, { leagueId }) => {
    const [league, users, rosters] = await Promise.all([
      sleeper.getLeague(leagueId),
      sleeper.getLeagueUsers(leagueId),
      sleeper.getLeagueRosters(leagueId),
    ]);

    await ctx.runMutation(internal.mutations.ingestion.upsertLeague, {
      leagueId: league.league_id,
      season: league.season,
      name: league.name,
      status: league.status,
      previousLeagueId: league.previous_league_id,
      settings: league.settings,
    });

    await ctx.runMutation(internal.mutations.ingestion.upsertLeagueUsers, {
      leagueId,
      users: users.map((u) => ({
        userId: u.user_id,
        displayName: u.display_name,
        teamName: u.metadata?.team_name,
        avatar: u.avatar,
      })),
    });

    await ctx.runMutation(internal.mutations.ingestion.upsertRosters, {
      leagueId,
      rosters: rosters.map((r) => ({
        rosterId: r.roster_id,
        ownerId: r.owner_id,
        wins: r.settings.wins,
        losses: r.settings.losses,
        ties: r.settings.ties,
        fpts: r.settings.fpts + r.settings.fpts_decimal / 100,
        fptsAgainst:
          r.settings.fpts_against + r.settings.fpts_against_decimal / 100,
      })),
    });
  },
});

export const daily = internalAction({
  args: {},
  handler: async (ctx) => {
    const leagues = await ctx.runQuery(internal.queries.leagues.activeLeagueIds);
    await Promise.all(
      leagues.map((leagueId: string) =>
        ctx.runAction(internal.actions.ingest.backfill, { leagueId }),
      ),
    );
  },
});
