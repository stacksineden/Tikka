// A business as the screens use it (lib/types.ts Business) ⇄ its rows in the database
// (businesses, business_private, business_page, business_services, business_portfolio,
// business_team, business_faqs). Pure, so the mapping is pinned by tests.

import { initialsFrom } from "./setup";
import type { Business, BusinessPage, CardBackground, PatternId, PortfolioPhoto, ServiceItem, TeamMember, FaqItem } from "./types";

export interface BusinessRow {
  id: string;
  name: string;
  slug: string;
  code_prefix: string;
  category: string;
  state: string;
  city: string;
  area: string;
  address: string | null;
  tagline: string | null;
  about: string | null;
  brand_color: string;
  on_brand_color: string;
  background_type: "color" | "pattern" | "photo";
  background_value: string | null;
  logo_path: string | null;
  video_path: string | null;
  video_poster_path: string | null;
  hours: Business["hours"] | null;
  actions: Business["actions"];
  serve_mode: "in_store" | "online" | "come_to_you";
  verified: boolean;
  suspended: boolean;
  rating_avg: number | string | null;
  rating_count: number;
  is_demo: boolean;
}

export interface PrivateRow {
  owner_whatsapp: string | null;
  daily_summary: boolean;
  founding_member: boolean;
  guarantee_used: boolean;
}

export interface PageRow {
  hero_image_path: string | null;
  hero_focal_x: number | string;
  hero_focal_y: number | string;
  headline: string | null;
  subline: string | null;
  about_image_path: string | null;
  show_team: boolean;
  show_faqs: boolean;
  show_text: boolean;
  text_title: string | null;
  text_body: string | null;
}

export interface ServiceRow {
  id: string;
  group_name: string | null;
  name: string;
  description: string | null;
  price_kobo: number | null;
  price_kind: "fixed" | "from" | "ask";
  duration: string | null;
  image_path: string | null;
}

export interface PortfolioRow {
  id: string;
  kind: "photo" | "video";
  image_path: string;
  thumb_path: string;
  caption: string | null;
  duration_s: number | string | null;
}

export interface TeamRow {
  id: string;
  name: string;
  role: string | null;
  photo_path: string | null;
}

export interface FaqRow {
  id: string;
  question: string;
  answer: string;
}

const opt = <T>(v: T | null | undefined): T | undefined => (v === null || v === undefined || v === "" ? undefined : v);

export function backgroundFrom(type: BusinessRow["background_type"], value: string | null): CardBackground {
  if (type === "pattern" && value) return { type: "pattern", pattern: value as PatternId };
  if (type === "photo" && value) return { type: "photo", url: value };
  return { type: "color" };
}

export function backgroundTo(bg: CardBackground | undefined): Pick<BusinessRow, "background_type" | "background_value"> {
  if (bg?.type === "pattern") return { background_type: "pattern", background_value: bg.pattern };
  if (bg?.type === "photo") return { background_type: "photo", background_value: bg.url };
  return { background_type: "color", background_value: null };
}

/** "0803 123 4567" or "+234 803…" → "+2348031234567"; anything else → null (alerts then use the Chat number). */
export function nigerianE164(phone: string | undefined): string | null {
  const d = (phone ?? "").replace(/[^\d+]/g, "");
  if (/^\+234\d{10}$/.test(d)) return d;
  if (/^234\d{10}$/.test(d)) return `+${d}`;
  if (/^0\d{10}$/.test(d)) return `+234${d.slice(1)}`;
  return null;
}

export function serviceFrom(r: ServiceRow): ServiceItem {
  return {
    id: r.id,
    name: r.name,
    group: opt(r.group_name),
    description: opt(r.description),
    price: r.price_kobo === null ? null : r.price_kobo / 100,
    priceKind: r.price_kind,
    duration: opt(r.duration),
    imageUrl: opt(r.image_path),
  };
}

/** For save_services(): naira on screen, kobo in the database. */
export function serviceTo(s: ServiceItem) {
  // No price means "Ask for price", whatever was picked (the database insists).
  const priced = (s.priceKind ?? "fixed") !== "ask" && typeof s.price === "number";
  return {
    group_name: s.group?.trim() || null,
    name: s.name.trim(),
    description: s.description?.trim() || null,
    price_kobo: priced ? Math.round(s.price! * 100) : null,
    price_kind: priced ? (s.priceKind ?? "fixed") : "ask",
    duration: s.duration?.trim() || null,
    image_path: s.imageUrl || null,
  };
}

