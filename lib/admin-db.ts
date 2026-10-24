import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import type { DropPack, DropTier } from "./pricing";
import { adminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";

// Tikka admin for real accounts. Every function in the database checks is_admin() and refuses
// anyone else; nothing here returns a claimer's phone number.

export interface AdminOverview {
  businesses: number;
  liveDrops: number;
  claimsToday: number;
  redemptionsToday: number;
  waSent30d: number;
  waCost30dUsd: number;
  revenue: { total: number; drop: number; upgrade: number; pack: number };
  guaranteeVouchers: { businessName: string; tierId: string; createdAt: string }[];
}

export interface AdminBusiness {
  id: string;
  name: string;
  slug: string;
  area: string;
  city: string;
  category: string;
  verified: boolean;
  suspended: boolean;
  isDemo: boolean;
  foundingMember: boolean;
  guaranteeUsed: boolean;
  dropsReady: number;
  paidKobo: number;
  drops: number;
}

export interface AdminPayment {
  id: string;
  kind: "drop" | "upgrade" | "pack";
  amountKobo: number;
  status: string;
  reference: string;
  toTier?: string;
  createdAt: string;
  businessName: string;
}

export interface AdminReport {
  targetType: "drop" | "review";
  targetId: string;
  businessName: string;
  businessSlug: string;
  title?: string;
  dropSlug?: string;
  rating?: number;
  body?: string;
  displayName?: string;
  reasons: string[];
  reports: number;
}

export interface AdminDrop {
  id: string;
  title: string;
  slug: string;
  businessName: string;
  businessSlug: string;
  status: "live" | "scheduled";
  startsAt: string;
  endsAt: string;
  shown: boolean;
  pin?: { headline: string; blurb: string };
}

async function call<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const sb = await createClient();
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(`Admin only (${fn})`);
  return data as T;
}

export async function dbAdminOverview(): Promise<AdminOverview> {
  const o = await call<Record<string, unknown> & { revenue: AdminOverview["revenue"]; guarantee_vouchers: { business_name: string; tier_id: string; created_at: string }[] }>("admin_overview");
  return {
    businesses: Number(o.businesses),
    liveDrops: Number(o.live_drops),
    claimsToday: Number(o.claims_today),
    redemptionsToday: Number(o.redemptions_today),
    waSent30d: Number(o.wa_sent_30d),
    waCost30dUsd: Number(o.wa_cost_30d_usd),
    revenue: o.revenue,
    guaranteeVouchers: o.guarantee_vouchers.map((v) => ({ businessName: v.business_name, tierId: v.tier_id, createdAt: v.created_at })),
  };
}

export async function dbAdminBusinesses(query?: string): Promise<AdminBusiness[]> {
  const rows = await call<Record<string, unknown>[]>("admin_businesses", { p_query: query ?? null });
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    slug: String(r.slug),
    area: String(r.area ?? ""),
    city: String(r.city ?? ""),
    category: String(r.category ?? ""),
    verified: !!r.verified,
    suspended: !!r.suspended,
    isDemo: !!r.is_demo,
    foundingMember: !!r.founding_member,
    guaranteeUsed: !!r.guarantee_used,
    dropsReady: Number(r.drops_ready),
    paidKobo: Number(r.paid_kobo),
    drops: Number(r.drops),
  }));
}

export async function dbAdminSetBusiness(id: string, patch: { verified?: boolean; suspended?: boolean; foundingMember?: boolean }): Promise<void> {
  await call("admin_set_business", { p_business: id, p_verified: patch.verified ?? null, p_suspended: patch.suspended ?? null, p_founding: patch.foundingMember ?? null });
}

export async function dbAdminGrantDrop(businessId: string, tierId: string, expiresAt?: string): Promise<void> {
  await call("grant_drop", { p_business: businessId, p_tier: tierId, p_expires_at: expiresAt ?? null });
}

export async function dbAdminPayments(): Promise<AdminPayment[]> {
  const rows = await call<Record<string, unknown>[]>("admin_payments", { p_limit: 100 });
  return rows.map((r) => ({
    id: String(r.id),
    kind: r.kind as AdminPayment["kind"],
    amountKobo: Number(r.amount_kobo),
    status: String(r.status),
    reference: String(r.reference),
    toTier: r.to_tier ? String(r.to_tier) : undefined,
    createdAt: String(r.created_at),
    businessName: String(r.business_name),
  }));
}

