"use server";

import { revalidatePath } from "next/cache";
import { getBusiness, isDbId, memberBusinessId } from "@/lib/data";
import { dbCancelPayLink, dbCounterExtras, dbCreatePayLink } from "@/lib/paylinks-db";
import { paystackMode } from "@/lib/paystack";
import { getOwnerUser, getSessionUser } from "@/lib/session";
import { siteUrl } from "@/lib/supabase/env";

// Pay links from the dashboard (REVENUE_PLAN 5.3). Owners only; the database checks again that
// payments are open, the account matches this Paystack key, and the amount is within the maximum.

export type CreateResult = { kind: "created"; url: string } | { kind: string; maxKobo?: number };

export async function createPayLinkAction(input: { naira: number; note: string; name: string; claimId?: string }): Promise<CreateResult> {
  const user = await getOwnerUser();
  const b = user ? await getBusiness(user) : null;
  const mode = paystackMode();
  if (!b || !isDbId(b.id) || !mode) return { kind: "not_enabled" };
  const kobo = Math.round(Number(input.naira) * 100);
  if (!Number.isFinite(kobo)) return { kind: "too_small" };
  const r = await dbCreatePayLink(b.id, { amountKobo: kobo, note: String(input.note ?? ""), name: String(input.name ?? ""), claimId: input.claimId, mode });
  if (r.kind !== "created") return { kind: String(r.kind), maxKobo: r.max_kobo == null ? undefined : Number(r.max_kobo) };
  revalidatePath("/app/money");
  return { kind: "created", url: `${siteUrl()}/pay/${String(r.token)}` };
}

export async function cancelPayLinkAction(id: string): Promise<{ kind: string }> {
  const user = await getOwnerUser();
  const b = user ? await getBusiness(user) : null;
  if (!b || !isDbId(b.id)) return { kind: "no_access" };
  const kind = await dbCancelPayLink(b.id, id);
  revalidatePath("/app/money");
  return { kind };
}

/** At the counter, beside a Tikka's code: paid online for it and its booking (owners and staff; never the number). */
export async function counterExtrasAction(code: string): Promise<{ paidKobo: number; booking: { startsAt: string; service: string; code: string } | null }> {
  const user = await getSessionUser();
  const biz = user ? await memberBusinessId(user) : null;
  if (!biz || !isDbId(biz)) return { paidKobo: 0, booking: null };
  return dbCounterExtras(biz, String(code ?? "").slice(0, 20));
}
