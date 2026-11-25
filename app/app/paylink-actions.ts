"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { sendDemoPayAlert } from "@/lib/money-alert-data";
import { getBusiness, isDbId, memberBusinessId } from "@/lib/data";
import { dbCancelPayLink, dbCounterExtras, dbCreatePayLink } from "@/lib/paylinks-db";
import { paystackMode } from "@/lib/paystack";
import { phoneKey } from "@/lib/clients";
import { cancelDemoPayLink, createDemoPayLink, isDemoToken, payDemoLink } from "@/lib/paylinks-demo";
import { getOwnerUser, getSessionUser } from "@/lib/session";
import { siteUrl } from "@/lib/supabase/env";

// Pay links from the dashboard (REVENUE_PLAN 5.3). Owners only; the database checks again that
// payments are open, the account matches this Paystack key, and the amount is within the maximum.

export type CreateResult = { kind: "created"; url: string } | { kind: string; maxKobo?: number };

export async function createPayLinkAction(input: { naira: number; note: string; name: string; claimId?: string; phone?: string; saleId?: string }): Promise<CreateResult> {
  const user = await getOwnerUser();
  const b = user ? await getBusiness(user) : null;
  // NEW DIRECTION (demo businesses): the in-memory pay links, paid by pretending on the pay page.
  if (user && b && !isDbId(b.id)) {
    const phone = phoneKey(input.phone) ?? undefined;
    // Every customer has a WhatsApp number (a balance's sale already has one).
    if (!phone && !input.saleId) return { kind: "bad_phone" };
    const r = await createDemoPayLink(
      user,
      b.slug,
      {
        amountKobo: Math.round(Number(input.naira) * 100),
        note: String(input.note ?? ""),
        name: String(input.name ?? ""),
        phone,
        for: input.saleId ? { kind: "balance", saleId: String(input.saleId) } : input.claimId ? { kind: "tikka", claimId: String(input.claimId) } : { kind: "other" },
      },
      new Date(),
    );
    if (r.kind !== "created") return r;
    revalidatePath("/app", "layout");
    return { kind: "created", url: `${siteUrl()}/pay/${r.token}` };
  }
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
  if (user && b && !isDbId(b.id)) {
    const ok = await cancelDemoPayLink(user, String(id));
    revalidatePath("/app", "layout");
    return { kind: ok ? "cancelled" : "not_found" };
  }
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

/** DEMO: the customer's pay page pretends the payment (only demo links, which exist only in development). */
export async function payDemoLinkAction(token: string): Promise<{ kind: string }> {
  const t = String(token ?? "");
  if (!isDemoToken(t)) return { kind: "not_found" };
  const r = await payDemoLink(t, new Date());
  if (r.kind === "paid") {
    const l = r.link;
    // The owner's "₦X paid" alert, after the customer's page has answered.
    after(async () => {
      const b = await getBusiness({ id: l.owner, role: "owner" });
      await sendDemoPayAlert(l.owner, { businessName: b?.name ?? "Tikka", firstName: l.customerName ?? "", amountKobo: l.amountKobo, note: l.note, linkId: l.id });
    });
  }
  revalidatePath(`/pay/${t}`);
  revalidatePath("/app", "layout");
  return { kind: r.kind };
}
