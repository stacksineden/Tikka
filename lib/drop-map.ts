// A drop as the builder and dashboards use it (DropDraft, Drop) ⇄ its rows in the database
// (drops, rewards). The columns are what claiming, pricing and the guarantee read; the builder's
// own copy rides along in drops.builder so a draft reopens exactly as it was left. Pure, so the
// mapping is pinned by tests.

import { bounceBackLabel, LIMITS, rewardLabel, watToIso, type DraftReward, type DropDraft } from "./drop";
import type { Drop, DropStatus, RewardType, Tier } from "./types";

type DbTier = "legendary" | "rare" | "common";
type DbKind = "percent_off" | "amount_off" | "free_item" | "perk" | "action";

export interface RewardRow {
  tier: DbTier;
  kind: DbKind;
  value: number | string | null;
  title: string;
  action_text: string | null;
  terms: string | null;
  quantity: number;
  min_spend_kobo: number | null;
  requires_purchase: boolean;
  cost_kobo?: number | null;
}

export interface DropRow {
  id: string;
  slug: string;
  title: string;
  goal: NonNullable<Drop["goal"]>;
  template_id: string | null;
  total_cards: number;
  finish: Drop["finish"];
  starts_at: string;
  ends_at: string;
  validity_days: number;
  valid_weekdays: number[] | null;
  bounce_back: { title: string; validity_days?: number } | null;
  ignored_warnings: string[];
  status: "draft" | "published" | "ended_early" | "hidden";
  published_at: string | null;
  show_in_marketplace: boolean;
  tier_id: string | null;
  tier_max_cards: number | null;
  paid_with: "voucher" | "payment" | null;
  payment_status: "free" | "pending" | "paid" | null;
  builder: DropDraft | null;
  rewards: RewardRow[];
}

/** What claiming has done to a drop so far. */
export interface DropCounts {
  claimed: number;
  redeemed: number;
  /** Naira, from the bills logged at the counter. */
  revenue: number;
}

const TIER_TO: Record<Tier, DbTier> = { legendary: "legendary", rare: "rare", thank_you: "common" };
const TIER_FROM: Record<DbTier, Tier> = { legendary: "legendary", rare: "rare", common: "thank_you" };
const KIND_TO: Record<RewardType, DbKind> = { percent_off: "percent_off", naira_off: "amount_off", free_item: "free_item", perk: "perk", action: "action" };
const KIND_FROM: Record<DbKind, RewardType> = { percent_off: "percent_off", amount_off: "naira_off", free_item: "free_item", perk: "perk", action: "action" };
const TIER_FALLBACK: Record<Tier, string> = { legendary: "Legendary reward", rare: "Rare reward", thank_you: "Thank-you reward" };

const DAY = 86_400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validDate = (iso: string) => !Number.isNaN(Date.parse(iso));

export function rewardTo(r: DraftReward): RewardRow {
  const kind = KIND_TO[r.type];
  return {
    tier: TIER_TO[r.tier],
    kind,
    // Percent as a number; naira off in kobo, like every amount in the database.
    value: r.value === null ? null : kind === "amount_off" ? Math.round(r.value * 100) : r.value,
    title: (rewardLabel(r).trim() || TIER_FALLBACK[r.tier]).slice(0, 80),
    action_text: kind === "action" ? r.action.trim() || "Show this at the counter" : null,
    terms: r.terms.trim().slice(0, LIMITS.terms) || null,
    quantity: Math.max(0, Math.round(r.count)),
    min_spend_kobo: r.minSpend ? Math.round(r.minSpend * 100) : null,
    requires_purchase: r.requiresPurchase,
  };
}

/**
 * The jsonb save_drop_draft() takes. A draft can be half-finished, so values the database won't
 * hold (a total under 10, an end before the start) are kept in range in the columns; the builder's
 * own copy keeps exactly what was typed, and publishing checks it properly.
 */
