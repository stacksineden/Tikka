// The guarantee (PRD B5, TECH_PLAN §11 evaluate_guarantee): a paid drop that brings too few
// customers earns a free drop of the same size, once per business. Pure, so every condition is
// pinned by tests; the cron runs evaluate_guarantee with the same rules.

export interface GuaranteeClaim {
  kind: "drop" | "bounce_back";
  expiresAt: string;
  redeemedAt?: string;
}

export interface GuaranteeInput {
  /** How the drop was paid for: only paid drops are covered. */
  paidWith?: "voucher" | "payment";
  guaranteeUsed: boolean;
  /** The tier's promise; null for the free tier. */
  minRedemptions: number | null;
  endsAt: string;
  claims: GuaranteeClaim[];
  /** Different sources with views (link sources, and each poster counts as its own). */
  sourcesWithViews: number;
  fromTemplate: boolean;
  ignoredWarnings: string[];
}

/**
 * Due once nothing from the drop can still be redeemed: the drop has ended and every claimed
 * Tikka is redeemed or past its own expiry (so a claim made on the last day keeps the check
 * waiting until it's used or expires).
 */
export function guaranteeDue(i: Pick<GuaranteeInput, "endsAt" | "claims">, now: Date): boolean {
  if (new Date(i.endsAt) > now) return false;
  return i.claims.filter((c) => c.kind === "drop").every((c) => c.redeemedAt || new Date(c.expiresAt) <= now);
}

/** Every redeemed Tikka from the drop counts, all tiers; bounce-backs don't. */
export function redemptionsForGuarantee(claims: GuaranteeClaim[]): number {
  return claims.filter((c) => c.kind === "drop" && c.redeemedAt).length;
}

export type GuaranteeResult =
  | { earned: true; redemptions: number }
  | { earned: false; reason: "not_due" | "not_paid" | "already_used" | "no_promise" | "enough_customers" | "few_sources" | "ignored_warnings"; redemptions: number };

export function evaluateGuarantee(i: GuaranteeInput, now: Date): GuaranteeResult {
  const redemptions = redemptionsForGuarantee(i.claims);
  const no = (reason: Exclude<GuaranteeResult, { earned: true }>["reason"]) => ({ earned: false as const, reason, redemptions });
  if (!guaranteeDue(i, now)) return no("not_due");
  if (i.paidWith !== "payment") return no("not_paid");
  if (i.guaranteeUsed) return no("already_used");
  if (!i.minRedemptions) return no("no_promise");
  if (redemptions >= i.minRedemptions) return no("enough_customers");
  if (i.sourcesWithViews < 3) return no("few_sources");
  if (!i.fromTemplate && i.ignoredWarnings.length > 0) return no("ignored_warnings");
  return { earned: true, redemptions };
}

/** "Your drop brought fewer customers than we promised. Your next Medium drop is on us." */
export function guaranteeMessage(tierLabel: string): string {
  return `Your drop brought fewer customers than we promised. Your next ${tierLabel.replace(/ drop$/, "")} drop is on us.`;
}
