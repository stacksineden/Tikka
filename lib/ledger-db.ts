import "server-only";

import type { Booking } from "./bookings";
import type { ExpenseKind, Ledger, PayMethod, Sale } from "./ledger";
import { adminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";

// Sales and money for businesses in Supabase (supabase/migrations/20261209100000_sales_money.sql,
// docs/DB_MOVE.md step 4). Owners only; the database checks it. Amounts are kobo.

type Row = Record<string, unknown>;

/** A pay link paid online, shown as a sale paid by pay link (read from pay_links, never stored as one). */
export const PAY_LINK_SALE = "pl:";

function saleFrom(r: Row): Sale & { receiptToken?: string } {
  return {
    id: String(r.id),
    at: String(r.at),
    name: String(r.name),
    item: String(r.item),
    totalKobo: Number(r.total_kobo),
    payments: ((r.payments as Row[] | null) ?? []).map((p) => ({ at: String(p.at), kobo: Number(p.kobo), method: p.method as PayMethod })),
    bookingId: (r.booking_id as string | null) ?? undefined,
    phone: (r.phone as string | null) ?? undefined,
    receiptToken: (r.receipt_token as string | null) ?? undefined,
  };
}

/** get_ledger(): sales with their payments, expenses, regular costs, and paid pay links as sales. */
export async function dbGetLedger(businessId: string): Promise<Ledger & { receipts: Record<string, string> }> {
  const sb = await createClient();
  const { data, error } = await sb.rpc("get_ledger", { p_business: businessId });
  if (error || !data) return { sales: [], expenses: [], regular: [], receipts: {} };
  const r = data as Row;
  const sales = ((r.sales as Row[] | null) ?? []).map(saleFrom);
  const links: Sale[] = ((r.pay_links as Row[] | null) ?? []).map((l) => ({
    id: PAY_LINK_SALE + String(l.id),
    at: String(l.paid_at),
    name: String(l.name ?? "Customer"),
    item: String(l.note ?? "Pay link"),
    totalKobo: Number(l.kobo),
    payments: [{ at: String(l.paid_at), kobo: Number(l.kobo), method: "pay_link" as const }],
    phone: (l.phone as string | null) ?? undefined,
  }));
  return {
    sales: [...sales.map(({ receiptToken: _t, ...s }) => s), ...links].sort((a, b) => a.at.localeCompare(b.at)),
    expenses: ((r.expenses as Row[] | null) ?? []).map((e) => ({ id: String(e.id), at: String(e.at), kind: e.kind as ExpenseKind, kobo: Number(e.kobo) })),
    regular: ((r.regular as Row[] | null) ?? []).map((x) => ({ id: String(x.id), kind: x.kind as ExpenseKind, kobo: Number(x.kobo), every: x.every as "week" | "month", from: String(x.from) })),
    receipts: Object.fromEntries(sales.filter((s) => s.receiptToken).map((s) => [s.id, s.receiptToken!])),
  };
}

/** record_sale(): returns the sale's id (the same one for a booking already settled). */
export async function dbRecordSale(
  businessId: string,
  input: { name: string; item: string; totalKobo: number; paidKobo: number; method: Exclude<PayMethod, "pay_link">; bookingId?: string; phone?: string },
): Promise<string | null> {
  const sb = await createClient();
  const { data, error } = await sb.rpc("record_sale", {
    p_business: businessId,
    p_name: input.name,
    p_item: input.item,
    p_total_kobo: input.totalKobo,
    p_paid_kobo: input.paidKobo,
    p_method: input.method,
    p_booking: input.bookingId ?? null,
    p_phone: input.phone ?? null,
  });
  return error || !data ? null : String(data);
}

export async function dbPayBalance(businessId: string, saleId: string, kobo: number, method: Exclude<PayMethod, "pay_link">): Promise<boolean> {
  const sb = await createClient();
  const { data, error } = await sb.rpc("pay_balance", { p_business: businessId, p_sale: saleId, p_kobo: kobo, p_method: method });
  return !error && data === true;
}

export async function dbAddExpense(businessId: string, kind: ExpenseKind, kobo: number, every?: "week" | "month"): Promise<boolean> {
  const sb = await createClient();
  const { data, error } = await sb.rpc("add_expense", { p_business: businessId, p_kind: kind, p_kobo: kobo, p_every: every ?? null });
  return !error && data === true;
}

/** receipt_for(): the sale's receipt link, the same every time. */
export async function dbReceiptFor(businessId: string, saleId: string): Promise<string | null> {
  const sb = await createClient();
  const { data, error } = await sb.rpc("receipt_for", { p_business: businessId, p_sale: saleId });
  return error || !data ? null : String(data);
}

/** receipt_page(): what a receipt shows, by its link. Server only; never the number or address. */
export async function dbReceiptPage(token: string): Promise<{ businessSlug: string; n: number; sale: Sale; booking: Booking | null } | null> {
  if (!/^rc-[A-Za-z0-9_-]{12}$/.test(token)) return null;
  const { data, error } = await adminClient().rpc("receipt_page", { p_token: token });
  if (error || !data) return null;
  const r = data as Row;
  const b = r.booking as Row | null;
  return {
    businessSlug: String(r.business_slug),
    n: Number(r.n ?? 1),
    sale: saleFrom(r.sale as Row),
    booking: b
      ? {
          id: String(b.id),
          service: String(b.service),
          minutes: Number(b.minutes),
          startsAt: String(b.starts_at),
          endsAt: String(b.ends_at),
          firstName: String(b.first_name),
          source: b.source as Booking["source"],
          status: b.status as Booking["status"],
          code: String(b.code),
          moved: false,
          createdAt: String(b.created_at),
          depositPaidKobo: b.deposit_paid_kobo == null ? undefined : Number(b.deposit_paid_kobo),
          depositCounts: b.deposit_counts == null ? undefined : b.deposit_counts === true,
          priceKobo: b.price_kobo == null ? undefined : Number(b.price_kobo),
          priceKind: (b.price_kind as Booking["priceKind"]) ?? undefined,
          detail: (b.detail as string | null) ?? undefined,
        }
      : null,
  };
}
