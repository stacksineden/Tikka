import "server-only";

// The homepage search's data: search_businesses() (supabase/migrations/20261213100000_search_businesses.sql).
// Public, so it reads with the visitor's own (often anonymous) session. Only what a business page
// already shows comes back.

import { fromStored } from "./media-path";
import { dayRange, type SearchQuery } from "./search";
import { adminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";

export interface BizCard {
  slug: string;
  name: string;
  category: string;
  trades: string[];
  area: string;
  city: string;
  state: string;
  comesToYou: boolean;
  onlyComesToYou: boolean;
  logoUrl?: string;
  coverUrl?: string;
  brandColor: string;
  rating?: number;
  reviews: number;
  verified: boolean;
  /** The cheapest priced service or option, in naira. */
  fromNaira?: number;
  deposit: boolean;
  bookable: boolean;
  isNew: boolean;
  /** The next bookable time (ISO), within the search's days. */
  nextFree?: string;
  /** Map pin; none for businesses that only go to customers. */
  lat?: number;
  lng?: number;
  /** The pin was worked out from the area, not placed by the owner. */
  approx: boolean;
  /** For a search with words: every word matched ("all"), or similar work ("related"). */
  match?: "all" | "related";
}

type Row = Record<string, unknown>;

/** Photos uploaded with a phone copy ("{id}.s.webp" beside "{id}.s-sm.webp"): cards use the small one. */
function smallCopy(path: string | null): string | null {
  return path && /\.s\.webp$/.test(path) ? path.replace(/\.s\.webp$/, ".s-sm.webp") : path;
}

export async function searchBusinesses(s: Partial<SearchQuery> & { sort?: "soonest" | "rating" | "new"; limit?: number }, now = new Date()): Promise<BizCard[]> {
  const days = dayRange({ when: s.when ?? "any", date: s.date }, now);
  // Local development only: test (demo) businesses show too, through the server's own key. The
  // database honours p_include_demo only for that key, so usetikka.com never shows them.
  const local = process.env.NODE_ENV !== "production";
  const sb = local ? adminClient() : await createClient();
  const { data, error } = await sb.rpc("search_businesses", {
    p_query: s.q ?? null,
    p_trade: s.trade ?? null,
    p_place: s.where ?? null,
    p_from: days.from ?? null,
    p_to: days.to ?? null,
    p_tod: s.tod ?? null,
    p_sort: s.sort ?? "soonest",
    p_limit: s.limit ?? 24,
    ...(local ? { p_include_demo: true } : {}),
  });
  if (error || !Array.isArray(data)) return [];
  return (data as Row[]).map((r) => ({
    slug: String(r.slug),
    name: String(r.name),
    category: String(r.category),
    trades: (r.trades as string[] | null) ?? [],
    area: String(r.area),
    city: String(r.city),
    state: String(r.state),
    comesToYou: r.comes_to_you === true,
    onlyComesToYou: r.only_comes_to_you === true,
    logoUrl: fromStored(r.logo_path as string | null),
    coverUrl: fromStored(smallCopy(r.cover_path as string | null)),
    brandColor: String(r.brand_color ?? "#3E2BB0"),
    rating: r.rating == null ? undefined : Number(r.rating),
    reviews: Number(r.reviews ?? 0),
    verified: r.verified === true,
    fromNaira: r.from_kobo == null || Number(r.from_kobo) >= 2147483647 ? undefined : Number(r.from_kobo) / 100,
    deposit: r.deposit === true,
    bookable: r.bookable === true,
    isNew: r.is_new === true,
    nextFree: (r.next_free as string | null) ?? undefined,
    lat: r.lat == null ? undefined : Number(r.lat),
    lng: r.lng == null ? undefined : Number(r.lng),
    approx: r.location_approx !== false,
    match: r.match === "all" || r.match === "related" ? r.match : undefined,
  }));
}
