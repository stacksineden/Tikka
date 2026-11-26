// NEW DIRECTION, stage 2 (docs/OWNER_JOURNEYS.md journeys 4–6): what came in, what was spent and
// what's still owed. Pure, so Today, Money and the tests agree. Amounts are kobo.
//
// Where each number comes from (shown to the owner):
// - "auto": deposits and pay links paid online through Tikka.
// - "recorded": cash, transfers and card, when the owner taps Paid or New sale.
// - "added" / "regular": what the owner spent, once or every week or month.

import { watInstant, watParts } from "./bookings";

export type PayMethod = "cash" | "transfer" | "card" | "pay_link";
export const METHOD_LABEL: Record<PayMethod, string> = { cash: "Cash", transfer: "Transfer", card: "Card", pay_link: "Pay link" };

export interface Sale {
  id: string;
  /** When it was sold (ISO). */
  at: string;
  name: string;
  item: string;
  /** What it cost (after any deposit already paid through Tikka). */
  totalKobo: number;
  /** Payments towards it, oldest first. Less than the total means they still owe the rest. */
  payments: { at: string; kobo: number; method: PayMethod }[];
  /** The booking it settles, if any. */
  bookingId?: string;
  phone?: string;
  /** Asked for on the day ("Wash and beads"), already in the total. */
  added?: { label: string; kobo: number };
}

export const EXPENSE_KINDS = ["Products", "Rent", "Transport", "Helper", "Data", "Light / fuel", "Other"] as const;
export type ExpenseKind = (typeof EXPENSE_KINDS)[number];

export interface Expense {
  id: string;
  at: string;
  kind: ExpenseKind;
  kobo: number;
}

/** A cost the owner adds once and Tikka counts: every week (on the weekday it started) or every month (on its day). */
export interface RegularCost {
  id: string;
  kind: ExpenseKind;
  kobo: number;
  every: "week" | "month";
  /** The first time it's counted (ISO). */
  from: string;
}

export interface Ledger {
  sales: Sale[];
  expenses: Expense[];
  regular: RegularCost[];
}

export const paidOf = (s: Sale) => s.payments.reduce((n, p) => n + p.kobo, 0);
export const owedOf = (s: Sale) => Math.max(0, s.totalKobo - paidOf(s));

/** Monday 00:00 WAT of the week `now` is in. */
export function weekStart(now: Date): Date {
  const { day } = watParts(now);
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  const back = (weekday + 6) % 7;
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - back);
  return new Date(watInstant(d.toISOString().slice(0, 10), 0));
}

