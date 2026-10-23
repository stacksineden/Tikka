// "Run it again" nudges (PRD B6): seasonal banners on the dashboard (and a line in the daily
// summary) two weeks before Black Friday, from 1 December and from 1 February. Pure, in WAT.

import { count } from "./format";
import { watDate } from "./visit";

export type Season = "black_friday" | "december" | "valentines";

/** Black Friday: the day after the fourth Thursday of November. */
export function blackFriday(year: number): string {
  const nov1 = new Date(Date.UTC(year, 10, 1)).getUTCDay(); // 0 = Sunday
  const firstThursday = 1 + ((4 - nov1 + 7) % 7);
  return `${year}-11-${String(firstThursday + 22).padStart(2, "0")}`;
}

function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** The season this day falls in, if any. */
export function seasonOn(now: Date): Season | null {
  const today = watDate(now);
  const year = Number(today.slice(0, 4));
  const bf = blackFriday(year);
  if (today >= addDays(bf, -14) && today <= bf) return "black_friday";
  if (today >= `${year}-12-01` && today <= `${year}-12-24`) return "december";
  if (today >= `${year}-02-01` && today <= `${year}-02-14`) return "valentines";
  return null;
}

const OPENER: Record<Season, string> = {
  black_friday: "Black Friday is coming.",
  december: "December is here.",
  valentines: "Valentine's Day is coming.",
};

/** "December is here. Your last drop brought 30 customers. Run it again?" Needs a past drop. */
export function seasonalNudge(now: Date, lastDrop: { id: string; name: string; customers: number } | null): { season: Season; text: string; fromId: string } | null {
  const season = seasonOn(now);
  if (!season || !lastDrop) return null;
  const brought = lastDrop.customers > 0 ? ` Your last drop brought ${count(lastDrop.customers)} customer${lastDrop.customers === 1 ? "" : "s"}.` : "";
  return { season, text: `${OPENER[season]}${brought} Run it again?`, fromId: lastDrop.id };
}
