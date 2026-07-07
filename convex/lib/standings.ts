export type StandingRow = {
  rank: number;
  rosterId: number;
  teamName: string;
  ownerName: string;
  avatar: string | null;
  wins: number;
  losses: number;
  ties: number;
  fpts: number;
  fptsAgainst: number;
};

type RosterDoc = {
  rosterId: number;
  ownerId: string;
  wins: number;
  losses: number;
  ties: number;
  fpts: number;
  fptsAgainst: number;
};

type LeagueUserDoc = {
  userId: string;
  displayName: string;
  teamName?: string;
  avatar?: string;
};

export function computeStandings(
  rosters: RosterDoc[],
  users: LeagueUserDoc[],
): StandingRow[] {
  const userMap = new Map(users.map((u) => [u.userId, u]));

  const rows = rosters.map((r) => {
    const user = userMap.get(r.ownerId);
    return {
      rosterId: r.rosterId,
      teamName: user?.teamName ?? user?.displayName ?? "Unknown",
      ownerName: user?.displayName ?? "Unknown",
      avatar: user?.avatar ?? null,
      wins: r.wins,
      losses: r.losses,
      ties: r.ties,
      fpts: r.fpts,
      fptsAgainst: r.fptsAgainst,
    };
  });

  rows.sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.fpts - a.fpts;
  });

  return rows.map((r, i) => ({ rank: i + 1, ...r }));
}
