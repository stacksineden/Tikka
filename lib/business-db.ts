import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";
import {
  businessFrom,
  cardTo,
  pageTo,
  privateTo,
  serviceTo,
  type BusinessRow,
  type FaqRow,
  type PageRow,
  type PortfolioRow,
  type PrivateRow,
  type ServiceRow,
  type TeamRow,
  mediaOf,
  teamTo,
} from "./business-map";
import { isInline, toStored } from "./media-path";
import type { Poster } from "./posters";
import { createClient } from "./supabase/server";
import type { Business } from "./types";

// Businesses in Supabase, as the signed-in person (RLS decides what they can read and write).
// lib/data.ts calls these for real accounts and keeps the demo store for demo businesses.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Real accounts (and real businesses) have uuids; the demo store's ids don't. */
export function isDbId(id: string | undefined): id is string {
  return !!id && UUID.test(id);
}

const CARD_COLUMNS =
  "id, name, slug, code_prefix, category, state, city, area, address, tagline, about, brand_color, on_brand_color, background_type, background_value, logo_path, video_path, video_poster_path, hours, actions, serve_mode, verified, suspended, rating_avg, rating_count, is_demo";

export class BusinessSaveError extends Error {
  constructor(
    message: string,
    /** "slug" | "codePrefix" when one of them was taken in the meantime. */
    readonly field?: string,
  ) {
    super(message);
  }
}

async function ownedBusinessId(sb: SupabaseClient, ownerId: string): Promise<string | null> {
  const { data } = await sb.from("business_members").select("business_id").eq("user_id", ownerId).eq("role", "owner").maybeSingle();
  return data?.business_id ?? null;
}

async function loadById(sb: SupabaseClient, id: string): Promise<Business | null> {
  const { data: card } = await sb.from("businesses").select(CARD_COLUMNS).eq("id", id).maybeSingle<BusinessRow>();
  if (!card) return null;
  const [priv, page, services, portfolio, team, faqs] = await Promise.all([
    sb.from("business_private").select("owner_whatsapp, daily_summary, founding_member, guarantee_used").eq("business_id", id).maybeSingle<PrivateRow>(),
    sb.from("business_page").select("*").eq("business_id", id).maybeSingle<PageRow>(),
    sb.from("business_services").select("*").eq("business_id", id).order("position").returns<ServiceRow[]>(),
    sb.from("business_portfolio").select("*").eq("business_id", id).order("position").order("created_at").returns<PortfolioRow[]>(),
    sb.from("business_team").select("*").eq("business_id", id).order("position").returns<TeamRow[]>(),
    sb.from("business_faqs").select("*").eq("business_id", id).order("position").returns<FaqRow[]>(),
  ]);
  return businessFrom(card, priv.data, page.data, services.data ?? [], portfolio.data ?? [], team.data ?? [], faqs.data ?? []);
}

/**
 * A business by its owner's id (the owner's own dashboard), or by the business's id (anyone,
 * for a business that isn't suspended). Both are uuids, so they can't be confused. Once per
 * request (the layout and the page both ask); saves read back without the cache.
 */
export const loadBusiness = cache(async (id: string): Promise<Business | null> => {
  const sb = await createClient();
  const owned = await ownedBusinessId(sb, id);
  return loadById(sb, owned ?? id);
});

export async function loadBusinessBySlug(slug: string): Promise<Business | null> {
  const sb = await createClient();
  const { data } = await sb.from("businesses").select("id").eq("slug", slug.toLowerCase()).maybeSingle();
  return data ? loadById(sb, data.id) : null;
}

