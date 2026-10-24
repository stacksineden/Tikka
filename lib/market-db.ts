import "server-only";

import { fromStored } from "./media-path";
import { initialsFrom } from "./setup";
import { adminClient } from "./supabase/admin";
import type { MarketDrop } from "./types";

// The marketplace and Notify me for businesses in Supabase. marketplace_drops() is public and
// carries counts only; Notify me codes and drop reports go through server-only functions.

interface MarketRow {
  id: string;
  drop_slug: string;
  drop_name: string;
  business_name: string;
  business_slug: string;
  brand_color: string;
  on_brand_color: string;
  category: string;
  area: string;
  city: string;
  state: string;
  rating_avg: number | string | null;
  logo_path: string | null;
  total: number;
  status: "live" | "scheduled";
  starts_at: string;
  ends_at: string;
  published_at: string;
  left_count: number;
  legendary: number;
  rare: number;
  thank_you: number;
  legendary_left: number;
  claimed: number;
  claims_last_hour: number;
  claims_24h: number;
  waiting: number;
}

export async function dbMarketplaceDrops(): Promise<MarketDrop[]> {
  const { data } = await adminClient().rpc("marketplace_drops");
  return ((data ?? []) as MarketRow[]).map((r) => ({
    id: r.id,
    dropSlug: r.drop_slug,
    dropName: r.drop_name,
    businessName: r.business_name,
    businessSlug: r.business_slug,
    initials: initialsFrom(r.business_name),
    brandColor: r.brand_color,
    onBrandColor: r.on_brand_color,
    category: r.category,
    area: r.area,
    city: r.city,
    state: r.state,
    total: r.total,
    left: r.left_count,
    legendary: r.legendary,
    rare: r.rare,
    legendaryLeft: r.legendary_left,
    status: r.status,
    startsAt: new Date(r.starts_at).toISOString(),
    endsAt: new Date(r.ends_at).toISOString(),
    publishedAt: new Date(r.published_at).toISOString(),
    claimsLastHour: r.claims_last_hour,
    claims24h: r.claims_24h,
    claimed: r.claimed,
    thankYou: r.thank_you,
    waiting: r.waiting,
    rating: r.rating_avg === null ? undefined : Number(r.rating_avg),
    logoUrl: fromStored(r.logo_path),
  }));
}

/** The Notify me button's NT-XXXXX code (the same one if they tap twice); null if it can't take one. */
export async function dbNotifyIntent(businessId: string, dropId: string | null, visitorId: string): Promise<string | null> {
  const { data } = await adminClient().rpc("create_notify_intent", { p_business: businessId, p_drop: dropId, p_visitor_id: visitorId });
  return typeof data === "string" ? data : null;
}

/** "Report this drop", once per visitor. */
export async function dbReportDrop(dropId: string, reason: string, visitorHash: string): Promise<boolean> {
  const { data } = await adminClient().rpc("report_drop", { p_drop: dropId, p_reason: reason, p_visitor_hash: visitorHash });
  return data === true;
}
