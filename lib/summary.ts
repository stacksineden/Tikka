// The owner's daily summary on WhatsApp (PRD A3, TECH_PLAN §5, template tikka_owner_daily).
// Pure: the cron gathers the counts at 8:00 WAT and queues one message per business that has it on.

import { count } from "./format";
import { watDate } from "./visit";

export interface SummaryClaim {
  claimedAt: string;
  expiresAt: string;
  redeemed: boolean;
  plannedVisitDate?: string;
}

const DAY = 86_400_000;

export function summaryCounts(claims: SummaryClaim[], now: Date): { newClaims: number; planningTomorrow: number; expiringSoon: number } {
  const t = now.getTime();
  const tomorrow = watDate(new Date(t + DAY));
  return {
    newClaims: claims.filter((c) => t - new Date(c.claimedAt).getTime() <= DAY && new Date(c.claimedAt).getTime() <= t).length,
    planningTomorrow: claims.filter((c) => !c.redeemed && c.plannedVisitDate === tomorrow).length,
    expiringSoon: claims.filter((c) => !c.redeemed && new Date(c.expiresAt).getTime() > t && new Date(c.expiresAt).getTime() - t <= 3 * DAY).length,
  };
}

/** "Glow Studio today: 12 new claims, 3 planning to come tomorrow, 5 Tikkas expiring soon. Open your list: …" */
export function dailySummaryText(businessName: string, c: ReturnType<typeof summaryCounts>, link: string, nudge?: string | null): string {
  const s = (n: number, one: string, many: string) => `${count(n)} ${n === 1 ? one : many}`;
  const text = `${businessName} today: ${s(c.newClaims, "new claim", "new claims")}, ${count(c.planningTomorrow)} planning to come tomorrow, ${s(c.expiringSoon, "Tikka", "Tikkas")} expiring soon. Open your list: ${link}`;
  return nudge ? `${text}\n${nudge}` : text;
}

/** Nothing new and nothing coming up: skip the message rather than send zeros. */
export function worthSending(c: ReturnType<typeof summaryCounts>, nudge?: string | null): boolean {
  return c.newClaims + c.planningTomorrow + c.expiringSoon > 0 || !!nudge;
}
