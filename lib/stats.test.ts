import { describe, expect, it } from "vitest";
import { platformStats, THRESHOLDS, type StatsInput } from "./stats";

const now = new Date("2026-10-21T12:00:00+01:00");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();

function world(n: { businesses: number; liveDrops: number; demo?: boolean; claims?: number; claimedHoursAgo?: number }): StatsInput {
  const businesses = Array.from({ length: n.businesses }, (_, i) => ({ id: `b${i}`, name: `Biz ${i}`, city: "Lagos", isDemo: n.demo ?? false }));
  const drops = Array.from({ length: n.liveDrops }, (_, i) => ({ id: `d${i}`, businessId: `b${i % n.businesses}`, status: "live" }));
  const claims = Array.from({ length: n.claims ?? 0 }, (_, i) => ({
    id: `c${i}`,
    dropId: "d0",
    tier: "rare" as const,
    claimedAt: hoursAgo(n.claimedHoursAgo ?? 1),
    redeemedAt: i === 0 ? hoursAgo(0.5) : undefined,
    billKobo: i === 0 ? 2_500_000 : undefined,
  }));
  return { businesses, drops, claims };
}

describe("landing numbers", () => {
  it("with only demo businesses, shows none of the blocks", () => {
    const s = platformStats(world({ businesses: 40, liveDrops: 30, demo: true, claims: 50 }), now);
    expect(s).toMatchObject({ tikkasClaimed: 0, businesses: 0, dropsLive: 0, recordedSales: 0, recent: [] });
    expect(s.show).toEqual({ bar: false, ticker: false, strip: false });
  });

  it("never mixes demo businesses into real counts", () => {
    const input = world({ businesses: 3, liveDrops: 3, claims: 2 });
    input.businesses.push({ id: "demo", name: "Glow Studio", city: "Lagos", isDemo: true });
    input.drops.push({ id: "dd", businessId: "demo", status: "live" });
    input.claims.push({ id: "cd", dropId: "dd", tier: "legendary", claimedAt: hoursAgo(1) });
    const s = platformStats(input, now);
    expect(s.businesses).toBe(3);
    expect(s.dropsLive).toBe(3);
    expect(s.tikkasClaimed).toBe(2);
    expect(s.recent.map((r) => r.businessName)).not.toContain("Glow Studio");
    expect(s.recordedSales).toBe(25_000);
  });

  it("shows the stats bar from 20 real businesses and 10 live drops", () => {
    expect(platformStats(world({ businesses: THRESHOLDS.barBusinesses, liveDrops: THRESHOLDS.barLiveDrops }), now).show.bar).toBe(true);
    expect(platformStats(world({ businesses: 19, liveDrops: 30 }), now).show.bar).toBe(false);
    expect(platformStats(world({ businesses: 30, liveDrops: 9 }), now).show.bar).toBe(false);
  });

  it("shows the ticker only with a real claim in the last 24 hours", () => {
    expect(platformStats(world({ businesses: 1, liveDrops: 1, claims: 1, claimedHoursAgo: 23 }), now).show.ticker).toBe(true);
    expect(platformStats(world({ businesses: 1, liveDrops: 1, claims: 1, claimedHoursAgo: 25 }), now).show.ticker).toBe(false);
  });

  it("shows the marketplace strip from 6 real live drops, on the same count as the bar", () => {
    const s = platformStats(world({ businesses: 6, liveDrops: 6 }), now);
    expect(s.show.strip).toBe(true);
    expect(s.dropsLive).toBe(6);
    expect(platformStats(world({ businesses: 5, liveDrops: 5 }), now).show.strip).toBe(false);
  });
});
