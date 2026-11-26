import "server-only";

// Pay links for the new screens (Today, Money, a customer's page), real or demo, in one shape.
// Real businesses: pay_links in Supabase (docs/DB_MOVE.md step 6), in this site's Paystack mode, with
// the most a link can be for once payments are ready. The demo: lib/paylinks-demo.ts.

import { getBusiness, isDbId } from "./data";
import { DEMO_MAX_KOBO, demoPayLinks, type DemoPayLink } from "./paylinks-demo";
import { dbPayLinks } from "./paylinks-db";
import { paystackMode } from "./paystack";
import { dbPayoutState, payReady } from "./payouts-db";
import type { SessionUser } from "./types";

export type OwnerPayLink = DemoPayLink;

/** The owner's pay links, newest first. */
export async function ownerPayLinks(user: Pick<SessionUser, "id" | "role">): Promise<OwnerPayLink[]> {
  if (user.role !== "owner") return [];
  if (!isDbId(user.id)) return demoPayLinks(user);
  const b = await getBusiness(user);
  if (!b || !isDbId(b.id)) return [];
  const mode = paystackMode();
  return (await dbPayLinks(b.id))
    .filter((l) => l.mode === mode)
    .map((l) => ({
      id: l.id,
      token: l.token,
      owner: b.id,
      businessSlug: b.slug,
      amountKobo: l.amountKobo,
      note: l.note,
      customerName: l.customerName,
      phone: l.phone,
      // A link for a balance is the one made with a sale; once paid, every link has a sale.
      for: l.claimId ? { kind: "tikka" as const, claimId: l.claimId } : l.saleId && l.status !== "paid" ? { kind: "balance" as const, saleId: l.saleId } : { kind: "other" as const },
      status: l.status,
      createdAt: l.createdAt,
      paidAt: l.paidAt,
      saleId: l.saleId,
      receiptToken: l.receiptToken,
    }));
}

/**
 * The most one pay link can be for, or why the owner can't send one yet: "closed" (Tikka hasn't
 * switched payments on, or the ID isn't approved), "no_account" (no bank account yet) or
 * "account_again" (the account was made with the other Paystack key).
 */
export async function payLinkLimit(user: Pick<SessionUser, "id" | "role">): Promise<{ ready: true; maxKobo: number } | { ready: false; why: "closed" | "no_account" | "account_again" }> {
  if (!isDbId(user.id)) return { ready: true, maxKobo: DEMO_MAX_KOBO };
  const b = await getBusiness(user);
  if (!b || !isDbId(b.id)) return { ready: false, why: "closed" };
  const r = payReady(await dbPayoutState(b.id), paystackMode());
  return r.ready ? { ready: true, maxKobo: r.maxKobo } : { ready: false, why: r.why ?? "closed" };
}
