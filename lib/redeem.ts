// Redemption and review rules (TECH_PLAN §8, §9). Pure, so the rules are pinned by tests;
// check_code / confirm_redemption / submit_review in Postgres apply the same rules under a row lock.

import { isWellFormed, normalize } from "./codes";
import type { ClaimedCard, Tier } from "./types";
import { claimExpiry, validDaysLabel, validOn, type VisitPart } from "./visit";

export const REVIEW_WINDOW_DAYS = 30;
export const REVIEW_MAX = 140;

/** One claim as the server keeps it. Phone numbers never live here (rule 4). */
export interface ClaimRecord {
  token: string;
  dropId: string;
  ownerId: string;
  /** A drop Tikka, or the next-visit Tikka sent after redeeming one. */
  kind?: "drop" | "bounce_back";
  /** Bounce-backs: the Tikka whose redemption created it (one each). */
  parentToken?: string;
  card: ClaimedCard;
  /** Quiet-day drops: codes only work on these days (copied from the drop). */
  validWeekdays?: number[] | null;
  /** "When will you come in?" */
  plannedVisitDate?: string;
  plannedVisitPart?: VisitPart;
  /** The one expiry reminder. */
  reminderSentAt?: string;
  /** Ticked "Tell me about future drops" on the claim sheet (marketing opt-in, rule 12). */
  futureDrops?: boolean;
  /** From the WhatsApp profile name when there is one: "O" for Okafor. */
  lastInitial?: string;
  claimedAt: string;
  /** Set once the card has been flipped (in the browser or from the WhatsApp link). */
  revealedAt?: string;
  redeemedAt?: string;
  billKobo?: number;
  /** "New customer" / "Been here before", as marked at the counter. */
  customerStatus?: "new" | "returning";
  redeemedBy?: string;
  review?: ReviewRecord;
}

export interface ReviewRecord {
  rating: number;
  body?: string;
  at: string;
  status: "visible" | "reported";
  reportReason?: string;
}

export type CheckResult =
  | {
      kind: "valid";
      code: string;
      name: string;
      reward: string;
      tier: Tier;
      expiresAt: string;
      action?: string;
      /** Preselects "New customer" / "Been here before" from their history with this business. */
      suggestedStatus: "new" | "returning";
    }
  | { kind: "already_used"; code: string; at: string }
  | { kind: "expired"; code: string; at: string }
  | { kind: "wrong_day"; code: string; days: string }
  | { kind: "wrong_business"; code: string }
  | { kind: "unknown"; code: string }
  | { kind: "typo"; code: string };

/** "Adaeze O." — first name and last initial, never more. */
export function displayName(first: string, lastInitial?: string): string {
  return lastInitial ? `${first} ${lastInitial.toUpperCase()}.` : first;
}

/** Shape and check character, before anything reaches the server. */
export function offlineCheck(input: string): { ok: true; code: string } | { ok: false; result: CheckResult } {
  const code = normalize(input);
  if (!code) return { ok: false, result: { kind: "unknown", code: input.trim().toUpperCase() } };
  if (!isWellFormed(code)) return { ok: false, result: { kind: "typo", code } };
  return { ok: true, code };
}

/** check_code: read-only. Never changes the claim (rule 5). `returning` comes from their history with the business. */
export function checkClaim(claim: ClaimRecord | undefined, ownerId: string, code: string, now: Date, returning = false): CheckResult {
  if (!claim) return { kind: "unknown", code };
  if (claim.ownerId !== ownerId) return { kind: "wrong_business", code };
  if (claim.redeemedAt) return { kind: "already_used", code, at: claim.redeemedAt };
  if (new Date(claim.card.expiresAt) <= now) return { kind: "expired", code, at: claim.card.expiresAt };
  if (!validOn(claim.validWeekdays, now)) return { kind: "wrong_day", code, days: validDaysLabel(claim.validWeekdays!) };
  return {
    kind: "valid",
    code,
    name: displayName(claim.card.claimer, claim.lastInitial),
    reward: claim.card.reward,
    tier: claim.card.tier,
    expiresAt: claim.card.expiresAt,
    action: claim.card.action,
    suggestedStatus: returning || claim.kind === "bounce_back" ? "returning" : "new",
  };
}

