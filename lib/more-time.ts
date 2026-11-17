// "Give more time" (owner only): one extra week on one Tikka, once, never more than 30 days from
// when it was claimed. For a customer who can't come before it runs out, so the business doesn't
// lose the visit. Never shown to customers as an option. Mirrors private.more_time_until() in
// supabase/migrations/20261118120000_more_time.sql.

export const MORE_TIME_DAYS = 7;
/** No Tikka ever lasts longer than this from when it was claimed, extra week or not. */
export const MAX_TIKKA_DAYS = 30;

const DAY = 86_400_000;

export interface MoreTimeInput {
  claimedAt: string;
  expiresAt: string;
  redeemedAt?: string;
  /** Set once it has had its extra week. */
  extendedAt?: string;
}

/**
 * The date "Give more time" would move this Tikka to, or null when it can't have more time:
 * used, already given more time, a 30-day Tikka, or expired so long ago that a week more would
 * still be in the past.
 */
export function moreTimeUntil(t: MoreTimeInput, now: Date): string | null {
  if (t.redeemedAt || t.extendedAt) return null;
  const expires = new Date(t.expiresAt).getTime();
  const until = Math.min(expires + MORE_TIME_DAYS * DAY, new Date(t.claimedAt).getTime() + MAX_TIKKA_DAYS * DAY);
  if (until <= Math.max(expires, now.getTime())) return null;
  return new Date(until).toISOString();
}

/** Why a Tikka can't have more time, in the owner's words. */
export function noMoreTimeReason(kind: "already_used" | "already_extended" | "no_more_time" | "unknown"): string {
  switch (kind) {
    case "already_used":
      return "This Tikka has already been used.";
    case "already_extended":
      return "This Tikka already had its extra week. It can only have more time once.";
    case "no_more_time":
      return "This Tikka can't have more time. A Tikka never lasts more than 30 days from when it was claimed.";
    default:
      return "We couldn't find that Tikka.";
  }
}

/** The owner's message from their own WhatsApp: "Hi Adaeze, I've kept your Tikka for you until Tue 2 Dec." */
export function moreTimeMessage(firstName: string, businessName: string, untilLabel: string): string {
  return `Hi ${firstName}, I've kept your ${businessName} Tikka for you until ${untilLabel}. See you then!`;
}
