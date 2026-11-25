import "server-only";

// NEW DIRECTION: pay links for businesses from the new setup, on the demo store (in memory, per
// account) until those businesses live in Supabase. Same shape as the real ones (lib/paylinks-db.ts):
// an amount and what it's for, a link the owner sends from their own WhatsApp, open → paid or
// cancelled. The customer's page pretends the payment (like the demo deposit); paying it lands in the
// ledger as a pay link payment, settling the balance it was sent for. Real accounts get nothing here.

import { randomBytes } from "node:crypto";
import { isDbId } from "./data";
import { getLedger, payBalance, recordSale } from "./ledger-data";
import { owedOf } from "./ledger";
import type { SessionUser } from "./types";

export const DEMO_TOKEN_PREFIX = "demo-";
/** The most one demo pay link can be (a pilot business's maximum is set by Tikka; this stands in). */
export const DEMO_MAX_KOBO = 50_000_000;
const MIN_KOBO = 10_000;

export type DemoPayFor = { kind: "balance"; saleId: string } | { kind: "tikka"; claimId?: string } | { kind: "other" };

export interface DemoPayLink {
  id: string;
  token: string;
  owner: string;
  businessSlug: string;
  amountKobo: number;
  note: string;
  customerName?: string;
  phone?: string;
  for: DemoPayFor;
  status: "open" | "paid" | "cancelled";
  createdAt: string;
  paidAt?: string;
}

const store: Map<string, DemoPayLink> = ((globalThis as { __tikkaDemoPayLinks?: Map<string, DemoPayLink> }).__tikkaDemoPayLinks ??= new Map());

const ownerKey = (user: Pick<SessionUser, "id" | "role">) => (user.role === "owner" && !isDbId(user.id) ? user.id : null);

export const isDemoToken = (token: string) => token.startsWith(DEMO_TOKEN_PREFIX);

/** The owner's pay links, newest first. */
export async function demoPayLinks(user: Pick<SessionUser, "id" | "role">): Promise<DemoPayLink[]> {
  const key = ownerKey(user);
  if (!key) return [];
  return [...store.values()].filter((l) => l.owner === key).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((l) => ({ ...l }));
}

export type DemoCreate = { kind: "created"; token: string } | { kind: "too_small" | "too_big" | "bad_note" | "not_enabled"; maxKobo?: number };

export async function createDemoPayLink(
  user: Pick<SessionUser, "id" | "role">,
  businessSlug: string,
  input: { amountKobo: number; note: string; name?: string; phone?: string; for: DemoPayFor },
  now: Date,
): Promise<DemoCreate> {
  const key = ownerKey(user);
  if (!key) return { kind: "not_enabled" };
  const amount = Math.round(input.amountKobo);
  if (!Number.isFinite(amount) || amount < MIN_KOBO) return { kind: "too_small" };
  if (amount > DEMO_MAX_KOBO) return { kind: "too_big", maxKobo: DEMO_MAX_KOBO };
  const note = input.note.trim().slice(0, 80);
  if (note.length < 2) return { kind: "bad_note" };
  const token = DEMO_TOKEN_PREFIX + randomBytes(9).toString("base64url");
  store.set(token, {
    id: randomBytes(6).toString("hex"),
    token,
    owner: key,
    businessSlug,
    amountKobo: amount,
    note,
    customerName: input.name?.trim().split(/\s+/)[0]?.slice(0, 30) || undefined,
    phone: input.phone,
    for: input.for,
    status: "open",
    createdAt: now.toISOString(),
  });
  return { kind: "created", token };
}

export async function cancelDemoPayLink(user: Pick<SessionUser, "id" | "role">, id: string): Promise<boolean> {
  const key = ownerKey(user);
  const l = [...store.values()].find((x) => x.id === id && x.owner === key);
  if (!l || l.status !== "open") return false;
  l.status = "cancelled";
  return true;
}

/** What the customer's pay page shows (never the owner's details). */
export async function demoPayPage(token: string): Promise<{ status: DemoPayLink["status"]; amountKobo: number; note: string; customerName?: string; paidAt?: string; businessSlug: string } | null> {
  const l = store.get(token);
  return l ? { status: l.status, amountKobo: l.amountKobo, note: l.note, customerName: l.customerName, paidAt: l.paidAt, businessSlug: l.businessSlug } : null;
}

/** DEMO: the customer "pays". Once only; it lands in the owner's ledger as a pay link payment. */
export async function payDemoLink(token: string, now: Date): Promise<{ kind: "paid"; link: DemoPayLink } | { kind: "already" | "cancelled" | "not_found" }> {
  const l = store.get(token);
  if (!l) return { kind: "not_found" };
  if (l.status === "paid") return { kind: "already" };
  if (l.status === "cancelled") return { kind: "cancelled" };
  l.status = "paid";
  l.paidAt = now.toISOString();
  const owner = { id: l.owner, role: "owner" as const };
  let rest = l.amountKobo;
  if (l.for.kind === "balance") {
    const saleId = l.for.saleId;
    const sale = (await getLedger(owner)).sales.find((s) => s.id === saleId);
    const owed = sale ? owedOf(sale) : 0;
    if (owed > 0 && (await payBalance(owner, saleId, Math.min(owed, rest) / 100, "pay_link", now))) rest -= Math.min(owed, rest);
  }
  // Anything not settling a balance (a Tikka's price, a custom job, more than was owed) is its own sale.
  if (rest > 0) await recordSale(owner, { name: l.customerName ?? "Customer", item: l.note, totalNaira: rest / 100, paidNaira: rest / 100, method: "pay_link", phone: l.phone }, now);
  return { kind: "paid", link: { ...l } };
}
