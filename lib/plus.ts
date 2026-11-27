// Tikka Plus (decided 27 Nov 2026; supabase/migrations/20261224140000_tikka_plus.sql): ₦10,000 a
// month, paid month by month. Pure helpers shared by the pages; the database decides for real.

import type { Business } from "./types";

/** Has Plus right now: no "Made with Tikka" on their page, Featured in search, room for 60 photos. */
export function hasPlus(b: Pick<Business, "plusUntil">, now = new Date()): boolean {
  return !!b.plusUntil && new Date(b.plusUntil).getTime() > now.getTime();
}

/** Days left, rounded up (for "Plus ends in 3 days"). */
export function plusDaysLeft(until: string | undefined, now = new Date()): number {
  if (!until) return 0;
  return Math.max(0, Math.ceil((new Date(until).getTime() - now.getTime()) / 86_400_000));
}

/** What Plus adds, in owners' words (the pricing page, the Plus page). */
export const PLUS_FEATURES = [
  "We put your business at the top when people search",
  "A drop every month to bring in new customers",
  "Up to 60 photos and videos of your work",
  "No \u201cMade with Tikka\u201d on your page",
] as const;
