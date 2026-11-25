"use server";

// NEW DIRECTION: the client book (notes, birthdays, matching walk-ins). Owners only; demo only for now.

import { revalidatePath } from "next/cache";
import { saveClientNote } from "@/lib/clients-data";
import { nameKey, phoneKey } from "@/lib/clients";
import { matchWalkIn } from "@/lib/ledger-data";
import { getOwnerUser } from "@/lib/session";

export async function saveClientNoteAction(key: string, note: { notes?: string; birthday?: string }) {
  const user = await getOwnerUser();
  if (!user) return { ok: false as const };
  const ok = await saveClientNote(user, key, note);
  revalidatePath("/app/leads", "layout");
  return { ok };
}

/** "Is this Ada Nwosu?": the walk-in's sales join the customer with that number. */
export async function matchWalkInAction(walkInKey: string, name: string, phone: string) {
  const user = await getOwnerUser();
  const p = phoneKey(phone);
  if (!user || !p || walkInKey !== nameKey(name)) return { ok: false as const };
  await matchWalkIn(user, name, p);
  revalidatePath("/app", "layout");
  return { ok: true as const, key: p };
}