/** The days a regular cost falls on between two instants. */
export function regularDates(r: RegularCost, from: Date, to: Date): Date[] {
  const out: Date[] = [];
  const start = new Date(r.from);
  const first = watParts(start).day;
  const cursor = new Date(`${first}T12:00:00Z`);
  for (let i = 0; i < 400; i++) {
    const at = new Date(watInstant(cursor.toISOString().slice(0, 10), 0));
    if (at >= to) break;
    if (at >= from) out.push(at);
    if (r.every === "week") cursor.setUTCDate(cursor.getUTCDate() + 7);
    else cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return out;
}

export interface MoneyLine {
  label: string;
  kobo: number;
  source: "auto" | "recorded" | "added" | "regular";
  note?: string;
}

export interface MoneySummary {
  inKobo: number;
  spentKobo: number;
  keptKobo: number;
  came: MoneyLine[];
  spent: MoneyLine[];
  best?: { service: string; kobo: number };
  busiestDay?: string;
  topCustomer?: { name: string; kobo: number };
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * The money between two instants. `deposits` are deposits paid through Tikka (from bookings).
 * Sale payments count on the day they were paid; regular costs on each day they fall on.
 */
export function moneyBetween(ledger: Ledger, deposits: { at: string; kobo: number; name: string; item: string }[], from: Date, to: Date): MoneySummary {
  const inside = (iso: string) => {
    const t = new Date(iso).getTime();
    return t >= from.getTime() && t < to.getTime();
  };
  const byMethod: Record<PayMethod, number> = { cash: 0, transfer: 0, card: 0, pay_link: 0 };
  const perService = new Map<string, number>();
  const perCustomer = new Map<string, number>();
  const perDay = new Map<number, number>();
  const add = (m: Map<string, number> | Map<number, number>, k: string | number, v: number) => (m as Map<typeof k, number>).set(k, ((m as Map<typeof k, number>).get(k) ?? 0) + v);

  for (const s of ledger.sales) {
    for (const p of s.payments) {
      if (!inside(p.at)) continue;
      byMethod[p.method] += p.kobo;
      add(perService, s.item, p.kobo);
      add(perCustomer, s.name, p.kobo);
      add(perDay, new Date(new Date(p.at).getTime() + 3_600_000).getUTCDay(), p.kobo);
    }
  }
  let depositKobo = 0;
  for (const d of deposits) {
    if (!inside(d.at)) continue;
    depositKobo += d.kobo;
    add(perService, d.item, d.kobo);
    add(perCustomer, d.name, d.kobo);
  }

  const came: MoneyLine[] = [
    { label: "Deposits and pay links", kobo: depositKobo + byMethod.pay_link, source: "auto", note: "Paid online, straight to your bank" },
    { label: "Cash", kobo: byMethod.cash, source: "recorded", note: "When you tapped Paid or New sale" },
    { label: "Transfers and card", kobo: byMethod.transfer + byMethod.card, source: "recorded", note: "When you tapped Paid or New sale" },
  ];

  const spent: MoneyLine[] = [];
  const once = new Map<ExpenseKind, number>();
  for (const e of ledger.expenses) if (inside(e.at)) once.set(e.kind, (once.get(e.kind) ?? 0) + e.kobo);
  for (const [kind, kobo] of once) spent.push({ label: kind, kobo, source: "added" });
  for (const r of ledger.regular) {
    const n = regularDates(r, from, to).length;
    if (n) spent.push({ label: r.kind, kobo: r.kobo * n, source: "regular", note: r.every === "week" ? "Every week" : "Every month" });
  }

  const inKobo = came.reduce((n, l) => n + l.kobo, 0);
  const spentKobo = spent.reduce((n, l) => n + l.kobo, 0);
  const top = <K,>(m: Map<K, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0];
  const bestS = top(perService);
  const bestC = top(perCustomer);
  const bestD = top(perDay);
  return {
    inKobo,
    spentKobo,
    keptKobo: inKobo - spentKobo,
    came,
    spent,
    best: bestS ? { service: bestS[0], kobo: bestS[1] } : undefined,
    busiestDay: bestD ? DAY_NAMES[bestD[0]] : undefined,
    topCustomer: bestC ? { name: bestC[0], kobo: bestC[1] } : undefined,
  };
}

/** Everyone who still owes, biggest first. */
export function owedList(ledger: Ledger): { sale: Sale; owedKobo: number }[] {
  return ledger.sales
    .map((sale) => ({ sale, owedKobo: owedOf(sale) }))
    .filter((x) => x.owedKobo > 0)
    .sort((a, b) => b.owedKobo - a.owedKobo);
}

/** The reminder the owner sends from their own WhatsApp. */
export function reminderText(kind: "visit" | "balance", v: { first: string; business: string; time?: string; item?: string; dueKobo?: number; home?: string }): string {
  const amount = v.dueKobo ? "₦" + Math.round(v.dueKobo / 100).toLocaleString("en-NG") : "";
  if (kind === "balance") return `Hi ${v.first}, hope you're well. Just a reminder about the ${amount} balance from your last visit to ${v.business}. You can pay by transfer. Thank you!`;
  return `Hi ${v.first}, see you today at ${v.time} for your ${(v.item ?? "appointment").toLowerCase()} at ${v.business}${v.home ? ` (I'll come to you in ${v.home})` : ""}. ${amount ? `${amount} to pay on the day. ` : ""}See you soon!`;
}

/** wa.me link for the owner's own WhatsApp, or null for a number we can't use. */
export function waLink(phone: string | undefined, text: string): string | null {
  const d = (phone ?? "").replace(/\D/g, "");
  if (d.length < 10) return null;
  const intl = d.startsWith("234") ? d : d.startsWith("0") ? "234" + d.slice(1) : "234" + d;
  return `https://wa.me/${intl}?text=${encodeURIComponent(text)}`;
}
