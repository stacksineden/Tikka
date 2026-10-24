import "server-only";

import { randomBytes } from "node:crypto";
import { ownedBusinessId } from "./business-db";
import type { DropDraft } from "./drop";
import { draftFrom, draftTo, dropFrom, dropSlug, type DropCounts, type DropRow } from "./drop-map";
import type { Payment } from "./payments";
import { adminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";
import type { Drop } from "./types";
import type { Voucher } from "./vouchers";

// Drops, payments and drops-without-paying in Supabase, as the signed-in owner (RLS decides).
// lib/data.ts calls these for real accounts and keeps the demo store for demo businesses.

export class DropSaveError extends Error {}

const DROP_COLUMNS =
  "id, slug, title, goal, template_id, total_cards, finish, starts_at, ends_at, validity_days, valid_weekdays, bounce_back, ignored_warnings, status, published_at, show_in_marketplace, tier_id, tier_max_cards, paid_with, payment_status, builder, rewards(tier, kind, value, title, action_text, terms, quantity, min_spend_kobo, requires_purchase)";

async function mine() {
  const sb = await createClient();
  const { data } = await sb.auth.getClaims();
  const uid = data?.claims?.sub;
  return { sb, businessId: uid ? await ownedBusinessId(sb, uid) : null };
}

/** The owner's drops, newest first, with what claiming has done to each. */
export async function dbDrops(now: Date, rebuild: (d: Drop) => DropDraft): Promise<{ drop: Drop; draft: DropDraft }[]> {
  const { sb, businessId } = await mine();
  if (!businessId) return [];
  const { data: rows } = await sb.from("drops").select(DROP_COLUMNS).eq("business_id", businessId).order("created_at", { ascending: false }).returns<DropRow[]>();
  if (!rows?.length) return [];
  const ids = rows.map((r) => r.id);
  const [{ data: claims }, { data: pending }] = await Promise.all([
    sb.from("claims").select("drop_id, kind, redeemed_at, bill_amount_kobo").in("drop_id", ids),
    sb.from("payments").select("id, drop_id").eq("kind", "drop").eq("status", "pending").in("drop_id", ids).order("created_at", { ascending: false }),
  ]);
  const counts = new Map<string, DropCounts>();
  for (const c of claims ?? []) {
    if (c.kind !== "drop") continue;
    const n = counts.get(c.drop_id) ?? { claimed: 0, redeemed: 0, revenue: 0 };
    n.claimed++;
    if (c.redeemed_at) {
      n.redeemed++;
      n.revenue += (c.bill_amount_kobo ?? 0) / 100;
    }
    counts.set(c.drop_id, n);
  }
  const pendingFor = new Map<string, string>();
  for (const p of pending ?? []) if (!pendingFor.has(p.drop_id)) pendingFor.set(p.drop_id, p.id);
  const out = rows.map((row) => {
    const drop = dropFrom(row, counts.get(row.id) ?? { claimed: 0, redeemed: 0, revenue: 0 }, now, pendingFor.get(row.id));
    return { drop, draft: draftFrom(row, () => rebuild(drop)) };
  });
  // "142 people are waiting for this drop": a count, never who (rule 4).
  await Promise.all(
    out
      .filter(({ drop }) => drop.status === "scheduled")
      .map(async ({ drop }) => {
        const { data } = await sb.rpc("notify_waiting", { p_business: businessId, p_drop: drop.id });
        drop.notifyWaiting = typeof data === "number" ? data : 0;
      }),
  );
  return out;
}

/** Saves a draft (creating it on first save) and returns its id. Drafts get a placeholder address until they publish. */
export async function dbSaveDraft(draft: DropDraft, now: Date, slug?: string): Promise<string> {
  const { sb, businessId } = await mine();
  if (!businessId) throw new DropSaveError("Set up your card before creating a drop.");
  const existing = draft.id && /^[0-9a-f-]{36}$/i.test(draft.id) ? draft.id : null;
  let placeholder = slug;
  if (!placeholder && existing) {
    const { data } = await sb.from("drops").select("slug").eq("id", existing).maybeSingle();
    placeholder = data?.slug;
  }
  placeholder ??= `draft-${randomBytes(4).toString("hex")}`;
  const { data, error } = await sb.rpc("save_drop_draft", { p_business: businessId, p_drop: existing, p_draft: draftTo(draft, now, placeholder) });
  if (error) {
    if (error.code === "23505") throw new DropSaveError("You already have a drop at that address. Change the name a little.");
    if (error.code === "23514") throw new DropSaveError("Some of this drop's details aren't allowed. Check the dates and the number of Tikkas.");
    throw new DropSaveError("We couldn't save your drop. Try again.");
  }
  return data as string;
}

export type DbPublishResult =
  | { kind: "published"; id: string }
  | { kind: "payment"; id: string; paymentId: string }
  | { kind: "problem"; problem: string }
  | { kind: "contact"; max: number };

/**
 * Publishing: saves the draft under its real address, then publish_drop() decides on the server:
 * covered drops go live at once; paid ones get a pending payment.
 */
export async function dbPublish(draft: DropDraft, now: Date): Promise<DbPublishResult> {
  const { sb, businessId } = await mine();
  if (!businessId) throw new DropSaveError("Set up your card before creating a drop.");
  const { data: others } = await sb.from("drops").select("id, slug").eq("business_id", businessId);
  const taken = new Set((others ?? []).filter((o) => o.id !== draft.id).map((o) => o.slug));
  const id = await dbSaveDraft(draft, now, dropSlug(draft.name, taken));
  const { data, error } = await sb.rpc("publish_drop", { p_drop: id });
  if (error) throw new DropSaveError("We couldn't publish your drop. Try again.");
  const r = data as { kind: string; problem?: string; payment_id?: string; max?: number };
  if (r.kind === "published") return { kind: "published", id };
  if (r.kind === "payment") return { kind: "payment", id, paymentId: r.payment_id! };
  if (r.kind === "contact") return { kind: "contact", max: r.max ?? 3000 };
  return { kind: "problem", problem: r.problem ?? "unknown" };
}

export async function dbDeleteDraft(id: string): Promise<void> {
  const sb = await createClient();
  await sb.rpc("delete_drop_draft", { p_drop: id });
}

export async function dbAddTikkas(dropId: string, extra: number): Promise<{ kind: "added" } | { kind: "payment"; paymentId: string } | { kind: "contact"; max: number } | { kind: "problem" }> {
  const sb = await createClient();
  const { data, error } = await sb.rpc("add_tikkas", { p_drop: dropId, p_extra: extra });
  if (error) throw new DropSaveError("We couldn't add Tikkas. Try again.");
  const r = data as { kind: string; payment_id?: string; max?: number };
  if (r.kind === "added") return { kind: "added" };
  if (r.kind === "payment") return { kind: "payment", paymentId: r.payment_id! };
  if (r.kind === "contact") return { kind: "contact", max: r.max ?? 3000 };
  return { kind: "problem" };
}

export async function dbExtend(dropId: string, endsAtIso: string): Promise<string | null> {
  const sb = await createClient();
  const { data, error } = await sb.rpc("extend_drop", { p_drop: dropId, p_ends_at: endsAtIso });
  if (error) return "We couldn't change the end date. Try again.";
  const r = data as { kind: string; problem?: string };
  if (r.kind === "extended") return null;
  return r.problem === "too_long"
    ? "A drop can run for up to 30 days from its start."
    : r.problem === "overlaps_next"
      ? "That runs into your next scheduled drop. Pick an earlier end."
      : r.problem === "ended"
        ? "Pick a time in the future."
        : "This drop isn't running.";
}

export async function dbEndEarly(dropId: string): Promise<void> {
  const sb = await createClient();
  const { error } = await sb.rpc("end_drop_early", { p_drop: dropId });
  if (error) throw new DropSaveError("We couldn't end the drop. Try again.");
}

/* ------------------------------------------------------------ money */

interface PaymentRow {
  id: string;
  business_id: string;
  kind: Payment["kind"];
  drop_id: string | null;
  pack_id: string | null;
  from_tier: string | null;
  to_tier: string | null;
  extra_cards: number | null;
  amount_kobo: number;
  paystack_reference: string;
  status: Payment["status"];
  created_at: string;
  paid_at: string | null;
}

const paymentFrom = (r: PaymentRow): Payment => ({
  id: r.id,
  businessId: r.business_id,
  kind: r.kind,
  dropId: r.drop_id ?? undefined,
  packId: r.pack_id ?? undefined,
  fromTier: r.from_tier ?? undefined,
  toTier: r.to_tier ?? undefined,
  extraCards: r.extra_cards ?? undefined,
  amountKobo: r.amount_kobo,
  reference: r.paystack_reference,
  status: r.status,
  createdAt: r.created_at,
  paidAt: r.paid_at ?? undefined,
});

export async function dbPayments(): Promise<Payment[]> {
  const { sb, businessId } = await mine();
  if (!businessId) return [];
  const { data } = await sb.from("payments").select("*").eq("business_id", businessId).order("created_at", { ascending: false }).returns<PaymentRow[]>();
  return (data ?? []).map(paymentFrom);
}

export async function dbPayment(id: string): Promise<Payment | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const sb = await createClient();
  const { data } = await sb.from("payments").select("*").eq("id", id).maybeSingle<PaymentRow>();
  return data ? paymentFrom(data) : null;
}

