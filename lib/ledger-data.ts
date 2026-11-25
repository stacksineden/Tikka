import "server-only";

// NEW DIRECTION, stage 2: sales, balances owed and expenses. Demo store only for now (in memory,
// per account); real accounts get nothing and write nothing, so this never touches Supabase.

import { randomBytes } from "node:crypto";
import { isDbId } from "./data";
import { owedOf, type ExpenseKind, type Ledger, type PayMethod, type Sale } from "./ledger";
import type { SessionUser } from "./types";

const store: Map<string, Ledger> = ((globalThis as { __tikkaLedger?: Map<string, Ledger> }).__tikkaLedger ??= new Map());
const id = () => randomBytes(6).toString("hex");

function ownerKey(user: Pick<SessionUser, "id" | "role">): string | null {
  if (user.role !== "owner" || isDbId(user.id)) return null;
  return user.id;
}

function ledgerOf(key: string): Ledger {
  let l = store.get(key);
  if (!l) {
    l = { sales: [], expenses: [], regular: [] };
    store.set(key, l);
  }
  return l;
}

/** The owner's ledger; empty for real accounts until it has a table. */
export async function getLedger(user: Pick<SessionUser, "id" | "role">): Promise<Ledger> {
  const key = ownerKey(user);
  return key ? structuredClone(ledgerOf(key)) : { sales: [], expenses: [], regular: [] };
}

const kobo = (naira: number) => Math.max(0, Math.min(10_000_000, Math.round(naira))) * 100;

/** A sale: a walk-in, or a booked customer paying what's left. Paying less leaves the rest owed. Returns its id. */
export async function recordSale(
  user: Pick<SessionUser, "id" | "role">,
  input: { name: string; item: string; totalNaira: number; paidNaira: number; method: PayMethod; bookingId?: string; phone?: string },
  now: Date,
): Promise<string | null> {
  const key = ownerKey(user);
  if (!key) return null;
  const l = ledgerOf(key);
  const already = input.bookingId ? l.sales.find((s) => s.bookingId === input.bookingId) : undefined;
  if (already) return already.id; // already paid
  const total = kobo(input.totalNaira);
  const paid = Math.min(total, kobo(input.paidNaira));
  const sale: Sale = {
    id: id(),
    at: now.toISOString(),
    name: input.name.trim().slice(0, 40) || "Walk-in",
    item: input.item.trim().slice(0, 60) || "Sale",
    totalKobo: total,
    payments: paid ? [{ at: now.toISOString(), kobo: paid, method: input.method }] : [],
    bookingId: input.bookingId,
    phone: input.phone,
  };
  l.sales.push(sale);
  return sale.id;
}

/** What's still owed on a sale, paid now (all of it, or part). */
export async function payBalance(user: Pick<SessionUser, "id" | "role">, saleId: string, naira: number, method: PayMethod, now: Date): Promise<boolean> {
  const key = ownerKey(user);
  if (!key) return false;
  const s = ledgerOf(key).sales.find((x) => x.id === saleId);
  if (!s) return false;
  const amount = Math.min(owedOf(s), kobo(naira));
  if (amount > 0) s.payments.push({ at: now.toISOString(), kobo: amount, method });
  return true;
}

/** Something spent: once, or a regular cost counted every week or month from today. */
export async function addExpense(user: Pick<SessionUser, "id" | "role">, input: { kind: ExpenseKind; naira: number; every?: "week" | "month" }, now: Date): Promise<boolean> {
  const key = ownerKey(user);
  if (!key || !(input.naira > 0)) return false;
  const l = ledgerOf(key);
  if (input.every) l.regular.push({ id: id(), kind: input.kind, kobo: kobo(input.naira), every: input.every, from: now.toISOString() });
  else l.expenses.push({ id: id(), at: now.toISOString(), kind: input.kind, kobo: kobo(input.naira) });
  return true;
}

/** DEMO: earlier this week, so Money and "Still owed" have something to show. */
export async function seedLedger(user: Pick<SessionUser, "id" | "role">, now: Date, items: string[]): Promise<void> {
  const key = ownerKey(user);
  if (!key) return;
  const l = ledgerOf(key);
  if (l.sales.length || l.expenses.length) return;
  const daysAgo = (n: number, h = 1) => new Date(now.getTime() - n * 86_400_000 - h * 3_600_000).toISOString();
  const item = (i: number) => items[i % items.length] ?? "Sale";
  // Every customer has a WhatsApp number (pretend ones for the demo).
  const sale = (n: number, name: string, phone: string, i: number, total: number, paid: number, method: PayMethod): Sale => ({
    id: id(), at: daysAgo(n), name, phone, item: item(i), totalKobo: total * 100, payments: paid ? [{ at: daysAgo(n), kobo: paid * 100, method }] : [],
  });
  l.sales.push(
    sale(2, "Bisi", "+2348031110021", 1, 18000, 8000, "cash"),
    sale(1, "Chioma", "+2348031110017", 0, 15000, 10000, "transfer"),
    sale(1, "Yemi", "+2348031110023", 2, 12000, 12000, "cash"),
    sale(0, "Adaora", "+2348031110024", 0, 20000, 20000, "transfer"),
  );
  l.expenses.push(
    { id: id(), at: daysAgo(2, 2), kind: "Products", kobo: 3_200_000 },
    { id: id(), at: daysAgo(1, 2), kind: "Transport", kobo: 400_000 },
    { id: id(), at: daysAgo(0, 2), kind: "Data", kobo: 300_000 },
  );
  l.regular.push({ id: id(), kind: "Helper", kobo: 500_000, every: "week", from: daysAgo(3, 2) });
}

/** NEW DIRECTION: a walk-in saved by name only is the same person as a customer with a number. */
export async function matchWalkIn(user: Pick<SessionUser, "id" | "role">, name: string, phone: string): Promise<number> {
  const key = ownerKey(user);
  if (!key) return 0;
  const want = name.trim().toLowerCase().replace(/\s+/g, " ");
  let n = 0;
  for (const s of ledgerOf(key).sales) {
    if (!s.phone && !s.bookingId && s.name.trim().toLowerCase().replace(/\s+/g, " ") === want) {
      s.phone = phone;
      n++;
    }
  }
  return n;
}
