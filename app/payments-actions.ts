"use server";

import { getBusiness } from "@/lib/data";
import { getOwnerUser, getSessionUser } from "@/lib/session";
import { dismissTeaser, joinEarlyAccess } from "@/lib/studio-db";

// "Coming soon: payments and deposits" (docs/REVENUE_PLAN.md item 6). Payments aren't built: these
// only record interest and hide the dashboard card. Signed out, the button goes to sign-up instead.

export async function joinPaymentsAction(): Promise<{ ok: true } | { ok: false; reason: "signed_out" | "not_owner" | "failed" }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, reason: "signed_out" };
  const owner = await getOwnerUser();
  const business = owner ? await getBusiness(owner) : null;
  if (!business) return { ok: false, reason: "not_owner" };
  return (await joinEarlyAccess(business.id, "payments")) ? { ok: true } : { ok: false, reason: "failed" };
}

export async function dismissPaymentsAction(): Promise<{ ok: boolean }> {
  const owner = await getOwnerUser();
  const business = owner ? await getBusiness(owner) : null;
  if (!business) return { ok: false };
  return { ok: await dismissTeaser(business.id, "payments_dashboard") };
}
