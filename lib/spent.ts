// "What did they spend?" after redeeming (owner only): add or fix the amount on a used Tikka, so the
// drop's results count that sale. Mirrors public.set_redemption_amount() in
// supabase/migrations/20261118160000_redemption_amount.sql.

/** How long after a Tikka is used the owner can still add or change what was spent. */
export const SPENT_DAYS = 30;
/** The most one visit can record, in naira (the database keeps kobo in an int). */
export const MAX_SPENT_NAIRA = 10_000_000;
/** Digits the amount box takes: up to ₦9,999,999. */
export const SPENT_DIGITS = 7;

const DAY = 86_400_000;

export type SpentResult =
  | { kind: "saved"; naira: number; name: string }
  | { kind: "not_used" | "too_late" | "bad_amount" | "unknown" };

/** Whether a Tikka used at `redeemedAt` can still have its amount added or changed. */
export function canSetSpent(redeemedAt: string | undefined, now: Date): boolean {
  if (!redeemedAt) return false;
  return now.getTime() - new Date(redeemedAt).getTime() <= SPENT_DAYS * DAY;
}

/** "25,000" → 25000. Empty or 0 → 0 (clears it). Null when it isn't an amount Tikka can keep. */
export function parseNaira(input: string): number | null {
  const digits = input.replace(/[^\d]/g, "");
  if (!digits) return 0;
  const n = Number(digits);
  return Number.isSafeInteger(n) && n <= MAX_SPENT_NAIRA ? n : null;
}

/** What the amount box shows while typing: digits only, grouped, at most SPENT_DIGITS long. */
export function formatNairaInput(input: string): string {
  const d = input.replace(/[^\d]/g, "").slice(0, SPENT_DIGITS);
  return d ? Number(d).toLocaleString("en-NG") : "";
}

/** Why it couldn't be saved, in the owner's words. */
export function spentProblem(kind: Exclude<SpentResult["kind"], "saved">): string {
  switch (kind) {
    case "not_used":
      return "This Tikka hasn't been used yet. Add what they spent when you confirm it at the counter.";
    case "too_late":
      return `You can only change this within ${SPENT_DAYS} days of the visit.`;
    case "bad_amount":
      return "Type an amount in naira, like 15,000.";
    default:
      return "We couldn't find that Tikka.";
  }
}
