// NEW DIRECTION: the client book (docs/NEW_DIRECTION.md section 12, "Customers"). One customer per
// person, matched by WhatsApp number; bookings, sales at the counter and Tikkas all join to the same
// person. A walk-in saved without a number is its own customer until the owner matches them.
// Pure, so the list, the customer's page and the tests agree. Amounts are kobo.

import type { Booking } from "./bookings";
import type { PayMethod, Sale } from "./ledger";
import { owedOf, paidOf } from "./ledger";

export interface ClientVisit {
  at: string;
  kind: "booking" | "sale" | "tikka";
  title: string;
  detail?: string;
  /** Money in from this visit: the deposit plus what was paid at the counter. */
  paidKobo: number;
  owedKobo: number;
  status: "came" | "booked" | "no_show" | "cancelled" | "claimed" | "used" | "paid";
  methods: PayMethod[];
}

export interface ClientNote {
  notes?: string;
  /** "MM-DD" */
  birthday?: string;
}

export interface Client {
  key: string;
  name: string;
  phone?: string;
  visits: number;
  spentKobo: number;
  owedKobo: number;
  noShows: number;
  lastVisit?: string;
  next?: { at: string; service: string };
  sources: ("booking" | "walk_in" | "drop")[];
  history: ClientVisit[];
  note: ClientNote;
}

export interface TikkaClaim {
  name: string;
  phone: string;
  reward: string;
  claimedAt: string;
  redeemedAt?: string;
  spentKobo?: number;
}

/** "+2348031234567" for any way a Nigerian number is written; null when it isn't one. */
export function phoneKey(phone: string | undefined): string | null {
  let d = (phone ?? "").replace(/\D/g, "");
  if (d.startsWith("234")) d = d.slice(3);
  if (d.startsWith("0")) d = d.slice(1);
  return d.length === 10 ? `+234${d}` : null;
}

/** The key of a customer saved without a number: their name, lower-cased. */
export const nameKey = (name: string) => `name:${name.trim().toLowerCase().replace(/\s+/g, " ")}`;

export function buildClients(input: { bookings: Booking[]; sales: Sale[]; claims: TikkaClaim[]; notes: Record<string, ClientNote>; now: Date }): Client[] {
  const map = new Map<string, Client>();
  const get = (phone: string | undefined, name: string) => {
    const key = phoneKey(phone) ?? nameKey(name);
    let c = map.get(key);
    if (!c) {
      c = { key, name: name.trim() || "Customer", phone: phoneKey(phone) ?? undefined, visits: 0, spentKobo: 0, owedKobo: 0, noShows: 0, sources: [], history: [], note: input.notes[key] ?? {} };
      map.set(key, c);
    }
    // The longest name we've seen ("Ada Nwosu" over "Ada").
    if (name.trim().length > c.name.length) c.name = name.trim();
    return c;
  };
  const add = (c: Client, s: Client["sources"][number]) => {
    if (!c.sources.includes(s)) c.sources.push(s);
  };

  const salesByBooking = new Map(input.sales.filter((s) => s.bookingId).map((s) => [s.bookingId!, s]));
  const now = input.now.getTime();

  for (const b of input.bookings) {
    const c = get(b.phone, b.firstName);
    add(c, "booking");
    const sale = salesByBooking.get(b.id);
    const deposit = b.depositPaidKobo ?? 0;
    const paid = deposit + (sale ? paidOf(sale) : 0);
    const owed = sale ? owedOf(sale) : 0;
    const past = new Date(b.startsAt).getTime() < now;
    const came = b.status === "arrived" || !!sale;
    const status: ClientVisit["status"] = b.status === "cancelled" ? "cancelled" : b.status === "no_show" ? "no_show" : came ? "came" : "booked";
    c.history.push({ at: b.startsAt, kind: "booking", title: b.service, detail: b.detail, paidKobo: paid, owedKobo: owed, status, methods: sale ? [...new Set(sale.payments.map((p) => p.method))] : [] });
    c.spentKobo += paid;
    c.owedKobo += owed;
    if (status === "no_show") c.noShows++;
    if (came && past) c.visits++;
    if (status === "booked" && !past && (!c.next || b.startsAt < c.next.at)) c.next = { at: b.startsAt, service: b.service };
  }

  for (const s of input.sales) {
    if (s.bookingId) continue; // counted with its booking
    const c = get(s.phone, s.name);
    add(c, "walk_in");
    const paid = paidOf(s);
    const owed = owedOf(s);
    c.history.push({ at: s.at, kind: "sale", title: s.item, paidKobo: paid, owedKobo: owed, status: "paid", methods: [...new Set(s.payments.map((p) => p.method))] });
    c.spentKobo += paid;
    c.owedKobo += owed;
    c.visits++;
  }

  for (const t of input.claims) {
    const c = get(t.phone, t.name);
    add(c, "drop");
    c.history.push({ at: t.claimedAt, kind: "tikka", title: `Tikka: ${t.reward}`, paidKobo: t.spentKobo ?? 0, owedKobo: 0, status: t.redeemedAt ? "used" : "claimed", methods: [] });
    if (t.redeemedAt) {
      c.visits++;
      c.spentKobo += t.spentKobo ?? 0;
    }
  }

  for (const c of map.values()) {
    c.history.sort((a, b) => b.at.localeCompare(a.at));
    c.lastVisit = c.history.find((h) => (h.status === "came" || h.status === "paid" || h.status === "used") && new Date(h.at).getTime() <= now)?.at;
  }
  return [...map.values()];
}

export type ClientSort = "recent" | "visits" | "spent" | "away" | "owes";

export function sortClients(list: Client[], sort: ClientSort): Client[] {
  const by = [...list];
  const last = (c: Client) => c.lastVisit ?? c.next?.at ?? c.history[0]?.at ?? "";
  if (sort === "visits") by.sort((a, b) => b.visits - a.visits || b.spentKobo - a.spentKobo);
  else if (sort === "spent") by.sort((a, b) => b.spentKobo - a.spentKobo);
  else if (sort === "owes") return by.filter((c) => c.owedKobo > 0).sort((a, b) => b.owedKobo - a.owedKobo);
  else if (sort === "away") return by.filter((c) => c.lastVisit && !c.next).sort((a, b) => (a.lastVisit ?? "").localeCompare(b.lastVisit ?? ""));
  else by.sort((a, b) => last(b).localeCompare(last(a)));
  return by;
}

/** Customers with a number whose first name matches a walk-in saved without one ("Is this Ada Nwosu?"). */
export function possibleMatches(walkIn: Client, all: Client[]): Client[] {
  if (walkIn.phone) return [];
  const first = walkIn.name.split(" ")[0].toLowerCase();
  return all.filter((c) => c.phone && c.name.split(" ")[0].toLowerCase() === first);
}

/** "2 weeks ago", "today", "in 3 days". */
export function relativeDay(iso: string, now: Date): string {
  const day = (d: Date) => Math.floor((d.getTime() + 3_600_000) / 86_400_000);
  const diff = day(new Date(iso)) - day(now);
  if (diff === 0) return "today";
  if (diff === -1) return "yesterday";
  if (diff === 1) return "tomorrow";
  const n = Math.abs(diff);
  const unit = n < 14 ? `${n} days` : n < 60 ? `${Math.round(n / 7)} weeks` : `${Math.round(n / 30)} months`;
  return diff < 0 ? `${unit} ago` : `in ${unit}`;
}
