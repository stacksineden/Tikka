import "server-only";

import { ownedBusinessId } from "./business-db";
import { dbPayment } from "./drop-db";
import type { Payment } from "./payments";
import { cacheLife, cacheTag } from "next/cache";
import { PRICES_TAG } from "./admin-db";
import { adminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";

// Tikka Plus for businesses in Supabase (supabase/migrations/20261224140000_tikka_plus.sql). The
// database checks the owner and prices it; this file only calls it.

type Row = Record<string, unknown>;

export interface PlusState {
  /** Plus until (ISO), or none. */
  until?: string;
  priceKobo: number;
  days: number;
  /** This month's drop hasn't been used yet. */
  dropLeft: boolean;
  /** Their open request for their own web address. */
  domain?: { domain?: string; status: "new" | "contacted"; at: string };
}

async function mine() {
  const sb = await createClient();
  const { data } = await sb.auth.getClaims();
  const uid = data?.claims?.sub;
  return { sb, businessId: uid ? await ownedBusinessId(sb, uid) : null };
}

/** plus_state(): the owner's Plus, its price, this month's drop and their web-address request. */
export async function dbPlusState(): Promise<PlusState | null> {
  const { sb, businessId } = await mine();
  if (!businessId) return null;
  const { data, error } = await sb.rpc("plus_state", { p_business: businessId });
  if (error || !data) return null;
  const r = data as Row;
  const d = r.domain as Row | null;
  return {
    until: (r.until as string | null) ?? undefined,
    priceKobo: Number(r.price_kobo ?? 0),
    days: Number(r.days ?? 30),
    dropLeft: r.drop_left === true,
    domain: d ? { domain: (d.domain as string | null) ?? undefined, status: d.status as "new" | "contacted", at: String(d.at) } : undefined,
  };
}

/** buy_plus(): a pending payment for a month, at the server's price. */
export async function dbBuyPlus(): Promise<Payment | null> {
  const { sb, businessId } = await mine();
  if (!businessId) return null;
  const { data, error } = await sb.rpc("buy_plus", { p_business: businessId });
  if (error || !data) return null;
  return dbPayment((data as { payment_id: string }).payment_id);
}

/** request_domain(): ask Tikka to set up their own web address. */
export async function dbRequestDomain(domain: string, note: string): Promise<boolean> {
  const { sb, businessId } = await mine();
  if (!businessId) return false;
  const { error } = await sb.rpc("request_domain", { p_business: businessId, p_domain: domain, p_note: note });
  return !error;
}

export interface AdminPlus {
  businesses: { id: string; name: string; slug: string; until: string; active: boolean }[];
  requests: { id: string; business: string; slug: string; domain?: string; note?: string; status: string; at: string }[];
}

/** admin_plus(): who has Plus (and who had it in the last 30 days), and the web-address requests. */
export async function dbAdminPlus(): Promise<AdminPlus> {
  const sb = await createClient();
  const { data, error } = await sb.rpc("admin_plus");
  if (error || !data) return { businesses: [], requests: [] };
  const r = data as { businesses?: AdminPlus["businesses"]; requests?: AdminPlus["requests"] };
  return { businesses: r.businesses ?? [], requests: r.requests ?? [] };
}

export async function dbAdminDomainRequest(id: string, status: "new" | "contacted" | "done" | "declined"): Promise<boolean> {
  const sb = await createClient();
  const { error } = await sb.rpc("admin_domain_request", { p_id: id, p_status: status });
  return !error;
}

/** The price a month: public, read without cookies and cached like the drop prices (admin saves clear the tag). */
export async function dbPlusPrice(): Promise<number | null> {
  "use cache";
  cacheTag(PRICES_TAG);
  cacheLife("hours");
  const { data, error } = await adminClient().from("plus_prices").select("price_kobo").eq("id", "monthly").eq("active", true).maybeSingle<{ price_kobo: number }>();
  // A failed read throws, so it isn't cached for hours; callers fall back to no Plus card.
  if (error) throw new Error("plus_prices");
  return data ? Number(data.price_kobo) : null;
}
