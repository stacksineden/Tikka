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
