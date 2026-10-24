// The marketplace (PRD A5, TECH_PLAN §13): cities, sections, filters, sorts and search over
// drop tiles. Pure, so the rules are tested; the real version runs them as queries on the
// marketplace_drops view, with Postgres full-text search.

import { CATEGORIES } from "./nigeria";
import type { MarketDrop } from "./types";

export const CITY_COOKIE = "tk_city";

/** The city picker. "Other cities" is everywhere else in Nigeria. */
export const CITIES = [
  { id: "all", label: "All Nigeria" },
  { id: "lagos", label: "Lagos" },
  { id: "abuja", label: "Abuja" },
  { id: "port-harcourt", label: "Port Harcourt" },
  { id: "ibadan", label: "Ibadan" },
  { id: "other", label: "Other cities" },
] as const;
export type CityId = (typeof CITIES)[number]["id"];
const NAMED = CITIES.filter((c) => c.id !== "other" && c.id !== "all").map((c) => c.label as string);

export function cityId(input: string | undefined): CityId {
  return CITIES.find((c) => c.id === input)?.id ?? "all";
}
export function cityLabel(id: CityId): string {
  return CITIES.find((c) => c.id === id)!.label;
}
export function inCity(d: Pick<MarketDrop, "city">, id: CityId): boolean {
  if (id === "all") return true;
  return id === "other" ? !NAMED.includes(d.city) : d.city === cityLabel(id);
}

/** "Food & drinks" ↔ "food-and-drinks". */
export function categorySlug(c: string): string {
  return c.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
export function categoryFromSlug(slug: string): (typeof CATEGORIES)[number] | undefined {
  return CATEGORIES.find((c) => categorySlug(c) === slug);
}

const HOUR = 3_600_000;

export interface Section {
  id: "trending" | "ending" | "most" | "legendary" | "new" | "soon";
  title: string;
  drops: MarketDrop[];
}

export const MIN_IN_SECTION = 3;
export const ROW_SIZE = 8;

/** The home's rows. A row with fewer than 3 drops is hidden, so nothing looks empty. */
export function sections(drops: MarketDrop[], now: Date): Section[] {
  const t = now.getTime();
  const live = drops.filter((d) => d.status === "live" && d.left > 0);
  const rows: Section[] = [
    { id: "trending", title: "Live now", drops: [...live].sort((a, b) => b.claimsLastHour - a.claimsLastHour) },
    { id: "ending", title: "Ending soon", drops: live.filter((d) => new Date(d.endsAt).getTime() - t < 24 * HOUR).sort((a, b) => a.endsAt.localeCompare(b.endsAt)) },
    { id: "most", title: "Most claimed today", drops: live.filter((d) => d.claims24h > 0).sort((a, b) => b.claims24h - a.claims24h) },
    { id: "legendary", title: "Legendary inside", drops: live.filter((d) => d.legendaryLeft > 0).sort((a, b) => b.legendaryLeft - a.legendaryLeft) },
    { id: "new", title: "New drops", drops: live.filter((d) => t - new Date(d.publishedAt).getTime() < 3 * 24 * HOUR).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)) },
    { id: "soon", title: "Coming soon", drops: drops.filter((d) => d.status === "scheduled").sort((a, b) => a.startsAt.localeCompare(b.startsAt)) },
  ];
  return rows.filter((r) => r.drops.length >= MIN_IN_SECTION).map((r) => ({ ...r, drops: r.drops.slice(0, ROW_SIZE) }));
}

export const SORTS = [
  { id: "trending", label: "Trending" },
  { id: "ending", label: "Ending soon" },
  { id: "newest", label: "Newest" },
  { id: "most_left", label: "Most left" },
] as const;
export type SortId = (typeof SORTS)[number]["id"];

export interface MarketFilters {
  city?: CityId;
  area?: string;
  category?: string;
  status?: "live" | "scheduled";
  legendary?: boolean;
  sort: SortId;
  q?: string;
}

export function parseMarketFilters(sp: Record<string, string | string[] | undefined>): MarketFilters {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : undefined) || undefined;
  const city = one("city");
  const status = one("status");
  return {
    city: city ? cityId(city) : undefined,
    area: one("area")?.slice(0, 60),
    category: categoryFromSlug(one("category") ?? ""),
    status: status === "live" || status === "scheduled" ? status : undefined,
    legendary: one("legendary") === "1" || undefined,
    sort: SORTS.find((s) => s.id === one("sort"))?.id ?? "trending",
    q: one("q")?.slice(0, 80),
  };
}

