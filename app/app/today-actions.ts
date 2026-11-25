"use server";

// NEW DIRECTION, stage 2: Today and Money (docs/OWNER_JOURNEYS.md journeys 4–6). Demo store only.

import { revalidatePath } from "next/cache";
import { markBooking, seedDemoDay } from "@/lib/bookings-data";
import { getBusiness } from "@/lib/data";
import { addExpense, payBalance, recordSale, seedLedger } from "@/lib/ledger-data";
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
  if (input.bookingId) await markBooking(user, input.bookingId, "arrived");
  const ok = await recordSale(user, input, new Date());
  return ok ? done() : { ok: false as const };
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