/** Page addresses and code prefixes in use by businesses in the database. */
export async function dbTaken(): Promise<{ slugs: Set<string>; prefixes: Set<string> }> {
  const sb = await createClient();
  const { data } = await sb.from("businesses").select("slug, code_prefix");
  return { slugs: new Set((data ?? []).map((r) => r.slug)), prefixes: new Set((data ?? []).map((r) => r.code_prefix)) };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function check(error: { message: string; code?: string } | null, what: string) {
  if (!error) return;
  if (error.code === "23505" && /slug/.test(error.message)) throw new BusinessSaveError("That page address was just taken. Try another.", "slug");
  if (error.code === "23505" && /code_prefix/.test(error.message)) throw new BusinessSaveError("Those code letters were just taken. Try others.", "codePrefix");
  throw new BusinessSaveError(`We couldn't save ${what}. Try again.`);
}

/**
 * Saves the owner's business: creates it on first save (create_business also adds the page row,
 * the free first drop and the counter poster), then writes only the parts that changed. Returns
 * the business as stored, with the database's ids.
 */
export async function saveBusinessDb(ownerId: string, next: Business): Promise<Business> {
  if (mediaOf(next).some(isInline)) throw new BusinessSaveError("A photo didn't finish uploading. Add it again.");
  const sb = await createClient();
  let id = await ownedBusinessId(sb, ownerId);
  const prev = id ? await loadById(sb, id) : null;

  if (!id) {
    const c = cardTo(next);
    const { data, error } = await sb.rpc("create_business", {
      p_name: c.name,
      p_slug: c.slug,
      p_code_prefix: c.code_prefix,
      p_category: c.category,
      p_state: c.state,
      p_city: c.city,
      p_area: c.area,
      p_brand_color: c.brand_color,
      p_on_brand_color: c.on_brand_color,
      p_actions: c.actions,
    });
    check(error, "your business");
    id = data as string;
  }

  if (!prev || !same(cardTo(prev), cardTo(next))) {
    const { error } = await sb.from("businesses").update(cardTo(next)).eq("id", id);
    check(error, "your card");
  }
  if (!prev || !same(privateTo(prev), privateTo(next))) {
    const { error } = await sb.from("business_private").update(privateTo(next)).eq("business_id", id);
    check(error, "your alerts");
  }
  if (!prev || !same(pageTo(prev.page), pageTo(next.page))) {
    const { error } = await sb.from("business_page").update(pageTo(next.page)).eq("business_id", id);
    check(error, "your page");
  }
  const services = next.services.map(serviceTo);
  if (!prev || !same(prev.services.map(serviceTo), services)) {
    const { error } = await sb.rpc("save_services", { p_business: id, p_services: services });
    check(error, "your services");
  }
  const team = (next.page?.team ?? []).map(teamTo);
  const prevTeam = (prev?.page?.team ?? []).map(teamTo);
  if (!same(prevTeam, team)) {
    const { error } = await sb.rpc("save_team", { p_business: id, p_team: team });
    check(error, "your team");
  }
  const faqs = (next.page?.faqs ?? []).map((f) => ({ question: f.q.trim(), answer: f.a.trim() }));
  const prevFaqs = (prev?.page?.faqs ?? []).map((f) => ({ question: f.q, answer: f.a }));
  if (!same(prevFaqs, faqs)) {
    const { error } = await sb.rpc("save_faqs", { p_business: id, p_faqs: faqs });
    check(error, "your questions");
  }
  await savePortfolioDb(sb, id, prev?.portfolio ?? [], next.portfolio);

  const saved = await loadById(sb, id);
  if (!saved) throw new BusinessSaveError("We couldn't read your business back. Refresh the page.");
  return saved;
}

/** Portfolio: removes what's gone, adds what's new (ids that aren't the database's), keeps order and captions. */
async function savePortfolioDb(sb: SupabaseClient, id: string, prev: Business["portfolio"], next: Business["portfolio"]) {
  const keep = new Set(next.filter((p) => isDbId(p.id)).map((p) => p.id));
  const gone = prev.filter((p) => !keep.has(p.id)).map((p) => p.id);
  if (gone.length) check((await sb.from("business_portfolio").delete().in("id", gone)).error, "your portfolio");
  const before = new Map(prev.map((p) => [p.id, p]));
  for (const [position, p] of next.entries()) {
    if (isDbId(p.id) && before.has(p.id)) {
      const was = before.get(p.id)!;
      const caption = p.caption?.trim() || null;
      if ((was.caption ?? null) !== caption || prev.indexOf(was) !== position) {
        check((await sb.from("business_portfolio").update({ caption, position }).eq("id", p.id)).error, "your portfolio");
      }
    } else {
      const { error } = await sb.from("business_portfolio").insert({
        business_id: id,
        kind: p.kind ?? "photo",
        image_path: toStored(p.url),
        thumb_path: toStored(p.thumbUrl),
        caption: p.caption?.trim() || null,
        duration_s: p.kind === "video" ? (p.seconds ?? 0) : null,
        position,
      });
      if (error?.code === "23514") throw new BusinessSaveError("Up to 12 photos and 3 videos.");
      check(error, "your portfolio");
    }
  }
}

/* ---------------------------------------------------------------- posters */

interface PosterRow {
  id: string;
  business_id: string;
  code: string;
  label: string;
  hook_line: string | null;
  created_at: string;
}

const posterFrom = (r: PosterRow): Poster => ({ id: r.id, businessId: r.business_id, code: r.code, label: r.label, hookLine: r.hook_line ?? undefined, createdAt: r.created_at });

export async function dbPosters(ownerId: string): Promise<Poster[]> {
  const sb = await createClient();
  const id = await ownedBusinessId(sb, ownerId);
  if (!id) return [];
  const { data } = await sb.from("posters").select("*").eq("business_id", id).order("created_at").returns<PosterRow[]>();
  return (data ?? []).map(posterFrom);
}

export async function dbAddPoster(ownerId: string, label: string): Promise<Poster> {
  const sb = await createClient();
  const id = await ownedBusinessId(sb, ownerId);
  const { data, error } = await sb.rpc("add_poster", { p_business: id, p_label: label });
  if (error) throw new BusinessSaveError(error.code === "23514" ? "You can have up to 20 posters." : "We couldn't add the poster. Try again.");
  return posterFrom(data as PosterRow);
}

export async function dbSavePosterHook(posterId: string, hook: string): Promise<string | null> {
  const sb = await createClient();
  const { error } = await sb.rpc("save_poster_hook", { p_poster: posterId, p_hook: hook });
  return error ? (error.code === "23514" ? 'Say "Every Tikka holds something" instead of words like win or luck.' : "We couldn't save the line. Try again.") : null;
}

/** Which business a poster code belongs to (the /q scan), for businesses in the database. */
export async function dbPosterByCode(code: string): Promise<{ poster: Poster; businessSlug: string } | null> {
  const sb = await createClient();
  // Posters are owner-only through RLS; the scan only needs the slug, via the public business row.
  const { data } = await sb.rpc("poster_target", { p_code: code });
  const row = (data as { poster_id: string; business_id: string; slug: string; label: string }[] | null)?.[0];
  return row ? { poster: { id: row.poster_id, businessId: row.business_id, code, label: row.label, createdAt: "" }, businessSlug: row.slug } : null;
}