export async function dbBuyPack(packId: string): Promise<Payment> {
  const { sb, businessId } = await mine();
  const { data, error } = await sb.rpc("buy_pack", { p_business: businessId, p_pack: packId });
  if (error) throw new DropSaveError("That season pack isn't available.");
  const payment = await dbPayment((data as { payment_id: string }).payment_id);
  if (!payment) throw new DropSaveError("We couldn't start the payment. Try again.");
  return payment;
}

/**
 * complete_payment(): what Paystack's webhook and the verify fallback call (the server itself).
 * Idempotent; a wrong amount fails the payment and publishes nothing.
 */
export async function dbCompletePayment(reference: string, amountKobo: number): Promise<{ kind: string }> {
  const { data, error } = await adminClient().rpc("complete_payment", { p_reference: reference, p_amount_kobo: amountKobo });
  if (error) throw new DropSaveError("We couldn't record the payment. Try again.");
  return data as { kind: string };
}

interface VoucherRow {
  id: string;
  business_id: string;
  tier_id: string;
  source: Voucher["source"];
  pack_payment_id: string | null;
  used_by_drop_id: string | null;
  expires_at: string | null;
  created_at: string;
  used_at: string | null;
}

export async function dbVouchers(): Promise<Voucher[]> {
  const { sb, businessId } = await mine();
  if (!businessId) return [];
  const { data } = await sb.from("drop_vouchers").select("*").eq("business_id", businessId).order("created_at").returns<VoucherRow[]>();
  return (data ?? []).map((v) => ({
    id: v.id,
    businessId: v.business_id,
    tierId: v.tier_id,
    source: v.source,
    packPaymentId: v.pack_payment_id ?? undefined,
    usedByDropId: v.used_by_drop_id ?? undefined,
    expiresAt: v.expires_at ?? undefined,
    createdAt: v.created_at,
    usedAt: v.used_at ?? undefined,
  }));
}
