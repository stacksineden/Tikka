"use server";

import { revalidatePath } from "next/cache";
import { isDbId } from "@/lib/data";
import { dbBuyPlus, dbRequestDomain } from "@/lib/plus-db";
import { getOwnerUser } from "@/lib/session";

// Tikka Plus from the dashboard (supabase/migrations/20261224140000_tikka_plus.sql). Owners only;
// the database checks again and prices it (the browser never sends an amount).

/** A month of Plus: opens a pending payment; the page sends the owner to pay it. */
export async function buyPlusAction(): Promise<{ ok: true; paymentId: string } | { ok: false; error: string }> {
  const user = await getOwnerUser();
  if (!user) return { ok: false, error: "Only the owner can get Tikka Plus." };
  if (!isDbId(user.id)) return { ok: false, error: "Tikka Plus isn't in the demo." };
  const payment = await dbBuyPlus();
  if (!payment) return { ok: false, error: "We couldn't start the payment. Try again." };
  return { ok: true, paymentId: payment.id };
}

/** Ask Tikka to set up their own web address. */
export async function requestDomainAction(domain: string, note: string): Promise<{ ok: boolean; error?: string }> {
  const user = await getOwnerUser();
  if (!user) return { ok: false, error: "Only the owner can ask." };
  if (!isDbId(user.id)) return { ok: false, error: "Not in the demo." };
  const ok = await dbRequestDomain(String(domain ?? "").slice(0, 100), String(note ?? "").slice(0, 500));
  if (ok) revalidatePath("/app/plus");
  return ok ? { ok } : { ok, error: "That didn't send. Try again." };
}
