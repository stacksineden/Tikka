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

/**
 * The template's values, in order (tikka_owner_daily: "{{1}} today: {{2}}, {{3}} planning to come
 * tomorrow, {{4}} expiring soon. {{5}} Open your list: {{6}}"). Each count carries its own noun so
 * one reads "1 new claim"; {{5}} is the seasonal "Run it again" line, or blank.
 */
export function dailySummaryParams(businessName: string, c: ReturnType<typeof summaryCounts>, link: string, nudge?: string | null): string[] {
  const s = (n: number, one: string, many: string) => `${count(n)} ${n === 1 ? one : many}`;
  return [businessName, s(c.newClaims, "new claim", "new claims"), count(c.planningTomorrow), s(c.expiringSoon, "Tikka", "Tikkas"), nudge ?? "", link];
}

/** "Glow Studio today: 12 new claims, 3 planning to come tomorrow, 5 Tikkas expiring soon. Open your list: …" */
export function dailySummaryText(businessName: string, c: ReturnType<typeof summaryCounts>, link: string, nudge?: string | null): string {
  const [name, claims, planning, expiring] = dailySummaryParams(businessName, c, link, nudge);
  return `${name} today: ${claims}, ${planning} planning to come tomorrow, ${expiring} expiring soon.${nudge ? ` ${nudge}` : ""} Open your list: ${link}`;
}

/** Nothing new and nothing coming up: skip the message rather than send zeros. */
export function worthSending(c: ReturnType<typeof summaryCounts>, nudge?: string | null): boolean {
  return c.newClaims + c.planningTomorrow + c.expiringSoon > 0 || !!nudge;
}
