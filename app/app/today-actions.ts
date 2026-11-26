"use server";

// Today and Money (docs/OWNER_JOURNEYS.md journeys 4–6). Sales, balances and expenses save to Supabase
// for real accounts (docs/DB_MOVE.md step 4); pay links from Today are still the demo until step 6.

import { revalidatePath } from "next/cache";
import { markBooking, seedDemoDay } from "@/lib/bookings-data";
import { phoneKey } from "@/lib/clients";
import { getBusiness, isDbId } from "@/lib/data";
import { addExpense, getLedger, payBalance, recordSale, seedLedger } from "@/lib/ledger-data";
import { createDemoPayLink } from "@/lib/paylinks-demo";
import { siteUrl } from "@/lib/supabase/env";
import { EXPENSE_KINDS, type ExpenseKind, type PayMethod } from "@/lib/ledger";
import { getOwnerUser } from "@/lib/session";

const METHODS: PayMethod[] = ["cash", "transfer", "card", "pay_link"];
const done = () => {
  revalidatePath("/app", "layout");
  return { ok: true as const };
};

export async function arrivedAction(bookingId: string) {
  const user = await getOwnerUser();
  if (!user) return { ok: false as const };
  await markBooking(user, bookingId, "arrived");
  return done();
}

export async function paidAction(input: { bookingId?: string; name: string; item: string; totalNaira: number; paidNaira: number; method: PayMethod; phone?: string }) {
  const user = await getOwnerUser();
  if (!user || !METHODS.includes(input.method)) return { ok: false as const };
  // Every customer has a WhatsApp number: a booking brings its own; a New sale must give one.
  const phone = phoneKey(input.phone) ?? undefined;
  if (!input.bookingId && (!phone || String(input.name ?? "").trim().length < 2)) return { ok: false as const };
  if (input.bookingId) await markBooking(user, input.bookingId, "arrived");
  const ok = await recordSale(user, { ...input, phone: phone ?? input.phone }, new Date());
  return ok ? done() : { ok: false as const };
}

/**
 * "Pay link" on Today: a link for what a booked customer owes (the visit is saved as owed until they
 * pay), or for a balance under Still owed. Paying the link clears it (lib/paylinks-demo.ts).
 */
export async function payLinkTodayAction(input: {
  saleId?: string;
  /** A booked customer (with bookingId) or a New sale: saved as owed until the link is paid. */
  booking?: { bookingId?: string; name: string; item: string; totalNaira: number; paidNaira?: number; method?: PayMethod; phone?: string };
  linkNaira: number;
  note: string;
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const user = await getOwnerUser();
  const b = user ? await getBusiness(user) : null;
  if (!user || !b || isDbId(b.id)) return { ok: false, error: "Pay links from Today only work with the demo for now." };
  let saleId = input.saleId ? String(input.saleId) : null;
  let name = "";
  let phone: string | undefined;
  const now = new Date();
  if (input.booking) {
    const bk = input.booking;
    if (!bk.bookingId && (!phoneKey(bk.phone) || String(bk.name ?? "").trim().length < 2)) return { ok: false, error: "Add their name and WhatsApp number first." };
    if (bk.bookingId) await markBooking(user, String(bk.bookingId), "arrived");
    const method = bk.method && METHODS.includes(bk.method) && bk.method !== "pay_link" ? bk.method : "cash";
    saleId = await recordSale(user, { bookingId: bk.bookingId ? String(bk.bookingId) : undefined, name: bk.name.trim(), item: bk.item, totalNaira: bk.totalNaira, paidNaira: Math.max(0, Number(bk.paidNaira) || 0), method, phone: phoneKey(bk.phone) ?? bk.phone }, now);
    name = bk.name;
    phone = bk.phone;
  } else if (saleId) {
    const sale = (await getLedger(user)).sales.find((s) => s.id === saleId);
    if (!sale) return { ok: false, error: "That sale isn't there any more." };
    name = sale.name;
    phone = sale.phone;
  }
  if (!saleId) return { ok: false, error: "That didn't work. Try again." };
  const r = await createDemoPayLink(user, b.slug, { amountKobo: Math.round(Number(input.linkNaira) * 100), note: String(input.note ?? ""), name, phone: phoneKey(phone) ?? undefined, for: { kind: "balance", saleId } }, now);
  if (r.kind !== "created") return { ok: false, error: r.kind === "too_small" ? "The smallest pay link is ₦100." : r.kind === "bad_note" ? "Say what it's for." : r.kind === "too_big" ? "That's more than one pay link can be for now." : "That didn't work. Try again." };
  revalidatePath("/app", "layout");
  return { ok: true, url: `${siteUrl()}/pay/${r.token}` };
}

export async function payBalanceAction(saleId: string, naira: number, method: PayMethod) {
  const user = await getOwnerUser();
  if (!user || !METHODS.includes(method)) return { ok: false as const };
  return (await payBalance(user, saleId, naira, method, new Date())) ? done() : { ok: false as const };
}

export async function addExpenseAction(input: { kind: ExpenseKind; naira: number; every?: "week" | "month" }) {
  const user = await getOwnerUser();
  if (!user || !EXPENSE_KINDS.includes(input.kind)) return { ok: false as const };
  return (await addExpense(user, input, new Date())) ? done() : { ok: false as const };
}

/** DEMO: a sample day of customers and money, so Today and Money can be tried before real bookings. */
export async function sampleDayAction() {
  const user = await getOwnerUser();
  if (!user) return { ok: false as const };
  const b = await getBusiness(user);
  if (!b) return { ok: false as const };
  const now = new Date();
  await seedDemoDay(user, now);
  await seedLedger(user, now, b.services.map((s) => s.name));
  return done();
}
