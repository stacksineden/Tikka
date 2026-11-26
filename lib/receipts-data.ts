import "server-only";

// Receipts. One per sale, made the first time the owner sends it (or when a pay link is paid); its
// link stays the same and always shows the sale as it is now. Real accounts: Supabase
// (receipt_for(), receipt_page(), docs/DB_MOVE.md step 4). The demo: in memory.

import { randomBytes } from "node:crypto";
import { getBookings } from "./bookings-data";
import { getBusiness, getBusinessBySlug, isDbId, memberBusinessId } from "./data";
import { dbGetLedger, dbReceiptFor, dbReceiptPage } from "./ledger-db";
import { getLedger } from "./ledger-data";
import { buildReceipt, type ReceiptView } from "./receipts";
import type { Business, SessionUser } from "./types";

interface StoredReceipt {
  token: string;
  owner: string;
  saleId: string;
  n: number;
  createdAt: string;
}

const store: Map<string, StoredReceipt> = ((globalThis as { __tikkaReceipts?: Map<string, StoredReceipt> }).__tikkaReceipts ??= new Map());
export const RECEIPT_TOKEN_PREFIX = "rc-";

const ownerKey = (user: Pick<SessionUser, "id" | "role">) => (user.role === "owner" && !isDbId(user.id) ? user.id : null);

async function realBusiness(user: Pick<SessionUser, "id" | "role">): Promise<string | null> {
  if (user.role !== "owner" || !isDbId(user.id)) return null;
  const id = await memberBusinessId({ ...user, businessOwnerId: undefined });
  return id && isDbId(id) ? id : null;
}

/** The receipt for a sale: the same one every time. Null for real accounts or a sale that isn't there. */
export async function receiptFor(user: Pick<SessionUser, "id" | "role">, saleId: string, now = new Date()): Promise<string | null> {
  const biz = await realBusiness(user);
  if (biz) return isDbId(saleId) ? dbReceiptFor(biz, saleId) : null;
  const key = ownerKey(user);
  if (!key) return null;
  const have = [...store.values()].find((r) => r.owner === key && r.saleId === saleId);
  if (have) return have.token;
  const ledger = await getLedger(user);
  if (!ledger.sales.some((s) => s.id === saleId)) return null;
  const n = [...store.values()].filter((r) => r.owner === key).length + 1;
  const token = RECEIPT_TOKEN_PREFIX + randomBytes(9).toString("base64url");
  store.set(token, { token, owner: key, saleId, n, createdAt: now.toISOString() });
  return token;
}

/** Sales that already have a receipt (so a customer's page can show "Receipt"), by sale id → token. */
export async function receiptTokens(user: Pick<SessionUser, "id" | "role">): Promise<Record<string, string>> {
  const biz = await realBusiness(user);
  if (biz) return (await dbGetLedger(biz)).receipts;
  const key = ownerKey(user);
  if (!key) return {};
  return Object.fromEntries([...store.values()].filter((r) => r.owner === key).map((r) => [r.saleId, r.token]));
}

/** What the receipt page shows, worked out from the sale now. Never the customer's number. */
export async function receiptPage(token: string): Promise<{ receipt: ReceiptView; business: Business } | null> {
  const r = store.get(token);
  if (!r) {
    // A real receipt: never the customer's number or address.
    const found = await dbReceiptPage(token);
    const biz = found ? await getBusinessBySlug(found.businessSlug) : null;
    return found && biz ? { receipt: buildReceipt(found.sale, found.booking, found.n), business: biz.business } : null;
  }
  const owner = { id: r.owner, role: "owner" as const };
  const [ledger, business] = await Promise.all([getLedger(owner), getBusiness(owner)]);
  const sale = ledger.sales.find((s) => s.id === r.saleId);
  if (!sale || !business) return null;
  let booking = null;
  if (sale.bookingId) {
    const at = new Date(sale.at).getTime();
    const list = await getBookings({ ...owner, businessOwnerId: undefined }, new Date(at - 400 * 86_400_000), new Date(at + 400 * 86_400_000));
    booking = list.find((b) => b.id === sale.bookingId) ?? null;
  }
  return { receipt: buildReceipt(sale, booking, r.n), business };
}