export async function dbAdminReports(): Promise<AdminReport[]> {
  const rows = await call<Record<string, unknown>[]>("admin_reports");
  return rows.map((r) => ({
    targetType: r.target_type as AdminReport["targetType"],
    targetId: String(r.target_id),
    businessName: String(r.business_name),
    businessSlug: String(r.business_slug),
    title: r.title ? String(r.title) : undefined,
    dropSlug: r.drop_slug ? String(r.drop_slug) : undefined,
    rating: r.rating == null ? undefined : Number(r.rating),
    body: r.body ? String(r.body) : undefined,
    displayName: r.display_name ? String(r.display_name) : undefined,
    reasons: (r.reasons as string[]) ?? [],
    reports: Number(r.reports),
  }));
}

export async function dbAdminDecide(targetType: "drop" | "review", id: string, hide: boolean): Promise<void> {
  if (targetType === "drop") await call("decide_drop_report", { p_drop: id, p_hide: hide });
  else await call("decide_review_report", { p_review: id, p_hide: hide });
}

export async function dbAdminDrops(): Promise<AdminDrop[]> {
  const rows = await call<Record<string, unknown>[]>("admin_drops");
  return rows.map((r) => ({
    id: String(r.id),
    title: String(r.title),
    slug: String(r.slug),
    businessName: String(r.business_name),
    businessSlug: String(r.business_slug),
    status: r.status as AdminDrop["status"],
    startsAt: String(r.starts_at),
    endsAt: String(r.ends_at),
    shown: !!r.shown,
    pin: r.pin_headline ? { headline: String(r.pin_headline), blurb: String(r.pin_blurb ?? "") } : undefined,
  }));
}

export async function dbAdminSetDropShown(id: string, shown: boolean): Promise<void> {
  await call("admin_set_drop_shown", { p_drop: id, p_shown: shown });
}

export async function dbAdminPinDrop(id: string, headline: string, blurb: string): Promise<void> {
  await call("admin_pin_drop", { p_drop: id, p_headline: headline, p_blurb: blurb });
}

export async function dbAdminSaveTier(id: string, t: { priceKobo: number; foundingPriceKobo: number; guaranteeMinRedemptions: number | null }): Promise<void> {
  await call("admin_save_tier", { p_tier: id, p_price_kobo: t.priceKobo, p_founding_kobo: t.foundingPriceKobo, p_guarantee_min: t.guaranteeMinRedemptions });
}

export async function dbAdminSavePack(id: string, priceKobo: number, active: boolean): Promise<void> {
  await call("admin_save_pack", { p_pack: id, p_price_kobo: priceKobo, p_active: active });
}

/** Prices change only when an admin saves them (which clears this tag), so pages can be prerendered. */
export const PRICES_TAG = "prices";

/** Prices as the database has them: public data, read without the visitor's cookies, and cached. */
export async function dbTiers(): Promise<DropTier[] | null> {
  "use cache";
  cacheTag(PRICES_TAG);
  cacheLife("hours");
  const sb = adminClient();
  const { data, error } = await sb.from("drop_tiers").select("id, label, max_cards, price_kobo, founding_price_kobo, guarantee_min_redemptions, sort").order("sort");
  if (error || !data?.length) return null;
  return data.map((t) => ({
    id: t.id,
    label: t.label,
    maxCards: t.max_cards,
    priceKobo: t.price_kobo,
    foundingPriceKobo: t.founding_price_kobo,
    guaranteeMinRedemptions: t.guarantee_min_redemptions,
    sort: t.sort,
  }));
}

/** Every pack, on sale or not (callers filter). Cached like the tiers. */
export async function dbPacks(): Promise<DropPack[] | null> {
  "use cache";
  cacheTag(PRICES_TAG);
  cacheLife("hours");
  const sb = adminClient();
  const { data, error } = await sb.from("drop_packs").select("id, tier_id, drops, price_kobo, active").order("price_kobo");
  if (error || !data?.length) return null;
  return data.map((p) => ({ id: p.id, tierId: p.tier_id, drops: p.drops, priceKobo: p.price_kobo, active: p.active }));
}

/** The featured carousel. */
export async function dbPins(): Promise<{ dropId: string; headline: string; blurb: string }[]> {
  const sb = adminClient();
  const { data } = await sb.from("marketplace_pins").select("drop_id, headline, blurb").order("created_at", { ascending: false });
  return (data ?? []).map((p) => ({ dropId: p.drop_id, headline: p.headline, blurb: p.blurb }));
}
