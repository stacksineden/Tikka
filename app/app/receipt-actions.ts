"use server";

// NEW DIRECTION: "Send receipt" (demo store). Owners only: the receipt link for a sale, to send from
// their own WhatsApp.

import { receiptFor } from "@/lib/receipts-data";
import { getOwnerUser } from "@/lib/session";
import { siteUrl } from "@/lib/supabase/env";

export async function receiptAction(saleId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const user = await getOwnerUser();
  if (!user) return { ok: false, error: "Sign in again." };
  const token = await receiptFor(user, String(saleId ?? ""));
  if (!token) return { ok: false, error: "Receipts only work with the demo for now." };
  return { ok: true, url: `${siteUrl()}/r/${token}` };
}
