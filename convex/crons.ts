import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "refresh rosters",
  { hourUTC: 5, minuteUTC: 0 },
  internal.actions.ingest.daily,
);

export default crons;