export type ConfirmResult = { ok: true; claim: ClaimRecord; name: string } | { ok: false; result: CheckResult | { kind: "needs_action"; code: string } };

/**
 * confirm_redemption: re-checks, needs the staff tick for action cards, then marks the claim
 * used. Returns the new record; the caller writes it while holding the claim's lock.
 */
export function confirmClaim(
  claim: ClaimRecord | undefined,
  ownerId: string,
  code: string,
  input: { billKobo?: number; actionConfirmed: boolean; by: string; customerStatus?: "new" | "returning" },
  now: Date,
): ConfirmResult {
  const check = checkClaim(claim, ownerId, code, now);
  const status = input.customerStatus ?? (check.kind === "valid" ? check.suggestedStatus : undefined);
  if (check.kind !== "valid" || !claim) return { ok: false, result: check };
  if (check.action && !input.actionConfirmed) return { ok: false, result: { kind: "needs_action", code } };
  const bill = input.billKobo && input.billKobo > 0 ? Math.round(input.billKobo) : undefined;
  return {
    ok: true,
    name: claim.card.claimer,
    claim: { ...claim, redeemedAt: now.toISOString(), billKobo: bill, customerStatus: status, redeemedBy: input.by },
  };
}

/** A drop's next-visit offer, as the bounce-back Tikka needs it. */
export interface BounceBackOffer {
  reward: string;
  validityDays: number;
}

/**
 * confirm_redemption's second half: a redeemed drop Tikka with a next-visit offer gets one
 * bounce-back Tikka (unique per parent; bounce-backs never make another).
 */
export function bounceBackFor(
  parent: ClaimRecord,
  offer: BounceBackOffer | null | undefined,
  existing: ClaimRecord[],
  make: { token: string; code: string },
  now: Date,
): ClaimRecord | null {
  if (!offer || !parent.redeemedAt || (parent.kind ?? "drop") !== "drop") return null;
  if (existing.some((c) => c.parentToken === parent.token)) return null;
  return {
    token: make.token,
    dropId: parent.dropId,
    ownerId: parent.ownerId,
    kind: "bounce_back",
    parentToken: parent.token,
    lastInitial: parent.lastInitial,
    claimedAt: now.toISOString(),
    revealedAt: now.toISOString(),
    card: {
      ...parent.card,
      token: make.token,
      kind: "bounce_back",
      tier: "thank_you",
      reward: offer.reward,
      instruction: undefined,
      action: undefined,
      code: make.code,
      expiresAt: claimExpiry(now, offer.validityDays),
    },
  };
}

export type ReviewState = "open" | "not_redeemed" | "reviewed" | "closed";

/** Only people who redeemed can review: once per claim, within 30 days (rule 6). */
export function reviewState(claim: Pick<ClaimRecord, "redeemedAt" | "review">, now: Date): ReviewState {
  if (claim.review) return "reviewed";
  if (!claim.redeemedAt) return "not_redeemed";
  const days = (now.getTime() - new Date(claim.redeemedAt).getTime()) / 86_400_000;
  return days > REVIEW_WINDOW_DAYS ? "closed" : "open";
}

export function validateReview(rating: unknown, body: unknown): { ok: true; rating: number; body?: string } | { ok: false; error: string } {
  const r = Number(rating);
  if (!Number.isInteger(r) || r < 1 || r > 5) return { ok: false, error: "Tap a star to rate your visit." };
  const text = typeof body === "string" ? body.trim().replace(/\s+/g, " ") : "";
  if (text.length > REVIEW_MAX) return { ok: false, error: `Keep it to ${REVIEW_MAX} characters.` };
  return { ok: true, rating: r, body: text || undefined };
}

/** The rating trigger: a new average after one more review. */
export function addRating(avg: number | undefined, count: number, rating: number): { rating: number; reviewCount: number } {
  const total = (avg ?? 0) * count + rating;
  return { rating: Math.round((total / (count + 1)) * 10) / 10, reviewCount: count + 1 };
}
