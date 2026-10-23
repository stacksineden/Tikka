// Platform-wide numbers for the landing page (PRD B1). Pure: given the raw rows, works out the
// real figures (demo businesses never count) and which blocks are allowed to show. Real
// visitors never see a number that isn't real.

import type { Tier } from "./types";

export interface RecentClaim {
  id: string;
  city: string;
  tier: Tier;
  businessName: string;
  at: string;
}

export interface PlatformStats {
  tikkasClaimed: number;
  businesses: number;
  /** Real live drops. The stats bar and the marketplace strip both use this count. */
  dropsLive: number;
  /** Sum of bill amounts entered at redemption, in naira. */
  recordedSales: number;
  /** Real claims in the last 24 hours, newest first, for the ticker. No names. */
  recent: RecentClaim[];
  /** Which blocks may show (thresholds below). */
  show: { bar: boolean; ticker: boolean; strip: boolean };
  asOf: string;
}

export type StatKey = "tikkasClaimed" | "businesses" | "dropsLive" | "recordedSales";
export const STAT_KEYS: StatKey[] = ["tikkasClaimed", "businesses", "dropsLive", "recordedSales"];

export const STAT_LABEL: Record<StatKey, string> = {
  tikkasClaimed: "Tikkas claimed",
  businesses: "Businesses on Tikka",
  dropsLive: "Drops live now",
  recordedSales: "Recorded sales for businesses",
};

/** Each block shows only above its threshold, and is hidden entirely otherwise. */
export const THRESHOLDS = {
  barBusinesses: 20,
  barLiveDrops: 10,
  tickerClaims24h: 1,
  stripLiveDrops: 6,
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface StatsInput {
  businesses: { id: string; isDemo?: boolean; name: string; city: string }[];
  drops: { id: string; businessId: string; status: string }[];
  claims: { id: string; dropId: string; tier: Tier; claimedAt: string; redeemedAt?: string; billKobo?: number }[];
}

/** The real figures: demo businesses, their drops and their claims never count. */
export function platformStats(input: StatsInput, now: Date): PlatformStats {
  const real = new Map(input.businesses.filter((b) => !b.isDemo).map((b) => [b.id, b]));
  const drops = input.drops.filter((d) => real.has(d.businessId));
  const dropOwner = new Map(drops.map((d) => [d.id, d.businessId]));
  const claims = input.claims.filter((c) => dropOwner.has(c.dropId));
  const live = drops.filter((d) => d.status === "live").length;
  const recent = claims
    .filter((c) => now.getTime() - new Date(c.claimedAt).getTime() < DAY_MS)
    .sort((a, b) => b.claimedAt.localeCompare(a.claimedAt))
    .slice(0, 12)
    .map((c) => {
      const b = real.get(dropOwner.get(c.dropId)!)!;
      return { id: c.id, city: b.city, tier: c.tier, businessName: b.name, at: c.claimedAt };
    });
  return {
    tikkasClaimed: claims.length,
    businesses: real.size,
    dropsLive: live,
    recordedSales: claims.reduce((x, c) => x + (c.redeemedAt && c.billKobo ? c.billKobo : 0), 0) / 100,
    recent,
    show: {
      bar: real.size >= THRESHOLDS.barBusinesses && live >= THRESHOLDS.barLiveDrops,
      ticker: recent.length >= THRESHOLDS.tickerClaims24h,
      strip: live >= THRESHOLDS.stripLiveDrops,
    },
    asOf: now.toISOString(),
  };
}