export function draftTo(d: DropDraft, now: Date, slug: string) {
  const starts = d.startMode === "now" || !validDate(watToIso(d.startsAt)) ? now.toISOString() : watToIso(d.startsAt);
  const startMs = Date.parse(starts);
  let ends = validDate(watToIso(d.endsAt)) ? watToIso(d.endsAt) : "";
  const endMs = Date.parse(ends);
  if (!ends || endMs <= startMs || endMs > startMs + LIMITS.maxDays * DAY) ends = new Date(startMs + Math.min(d.durationDays, LIMITS.maxDays) * DAY).toISOString();
  return {
    slug,
    title: (d.name.trim() || "Untitled drop").slice(0, LIMITS.name),
    goal: d.goal,
    template_id: d.templateId ?? null,
    total_cards: Math.min(LIMITS.maxTotal, Math.max(LIMITS.minTotal, Math.round(d.total) || LIMITS.minTotal)),
    finish: d.finish,
    eligibility: d.eligibility,
    period_days: d.eligibility === "once_per_period" ? Math.min(365, Math.max(1, d.periodDays)) : null,
    new_reserved_pct: Math.min(100, Math.max(0, Math.round(d.newReservedPct))),
    show_in_marketplace: d.showOnMarketplace,
    marketplace_cap: d.marketplaceCap && d.marketplaceCap > 0 ? d.marketplaceCap : null,
    starts_at: starts,
    ends_at: ends,
    validity_days: d.validityDays,
    valid_weekdays: d.validWeekdays?.length ? d.validWeekdays : null,
    bounce_back: d.bounceBack.on
      ? {
          title: bounceBackLabel(d.bounceBack).slice(0, 80),
          kind: KIND_TO[d.bounceBack.type],
          value: d.bounceBack.value === null ? null : d.bounceBack.type === "naira_off" ? Math.round(d.bounceBack.value * 100) : d.bounceBack.value,
          min_spend_kobo: d.bounceBack.minSpend ? Math.round(d.bounceBack.minSpend * 100) : null,
          validity_days: d.bounceBack.validityDays,
        }
      : null,
    audience_band: d.audienceBand,
    ignored_warnings: d.ignoredWarnings,
    copied_from: d.copiedFrom && UUID.test(d.copiedFrom) ? d.copiedFrom : null,
    rewards: d.rewards.map(rewardTo),
    builder: d,
  };
}

/** Status for the lists: the dates and the deck decide it, the same way the claim function does. */
export function statusOf(row: Pick<DropRow, "status" | "starts_at" | "ends_at" | "total_cards">, claimed: number, now: Date): DropStatus {
  if (row.status === "draft") return "draft";
  if (row.status === "ended_early" || Date.parse(row.ends_at) <= now.getTime()) return "ended";
  if (Date.parse(row.starts_at) > now.getTime()) return "scheduled";
  return claimed >= row.total_cards ? "sold_out" : "live";
}

export function dropFrom(row: DropRow, counts: DropCounts, now: Date, pendingPaymentId?: string): Drop {
  return {
    id: row.id,
    slug: row.slug,
    name: row.title,
    status: statusOf(row, counts.claimed, now),
    total: row.total_cards,
    claimed: counts.claimed,
    redeemed: counts.redeemed,
    revenue: counts.revenue,
    startsAt: new Date(row.starts_at).toISOString(),
    endsAt: new Date(row.ends_at).toISOString(),
    finish: row.finish,
    rewards: row.rewards
      .filter((r) => r.quantity > 0)
      .map((r) => ({ tier: TIER_FROM[r.tier], type: KIND_FROM[r.kind], label: r.title, action: r.action_text ?? undefined, count: r.quantity })),
    notifyWaiting: 0,
    showOnMarketplace: row.show_in_marketplace,
    goal: row.goal,
    templateId: row.template_id ?? undefined,
    validityDays: row.validity_days,
    validWeekdays: row.valid_weekdays,
    bounceBack: row.bounce_back ? { reward: row.bounce_back.title, validityDays: row.bounce_back.validity_days ?? 30 } : null,
    ignoredWarnings: row.ignored_warnings,
    publishedAt: row.published_at ?? undefined,
    tierId: row.tier_id ?? undefined,
    tierMaxCards: row.tier_max_cards ?? undefined,
    paymentStatus: row.payment_status ?? undefined,
    paidWith: row.paid_with ?? undefined,
    pendingPaymentId: row.payment_status === "pending" ? pendingPaymentId : undefined,
  };
}

/** The builder's copy, under the database's id (older rows without one get a plain draft back). */
export function draftFrom(row: DropRow, fallback: () => DropDraft): DropDraft {
  return { ...(row.builder ?? fallback()), id: row.id };
}

/** "glow-week", then "glow-week-2"… among this business's drop addresses. */
export function dropSlug(name: string, taken: Set<string>): string {
  const base =
    name
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 34)
      .replace(/-$/, "") || "drop";
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  return slug;
}
