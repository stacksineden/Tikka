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
  /** The sale behind it, when there is one (so a pay link can settle its balance). */
  saleId?: string;
  /** The Tikka behind it (so a pay link can be connected to it). */
  claimId?: string;
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
  id?: string;
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
    c.history.push({ at: b.startsAt, kind: "booking", title: b.service, detail: b.detail, paidKobo: paid, owedKobo: owed, status, methods: sale ? [...new Set(sale.payments.map((p) => p.method))] : [], saleId: sale?.id });
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
    c.history.push({ at: s.at, kind: "sale", title: s.item, paidKobo: paid, owedKobo: owed, status: "paid", methods: [...new Set(s.payments.map((p) => p.method))], saleId: s.id });
    c.spentKobo += paid;
    c.owedKobo += owed;
    c.visits++;
  }

  for (const t of input.claims) {
    const c = get(t.phone, t.name);
    add(c, "drop");
    c.history.push({ at: t.claimedAt, kind: "tikka", title: `Tikka: ${t.reward}`, paidKobo: t.spentKobo ?? 0, owedKobo: 0, status: t.redeemedAt ? "used" : "claimed", methods: [], claimId: t.id });
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

/** What a pay link to this customer can be for (as Leads had for a Tikka, plus what they owe). */
export type PayReason =
  | { kind: "balance"; saleId: string; title: string; at: string; kobo: number }
  | { kind: "tikka"; claimId?: string; reward: string; at: string }
  | { kind: "other" };

/** Balances first (newest first), then Tikkas they haven't used, then anything else. */
export function payLinkReasons(c: Client): PayReason[] {
  const out: PayReason[] = [];
  for (const h of c.history) if (h.owedKobo > 0 && h.saleId) out.push({ kind: "balance", saleId: h.saleId, title: h.title, at: h.at, kobo: h.owedKobo });
  for (const h of c.history) if (h.kind === "tikka" && h.status === "claimed") out.push({ kind: "tikka", claimId: h.claimId, reward: h.title.replace(/^Tikka: /, ""), at: h.at });
  out.push({ kind: "other" });
  return out;
}

/** What the pay link says it's for, filled in from the reason. */
export function payReasonNote(r: PayReason): string {
  if (r.kind === "balance") return `Balance for ${r.title}`.slice(0, 80);
  if (r.kind === "tikka") return `${r.reward} (your Tikka)`.slice(0, 80);
  return "";
}

/** "+2348031110017" → "0803 111 0017", how owners write numbers. */
export function formatPhone(e164: string | undefined): string {
  const k = phoneKey(e164);
  if (!k) return e164 ?? "";
  const d = "0" + k.slice(4);
  return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
}

/** "…0017": the last 4 digits, to tell two customers with the same name apart. */
export const phoneTail = (e164: string | undefined) => (e164 ? `…${e164.replace(/\D/g, "").slice(-4)}` : "");

/** First names that more than one customer has ("chioma"), lower-cased. */
export function repeatedNames(list: { name: string }[]): Set<string> {
  const seen = new Map<string, number>();
  for (const c of list) {
    const f = c.name.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
    if (f) seen.set(f, (seen.get(f) ?? 0) + 1);
  }
  return new Set([...seen].filter(([, n]) => n > 1).map(([f]) => f));
}

/** Search by name, or by number however it's typed: "0803 111", "803111", "+234 803 111". */
export function matchesSearch(c: { name: string; phone?: string }, q: string): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  if (c.name.toLowerCase().includes(t)) return true;
  let d = t.replace(/\D/g, "");
  if (d.length < 3 || !c.phone) return false;
  if (d.startsWith("234")) d = d.slice(3);
  if (d.startsWith("0")) d = d.slice(1);
  return c.phone.replace(/\D/g, "").slice(3).includes(d);
}
