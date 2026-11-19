"use server";

import { getBusiness } from "@/lib/data";
import { getOwnerUser } from "@/lib/session";
import { dismissTeaser } from "@/lib/studio-db";

// The dashboard Home card for deposits (components/payments/PaymentsTeaser.tsx): hiding it.

export async function dismissPaymentsAction(): Promise<{ ok: boolean }> {
  const owner = await getOwnerUser();
  const business = owner ? await getBusiness(owner) : null;
  if (!business) return { ok: false };
  return { ok: await dismissTeaser(business.id, "payments_dashboard") };
}
