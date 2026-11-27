// Who gets the new experience (Today · Calendar · Customers · Money · More, docs/NEW_DIRECTION.md):
// every real business (decided 26 Nov 2026, docs/DB_MOVE.md step 8), and demo businesses made with
// the new setup. The older demo businesses keep the drops-first screens. Pure, so the server and the
// browser agree.

import type { Business } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function newExperience(b: Pick<Business, "id" | "trades"> | null | undefined): boolean {
  if (!b) return false;
  return UUID.test(b.id) || !!b.trades?.length;
}

/**
 * What a business set up the old way still needs for the new screens (the trade, where it works and
 * the booking rules customers see). Empty when it's done. Real businesses only.
 */
export function finishSetupMissing(b: Pick<Business, "id" | "trades" | "workPlace" | "bookingRules">): ("trade" | "place" | "rules")[] {
  if (!UUID.test(b.id)) return [];
  const missing: ("trade" | "place" | "rules")[] = [];
  if (!b.trades?.length) missing.push("trade");
  if (!b.workPlace) missing.push("place");
  if (!b.bookingRules?.length) missing.push("rules");
  return missing;
}

/** The three things that make a business page look like theirs (Today's "Finish your page" row). */
export const PAGE_STEPS = 3;

/**
 * What a business page still needs: a photo at the top, a few words about them, three photos of
 * their work. The row on Today goes away once all three are done (a logo is optional, so it isn't one).
 */
export function pageMissing(b: Pick<Business, "about" | "portfolio" | "page">): string[] {
  const missing: string[] = [];
  if (!b.page?.heroImageUrl) missing.push("a photo at the top");
  if (!b.about?.trim()) missing.push("a few words about you");
  if (b.portfolio.length < 3) missing.push(b.portfolio.length ? `${3 - b.portfolio.length} more photos of your work` : "3 photos of your work");
  return missing;
}
