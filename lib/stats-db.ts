import "server-only";

import { funnel, groupViews, suggestNextSize } from "./dashboard";
import type { DropDashboard } from "./data";
import { dropReport, type DropFee, type DropReport, type ReportClaim } from "./report";
import { createClient } from "./supabase/server";
import type { ActivityEvent, Drop, RewardType, Source, Tier } from "./types";

// The drop dashboard, feed and report for drops in Supabase. The numbers come from
// get_drop_stats() and get_drop_report_data() (owners only); the feed reads link activity,
// which the business's team may see (first names only, never numbers).

const TIER: Record<string, Tier> = { legendary: "legendary", rare: "rare", common: "thank_you" };
const KIND: Record<string, RewardType> = { percent_off: "percent_off", amount_off: "naira_off", free_item: "free_item", perk: "perk", action: "action" };

interface Stats {
  unique_views: number;
  view_total: number;
  tore: number;
  tapped: number;
  continued: number;
  claimed: number;
  redeemed: number;
  followed_up: number;
  new_claimers: number;
  notify_waiting: number;
  by_source: { source: Source; views: number; claims: number }[];
  qr_by_poster: { label: string; views: number; claims: number }[];
  rewards_left: { tier: string; title: string; total: number; left: number }[];
  views_after_sellout: number;
}

export async function dbDropDashboard(drop: Drop): Promise<DropDashboard | null> {
  const sb = await createClient();
  const { data, error } = await sb.rpc("get_drop_stats", { p_drop: drop.id });
  if (error || !data) return null;
  const s = data as Stats;
  const soldOut = s.claimed >= drop.total;
  return {
    funnel: funnel({ opened: s.unique_views, tore: s.tore, tapped: s.tapped, continued: s.continued, claimed: s.claimed, redeemed: s.redeemed, followedUp: s.followed_up }),
    uniqueViews: s.unique_views,
    viewTotal: s.view_total,
    openedNotClaimed: Math.max(0, s.unique_views - s.claimed),
    newClaimers: s.new_claimers,
    returningClaimers: s.claimed - s.new_claimers,
    afterSellout: soldOut ? { viewers: s.views_after_sellout, suggest: suggestNextSize(s.views_after_sellout, s.unique_views, s.claimed) } : null,
    notifyWaiting: s.notify_waiting,
    bySource: s.by_source,
    qrByPoster: s.qr_by_poster,
    rewardsLeft: s.rewards_left.map((r) => ({ tier: TIER[r.tier] ?? "thank_you", label: r.title, total: r.total, left: r.left })),
  };
}

/** The live feed: bursts of views as one line, then claims, visits and reviews, newest first. */
export async function dbDropFeed(dropId: string, limit = 20): Promise<ActivityEvent[]> {
  const sb = await createClient();
  const [{ data: events }, { data: reviews }] = await Promise.all([
    sb.from("events").select("id, type, source, first_name, amount_kobo, tier, created_at").eq("drop_id", dropId).in("type", ["view", "claim_completed", "redeemed"]).order("created_at", { ascending: false }).limit(500),
    sb.from("reviews").select("id, display_name, rating, created_at").eq("drop_id", dropId).order("created_at", { ascending: false }).limit(limit),
  ]);
  const rows = events ?? [];
  const items: ActivityEvent[] = groupViews(rows.filter((e) => e.type === "view").map((e) => ({ at: new Date(e.created_at).toISOString(), source: (e.source ?? "direct") as Source })));
  for (const e of rows) {
    const at = new Date(e.created_at).toISOString();
    if (e.type === "claim_completed") items.push({ id: `e${e.id}`, kind: "claim", name: e.first_name ?? "Someone", tier: TIER[e.tier ?? "common"] ?? "thank_you", at });
    if (e.type === "redeemed") items.push({ id: `e${e.id}`, kind: "redeem", name: e.first_name ?? "Someone", amount: e.amount_kobo ? e.amount_kobo / 100 : undefined, at });
  }
  for (const r of reviews ?? []) items.push({ id: `rv${r.id}`, kind: "review", name: r.display_name, rating: r.rating, at: new Date(r.created_at).toISOString() });
  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

interface ReportData {
  claims: { kind: "drop" | "bounce_back"; redeemed: boolean; bill_kobo: number | null; customer_status: "new" | "returning" | null; reward_kind: string; reward_value: number | string | null; cost_kobo: number | null }[];
  fee: { kind: "paid"; amount_kobo: number } | { kind: "free" | "pack" | "earned" | "gift" };
}

export async function dbDropReport(drop: Drop): Promise<DropReport | null> {
  const sb = await createClient();
  const { data, error } = await sb.rpc("get_drop_report_data", { p_drop: drop.id });
  if (error || !data) return null;
  const r = data as ReportData;
  const claims: ReportClaim[] = r.claims.map((c) => {
    const type = KIND[c.reward_kind] ?? "perk";
    const value = c.reward_value === null ? null : Number(c.reward_value);
    return {
      kind: c.kind,
      redeemed: c.redeemed,
      billKobo: c.bill_kobo ?? undefined,
      customerStatus: c.customer_status ?? undefined,
      // The report reads naira off in naira; the database keeps kobo.
      reward: { type, value: type === "naira_off" && value !== null ? value / 100 : value, costKobo: c.cost_kobo },
    };
  });
  const fee: DropFee = r.fee.kind === "paid" ? { kind: "paid", amountKobo: r.fee.amount_kobo } : { kind: r.fee.kind };
  return dropReport({ goal: drop.goal, validWeekdays: drop.validWeekdays }, claims, fee);
}
