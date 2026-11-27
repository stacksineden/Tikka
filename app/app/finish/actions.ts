"use server";

// "Finish setting up" (docs/DB_MOVE.md step 8): a business set up the old way adds what the new
// screens use: what it does, where it works (and the travel fee), and the booking rules customers see.
// Its page, services and photos stay as they are. Owners only; saved through saveBusiness().

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { ensureStartingPin } from "@/lib/listing-db";
import { BusinessSaveError, getBusiness, saveBusiness } from "@/lib/data";
import { isTrade, TRAVEL_REACHES } from "@/lib/presets";
import { getOwnerUser } from "@/lib/session";
import type { TravelReach, WorkPlace } from "@/lib/types";

export async function finishSetupAction(input: { trades: string[]; workPlace: WorkPlace; travelFee: number; travelReach: TravelReach; rules: string[] }): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getOwnerUser();
  const b = user ? await getBusiness(user) : null;
  if (!user || !b) return { ok: false, error: "Sign in again to finish setting up." };
  const trades = input.trades.filter(isTrade).slice(0, 10);
  if (!trades.length) return { ok: false, error: "Pick what you do." };
  if (!["shop", "home", "both"].includes(input.workPlace)) return { ok: false, error: "Pick where you work." };
  const travels = input.workPlace !== "shop";
  const fee = Math.max(0, Math.min(10_000_000, Math.round(Number(input.travelFee) || 0)));
  const reach: TravelReach = TRAVEL_REACHES.includes(input.travelReach) ? input.travelReach : "city";
  const rules = input.rules.map((r) => String(r).trim().slice(0, 240)).filter(Boolean).slice(0, 10);
  try {
    await saveBusiness(user, {
      ...b,
      trades,
      workPlace: input.workPlace,
      travelFee: travels ? fee : undefined,
      travelReach: travels ? reach : undefined,
      bookingRules: rules,
      // Someone who only goes to customers shows as "comes to you" on drops and the page.
      serveMode: input.workPlace === "home" ? "come_to_you" : b.serveMode === "come_to_you" ? "in_store" : b.serveMode,
    });
  } catch (e) {
    return { ok: false, error: e instanceof BusinessSaveError ? e.message : "We couldn't save that. Try again." };
  }
  if (b.lat == null) after(() => ensureStartingPin({ ...b }));
  revalidatePath("/app", "layout");
  revalidatePath(`/${b.slug}`);
  return { ok: true };
}