function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Every word must appear in the business name, category, city, area or drop title. */
export function matches(d: MarketDrop, q: string): boolean {
  const hay = fold([d.businessName, d.category, d.city, d.area, d.state, d.dropName].join(" "));
  return fold(q)
    .split(/[^a-z0-9₦]+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

export function filterAndSort(drops: MarketDrop[], f: MarketFilters): MarketDrop[] {
  const out = drops.filter(
    (d) =>
      (d.status === "scheduled" || d.left > 0) &&
      (!f.city || inCity(d, f.city)) &&
      (!f.area || fold(d.area) === fold(f.area)) &&
      (!f.category || d.category === f.category) &&
      (!f.status || d.status === f.status) &&
      (!f.legendary || d.legendaryLeft > 0) &&
      (!f.q || matches(d, f.q)),
  );
  const by: Record<SortId, (a: MarketDrop, b: MarketDrop) => number> = {
    trending: (a, b) => b.claimsLastHour - a.claimsLastHour || b.claims24h - a.claims24h,
    ending: (a, b) => (a.status === b.status ? a.endsAt.localeCompare(b.endsAt) : a.status === "live" ? -1 : 1),
    newest: (a, b) => b.publishedAt.localeCompare(a.publishedAt),
    most_left: (a, b) => b.left - a.left,
  };
  return out.sort(by[f.sort]);
}

/** Areas that have drops in a city, for the area picker. */
export function areasIn(drops: MarketDrop[], city: CityId): string[] {
  return [...new Set(drops.filter((d) => inCity(d, city)).map((d) => d.area))].sort();
}

/* ------------------------------------------------------- home: busy bits */

export interface MarketStats {
  live: number;
  claimedToday: number;
  legendaryLeft: number;
  waiting: number;
  cities: number;
}

/** The stats strip. */
export function marketStats(drops: MarketDrop[]): MarketStats {
  const live = drops.filter((d) => d.status === "live" && d.left > 0);
  return {
    live: live.length,
    claimedToday: drops.reduce((x, d) => x + d.claims24h, 0),
    legendaryLeft: live.reduce((x, d) => x + d.legendaryLeft, 0),
    waiting: drops.filter((d) => d.status === "scheduled").reduce((x, d) => x + d.waiting, 0),
    cities: new Set(live.map((d) => d.city)).size,
  };
}

/** "Top drops today": the ranking table's four tabs (no minimum, unlike the rows). */
export function rankings(drops: MarketDrop[], now: Date) {
  const live = drops.filter((d) => d.status === "live" && d.left > 0);
  const t = now.getTime();
  return {
    trending: [...live].sort((a, b) => b.claimsLastHour - a.claimsLastHour || b.claims24h - a.claims24h),
    most: [...live].sort((a, b) => b.claims24h - a.claims24h),
    ending: live.filter((d) => new Date(d.endsAt).getTime() > t).sort((a, b) => a.endsAt.localeCompare(b.endsAt)),
    new: [...live].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)),
  };
}

export function topCities(drops: MarketDrop[]): { city: string; live: number; claimedToday: number }[] {
  const m = new Map<string, { city: string; live: number; claimedToday: number }>();
  for (const d of drops) {
    if (d.status !== "live") continue;
    const row = m.get(d.city) ?? { city: d.city, live: 0, claimedToday: 0 };
    row.live++;
    row.claimedToday += d.claims24h;
    m.set(d.city, row);
  }
  return [...m.values()].sort((a, b) => b.claimedToday - a.claimedToday);
}

export function topBusinesses(drops: MarketDrop[]) {
  return drops
    .filter((d) => d.status === "live")
    .map((d) => ({ name: d.businessName, slug: d.businessSlug, initials: d.initials, brandColor: d.brandColor, onBrandColor: d.onBrandColor, place: `${d.area}, ${d.city}`, category: d.category, rating: d.rating, claimedToday: d.claims24h, claimed: d.claimed }))
    .sort((a, b) => b.claimedToday - a.claimedToday);
}


function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * One recent claim for the public ticker. No name or anything else about the person: claimers
 * only agreed to hear from the business, and they may be anywhere in Nigeria, so the place is the
 * business's, never theirs.
 */
export interface MarketClaim {
  id: string;
  tier: "legendary" | "rare" | "thank_you";
  businessName: string;
  businessSlug: string;
  dropSlug: string;
  area: string;
  city: string;
  at: string;
}

/**
 * DEMO: the ticker's recent claims, spread over the last hour from each drop's claims-per-hour,
 * steady between refreshes (seeded by the hour). First names only, as on the claim page. The
 * real feed reads the last claims across the marketplace from `claims`.
 */
export function recentClaims(drops: MarketDrop[], now: Date, limit = 24): MarketClaim[] {
  const hour = Math.floor(now.getTime() / 3_600_000);
  const out: MarketClaim[] = [];
  for (const d of drops) {
    if (d.status !== "live") continue;
    for (const h of [hour, hour - 1]) {
      const rng = mulberry(hash(`${d.id}:${h}`));
      for (let i = 0; i < d.claimsLastHour; i++) {
        const at = h * 3_600_000 + Math.floor(rng() * 3_600_000);
        const roll = rng() * d.total;
        const tier = roll < d.legendary ? "legendary" : roll < d.legendary + d.rare ? "rare" : "thank_you";
        if (at > now.getTime() || now.getTime() - at > 3_600_000) continue;
        out.push({ id: `${d.id}-${h}-${i}`, tier, businessName: d.businessName, businessSlug: d.businessSlug, dropSlug: d.dropSlug, area: d.area, city: d.city, at: new Date(at).toISOString() });
      }
    }
  }
  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
