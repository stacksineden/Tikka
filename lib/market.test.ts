import { describe, expect, it } from "vitest";
import {
  areasIn,
  categoryFromSlug,
  categorySlug,
  filterAndSort,
  inCity,
  marketStats,
  matches,
  parseMarketFilters,
  rankings,
  recentClaims,
  sections,
  topBusinesses,
  topCities,
} from "./market";
import type { MarketDrop } from "./types";

const now = new Date("2026-10-21T12:00:00+01:00");
let n = 0;
function tile(p: Partial<MarketDrop>): MarketDrop {
  n++;
  return {
    id: `d${n}`,
    dropSlug: `drop-${n}`,
    dropName: "October Glow",
    businessName: `Biz ${n}`,
    businessSlug: `biz${n}`,
    initials: "BZ",
    brandColor: "#9C3B5C",
    onBrandColor: "#FFFFFF",
    category: "Beauty",
    area: "Lekki",
    city: "Lagos",
    state: "Lagos",
    total: 100,
    left: 50,
    legendary: 2,
    rare: 10,
    legendaryLeft: 1,
    status: "live",
    startsAt: "2026-10-10T09:00:00+01:00",
    endsAt: "2026-10-30T21:00:00+01:00",
    publishedAt: "2026-10-10T09:00:00+01:00",
    claimsLastHour: 1,
    claims24h: 5,
    claimed: 50,
    thankYou: 88,
    waiting: 0,
    ...p,
  };
}

describe("marketplace", () => {
  it("maps cities, with everywhere else under Other cities", () => {
    expect(inCity(tile({ city: "Lagos" }), "lagos")).toBe(true);
    expect(inCity(tile({ city: "Enugu" }), "other")).toBe(true);
    expect(inCity(tile({ city: "Abuja" }), "other")).toBe(false);
    expect(parseMarketFilters({ city: "nowhere" }).city).toBe("lagos");
  });

  it("round-trips category slugs", () => {
    expect(categorySlug("Food & drinks")).toBe("food-and-drinks");
    expect(categoryFromSlug("food-and-drinks")).toBe("Food & drinks");
    expect(categoryFromSlug("nope")).toBeUndefined();
  });

  it("builds sections and hides any with fewer than 3 drops", () => {
    const drops = [
      tile({ claimsLastHour: 9 }),
      tile({ claimsLastHour: 30, endsAt: "2026-10-21T22:00:00+01:00" }),
      tile({ claimsLastHour: 2, legendaryLeft: 0 }),
      tile({ status: "scheduled", startsAt: "2026-10-25T09:00:00+01:00" }),
      tile({ left: 0 }),
    ];
    const s = sections(drops, now);
    expect(s.map((x) => x.id)).toEqual(["trending", "most"]);
    expect(s[0].drops.map((d) => d.claimsLastHour)).toEqual([30, 9, 2]);
  });

  it("searches business, category, city, area and drop title", () => {
    const d = tile({ businessName: "Kiekie Café", category: "Food & drinks", area: "Yaba", dropName: "Morning Rush" });
    expect(matches(d, "kiekie cafe")).toBe(true);
    expect(matches(d, "yaba coffee")).toBe(false);
    expect(matches(d, "morning lagos")).toBe(true);
  });

  it("filters and sorts", () => {
    const a = tile({ city: "Abuja", area: "Wuse 2", left: 10, publishedAt: "2026-10-20T09:00:00+01:00" });
    const b = tile({ city: "Abuja", area: "Garki", left: 90, legendaryLeft: 0 });
    const c = tile({ city: "Abuja", status: "scheduled", left: 300 });
    const all = [a, b, c, tile({})];
    expect(filterAndSort(all, { city: "abuja", sort: "most_left" }).map((d) => d.id)).toEqual([c.id, b.id, a.id]);
    expect(filterAndSort(all, { city: "abuja", legendary: true, status: "live", sort: "newest" }).map((d) => d.id)).toEqual([a.id]);
    expect(filterAndSort(all, { city: "abuja", area: "garki", sort: "trending" }).map((d) => d.id)).toEqual([b.id]);
    expect(areasIn(all, "abuja")).toEqual(["Garki", "Lekki", "Wuse 2"]);
  });
});

describe("marketplace home", () => {
  const drops = [
    tile({ city: "Lagos", claims24h: 60, claimsLastHour: 9, legendaryLeft: 3, waiting: 0, businessName: "A", rating: 4.9 }),
    tile({ city: "Lagos", claims24h: 20, claimsLastHour: 2, legendaryLeft: 0, businessName: "B", rating: 4.5, endsAt: "2026-10-21T20:00:00+01:00" }),
    tile({ city: "Abuja", claims24h: 40, claimsLastHour: 12, legendaryLeft: 1, businessName: "C", publishedAt: "2026-10-21T08:00:00+01:00" }),
    tile({ city: "Abuja", status: "scheduled", waiting: 140, claims24h: 0, claimsLastHour: 0, businessName: "D" }),
  ];

  it("adds up the headline numbers", () => {
    expect(marketStats(drops)).toEqual({ live: 3, claimedToday: 120, legendaryLeft: 4, waiting: 140, cities: 2 });
  });

  it("ranks drops four ways", () => {
    const r = rankings(drops, now);
    expect(r.trending.map((d) => d.businessName)).toEqual(["C", "A", "B"]);
    expect(r.most.map((d) => d.businessName)).toEqual(["A", "C", "B"]);
    expect(r.ending.map((d) => d.businessName)[0]).toBe("B");
    expect(r.new.map((d) => d.businessName)[0]).toBe("C");
  });

  it("lists cities and businesses by claims today", () => {
    expect(topCities(drops)).toEqual([
      { city: "Lagos", live: 2, claimedToday: 80 },
      { city: "Abuja", live: 1, claimedToday: 40 },
    ]);
    expect(topBusinesses(drops).map((b) => b.name)).toEqual(["A", "C", "B"]);
  });

  it("makes a steady feed of recent claims, with nothing about the person, newest first", () => {
    const a = recentClaims(drops, now, 10);
    expect(a).toEqual(recentClaims(drops, now, 10));
    expect(a.length).toBe(10);
    // Public: no name or anything else about who claimed; the place is the business's.
    expect(a.every((c) => Object.keys(c).sort().join() === "area,at,businessName,businessSlug,city,dropSlug,id,tier")).toBe(true);
    expect([...a].sort((x, y) => y.at.localeCompare(x.at))).toEqual(a);
  });
});
