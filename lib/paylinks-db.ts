import "server-only";

import { adminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";

// Pay links (supabase/migrations/20261122100000_pay_links.sql). Who may do what is checked in the
// database; Paystack is called from app/api/pay and the pay page.

type Row = Record<string, unknown>;

export interface PayLink {
  id: string;
  token: string;
  amountKobo: number;
  note: string;
  customerName?: string;
  status: "open" | "paid" | "cancelled";
  paidKobo?: number;
  feeKobo?: number;
  tikkaKobo?: number;
  paidAt?: string;
  createdAt: string;
  claimId?: string;
  /** The Tikka claimer's number (owners only). */
  phone?: string;
  mode: "test" | "live";
}

export async function dbCreatePayLink(businessId: string, input: { amountKobo: number; note: string; name: string; claimId?: string; mode: "test" | "live" }): Promise<Row> {
  const sb = await createClient();
  const { data, error } = await sb.rpc("create_pay_link", {
    p_business: businessId,
    p_amount_kobo: input.amountKobo,
    p_note: input.note,
    p_name: input.name,
    p_claim: input.claimId ?? null,
    p_mode: input.mode,
  });
  if (error) return { kind: error.code === "42501" ? "no_access" : "error" };
  return (data ?? { kind: "error" }) as Row;
}

export async function dbPayLinks(businessId: string): Promise<PayLink[]> {
  const sb = await createClient();
  const { data, error } = await sb.rpc("get_pay_links", { p_business: businessId, p_limit: 200 });
  if (error) return [];
  return ((data ?? []) as Row[]).map((r) => ({
    id: String(r.id),
    token: String(r.token),
    amountKobo: Number(r.amount_kobo),
    note: String(r.note),
    customerName: (r.customer_name as string | null) ?? undefined,
    status: r.status as PayLink["status"],
    paidKobo: r.paid_kobo == null ? undefined : Number(r.paid_kobo),
    feeKobo: r.fee_kobo == null ? undefined : Number(r.fee_kobo),
    tikkaKobo: r.tikka_kobo == null ? undefined : Number(r.tikka_kobo),
    paidAt: (r.paid_at as string | null) ?? undefined,
    createdAt: String(r.created_at),
    claimId: (r.claim_id as string | null) ?? undefined,
    phone: (r.phone as string | null) ?? undefined,
    mode: (r.mode as "test" | "live") ?? "live",
  }));
}

export async function dbCancelPayLink(businessId: string, id: string): Promise<string> {
  const sb = await createClient();
  const { data, error } = await sb.rpc("cancel_pay_link", { p_business: businessId, p_link: id });
  if (error) return "error";
  return String((data as Row)?.kind ?? "error");
}

export interface PayPage {
  amountKobo: number;
  note: string;
  customerName?: string;
  status: PayLink["status"];
  paidAt?: string;
  businessSlug: string;
}

/** The public pay page. Never the account. */
export async function dbPayPage(token: string): Promise<PayPage | null> {
  if (!/^[a-z0-9]{10}$/.test(token)) return null;
  const { data, error } = await adminClient().rpc("pay_link_page", { p_token: token });
  if (error || !data) return null;
  const r = data as Row;
  return {
    amountKobo: Number(r.amount_kobo),
    note: String(r.note),
    customerName: (r.customer_name as string | null) ?? undefined,
    status: r.status as PayLink["status"],
    paidAt: (r.paid_at as string | null) ?? undefined,
    businessSlug: String(r.business_slug),
  };
}

export interface PayCheckout {
  amountKobo: number;
  tikkaKobo: number;
  status: PayLink["status"];
  subaccount: string;
  mode: "test" | "live";
  businessName: string;
  open: boolean;
}

/** What starting a checkout needs (server only). */
export async function dbPayCheckout(token: string): Promise<PayCheckout | null> {
  if (!/^[a-z0-9]{10}$/.test(token)) return null;
  const { data, error } = await adminClient().rpc("pay_link_checkout", { p_token: token });
  if (error || !data) return null;
  const r = data as Row;
  return {
    amountKobo: Number(r.amount_kobo),
    tikkaKobo: Number(r.tikka_kobo),
    status: r.status as PayLink["status"],
    subaccount: String(r.subaccount),
    mode: r.mode as "test" | "live",
    businessName: String(r.business_name),
    // The same payment rule as everywhere (supabase/migrations/20261130100000_checkout_rule.sql).
    open: r.enabled === true && r.suspended !== true && r.payments_ok !== false,
  };
}

/** Records a successful payment (webhook or the return from checkout). Idempotent: only the first
 *  call says "paid" (with the link's id, for the owner's alert); repeats say "already_paid". */
export async function dbCompletePayLink(reference: string, amountKobo: number, feeKobo: number, email: string | null): Promise<{ kind: string; id?: string }> {
  const { data, error } = await adminClient().rpc("complete_pay_link", { p_reference: reference, p_amount_kobo: amountKobo, p_fee_kobo: feeKobo, p_email: email });
  if (error) return { kind: "error" };
  const r = data as Row | null;
  return { kind: String(r?.kind ?? "error"), id: r?.id ? String(r.id) : undefined };
}

/** At the counter: what was paid online for a Tikka (team only, amounts only). */
export async function dbPaidForCode(businessId: string, code: string): Promise<number> {
  const sb = await createClient();
  const { data, error } = await sb.rpc("paid_for_code", { p_business: businessId, p_code: code });
  if (error) return 0;
  return Number((data as Row)?.paid_kobo ?? 0);
}

/** At the counter, beside a Tikka's code: paid online for it, and the booking made with it (team only). */
export async function dbCounterExtras(businessId: string, code: string): Promise<{ paidKobo: number; booking: { startsAt: string; service: string; code: string } | null }> {
  const sb = await createClient();
  const { data, error } = await sb.rpc("counter_extras", { p_business: businessId, p_code: code });
  if (error || !data) return { paidKobo: await dbPaidForCode(businessId, code), booking: null };
  const r = data as { paid_kobo: number; booking: { starts_at: string; service: string; code: string } | null };
  return { paidKobo: Number(r.paid_kobo ?? 0), booking: r.booking ? { startsAt: r.booking.starts_at, service: r.booking.service, code: r.booking.code } : null };
}
