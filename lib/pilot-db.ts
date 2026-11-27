import "server-only";

import { ownedBusinessId } from "./business-db";
import { adminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";

// The pilot's tools (supabase/migrations/20261224150000_active_and_referrals.sql): who counts as an
// active business, Tikka admin's "link in bio" tick, and invites that earn a free month of Plus.

export interface ActiveRow {
  id: string;
  name: string;
  slug: string;
  city: string;
  createdAt: string;
  active: boolean;
  /** 3+ photos and a priced service. */
  page: boolean;
  bookings: boolean;
  /** Tikka admin ticked: their Tikka link is in their bio. */
  bio: boolean;
  /** A real customer booking in the last 14 days. */
  booked: boolean;
  lastBooking?: string;
}

/** admin_active_businesses(): every real business with its four checks, active first. */
export async function dbAdminActive(): Promise<ActiveRow[]> {
  const sb = await createClient();
  const { data, error } = await sb.rpc("admin_active_businesses");
  if (error || !Array.isArray(data)) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    slug: String(r.slug),
    city: String(r.city ?? ""),
    createdAt: String(r.created_at),
    active: r.active === true,
    page: r.page === true,
    bookings: r.bookings === true,
    bio: r.bio === true,
    booked: r.booked === true,
    lastBooking: (r.last_booking as string | null) ?? undefined,
  }));
}

export async function dbSetBioLink(businessId: string, on: boolean): Promise<boolean> {
  const sb = await createClient();
  const { error } = await sb.rpc("admin_set_bio_link", { p_business: businessId, p_on: on });
  return !error;
}

async function mine() {
  const sb = await createClient();
  const { data } = await sb.auth.getClaims();
  const uid = data?.claims?.sub;
  return { sb, businessId: uid ? await ownedBusinessId(sb, uid) : null };
}

/** my_referral(): the owner's invite code, how many signed up through it, and how many earned a month. */
export async function dbMyReferral(): Promise<{ code: string; joined: number; rewarded: number } | null> {
  const { sb, businessId } = await mine();
  if (!businessId) return null;
  const { data, error } = await sb.rpc("my_referral", { p_business: businessId });
  if (error || !data) return null;
  const r = data as { code: string; joined: number; rewarded: number };
  return { code: r.code, joined: Number(r.joined), rewarded: Number(r.rewarded) };
}

/** record_referral(): a new business that came through an invite (does nothing for a bad code). */
export async function dbRecordReferral(businessId: string, code: string): Promise<boolean> {
  const sb = await createClient();
  const { data, error } = await sb.rpc("record_referral", { p_business: businessId, p_code: code });
  return !error && data === true;
}

/** reward_referrals(): the daily job. Server only. */
export async function dbRewardReferrals(): Promise<number> {
  const { data, error } = await adminClient().rpc("reward_referrals");
  return error ? -1 : Number(data ?? 0);
}

/** The cookie that carries an invite code from /join/<code> to the new business. */
export const REF_COOKIE = "tikka_ref";