export function portfolioFrom(r: PortfolioRow): PortfolioPhoto {
  return {
    id: r.id,
    kind: r.kind,
    url: r.image_path,
    thumbUrl: r.thumb_path,
    caption: opt(r.caption),
    seconds: r.duration_s === null ? undefined : Number(r.duration_s),
  };
}

export function pageFrom(p: PageRow | null, team: TeamRow[], faqs: FaqRow[]): BusinessPage | undefined {
  if (!p) return undefined;
  return {
    heroImageUrl: opt(p.hero_image_path),
    heroFocal: { x: Number(p.hero_focal_x), y: Number(p.hero_focal_y) },
    headline: opt(p.headline),
    subline: opt(p.subline),
    aboutImageUrl: opt(p.about_image_path),
    showTeam: p.show_team,
    team: team.map((t): TeamMember => ({ id: t.id, name: t.name, role: opt(t.role), photoUrl: opt(t.photo_path) })),
    showFaqs: p.show_faqs,
    faqs: faqs.map((f): FaqItem => ({ id: f.id, q: f.question, a: f.answer })),
    showText: p.show_text,
    textTitle: opt(p.text_title),
    textBody: opt(p.text_body),
  };
}

export function pageTo(p: BusinessPage | undefined): Omit<PageRow, never> {
  return {
    hero_image_path: p?.heroImageUrl || null,
    hero_focal_x: p?.heroFocal?.x ?? 0.5,
    hero_focal_y: p?.heroFocal?.y ?? 0.5,
    headline: p?.headline?.trim() || null,
    subline: p?.subline?.trim() || null,
    about_image_path: p?.aboutImageUrl || null,
    show_team: !!p?.showTeam,
    show_faqs: !!p?.showFaqs,
    show_text: !!p?.showText,
    text_title: p?.textTitle?.trim() || null,
    text_body: p?.textBody?.trim() || null,
  };
}

export function businessFrom(
  b: BusinessRow,
  priv: PrivateRow | null,
  page: PageRow | null,
  services: ServiceRow[],
  portfolio: PortfolioRow[],
  team: TeamRow[],
  faqs: FaqRow[],
): Business {
  return {
    id: b.id,
    slug: b.slug,
    name: b.name,
    initials: initialsFrom(b.name),
    category: b.category,
    area: b.area,
    city: b.city,
    state: b.state,
    brandColor: b.brand_color,
    onBrandColor: b.on_brand_color,
    codePrefix: b.code_prefix,
    logoUrl: opt(b.logo_path),
    background: backgroundFrom(b.background_type, b.background_value),
    tagline: opt(b.tagline),
    about: opt(b.about),
    hours: opt(b.hours),
    verified: b.verified,
    rating: b.rating_avg === null ? undefined : Number(b.rating_avg),
    reviewCount: b.rating_count,
    actions: b.actions ?? [],
    services: services.map(serviceFrom),
    serveMode: b.serve_mode,
    page: pageFrom(page, team, faqs),
    hasVideo: !!b.video_path,
    videoUrl: opt(b.video_path),
    videoPosterUrl: opt(b.video_poster_path),
    address: opt(b.address),
    portfolio: portfolio.map(portfolioFrom),
    foundingMember: !!priv?.founding_member,
    ownerWhatsapp: opt(priv?.owner_whatsapp),
    dailySummary: priv ? priv.daily_summary : undefined,
    isDemo: b.is_demo,
    guaranteeUsed: !!priv?.guarantee_used,
  };
}

/** The card's columns the owner may change (their grants on businesses). */
export function cardTo(b: Business) {
  return {
    name: b.name.trim(),
    slug: b.slug.toLowerCase(),
    code_prefix: b.codePrefix.toUpperCase(),
    category: b.category,
    state: b.state,
    city: b.city,
    area: b.area,
    address: b.address?.trim() || null,
    tagline: b.tagline?.trim() || null,
    about: b.about?.trim() || null,
    brand_color: b.brandColor,
    on_brand_color: b.onBrandColor,
    ...backgroundTo(b.background),
    logo_path: b.logoUrl || null,
    video_path: b.videoUrl || null,
    video_poster_path: b.videoPosterUrl || null,
    hours: b.hours ?? null,
    actions: b.actions ?? [],
    serve_mode: b.serveMode ?? "in_store",
  };
}

export function privateTo(b: Business) {
  return { owner_whatsapp: nigerianE164(b.ownerWhatsapp), daily_summary: b.dailySummary ?? true };
}
