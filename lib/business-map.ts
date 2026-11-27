// A business as the screens use it (lib/types.ts Business) ⇄ its rows in the database
// (businesses, business_private, business_page, business_services, business_portfolio,
// business_team, business_faqs). Files are stored as paths (lib/media-path.ts). Pure, so the
// mapping is pinned by tests.

import { unitRange } from "./units";
import { fromStored, toStored } from "./media-path";
import { initialsFrom } from "./setup";
import type { Business, BusinessPage, CardBackground, PageStyle, PatternId, PhotoCamera, PortfolioCollection, PortfolioPhoto, ServiceItem, TeamMember, FaqItem, TravelReach, WorkPlace } from "./types";

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
  /** Added by the new_direction_fields migration (docs/DB_MOVE.md step 1); absent on rows read before it. */
  trades?: string[] | null;
  work_place?: WorkPlace | null;
  travel_fee_kobo?: number | null;
  travel_reach?: TravelReach | null;
  booking_rules?: string[] | null;
  gap_minutes?: number | null;
  home_gap_minutes?: number | null;
  /** Added by the listing_and_location migration. */
  listed?: boolean;
  lat?: number | string | null;
  lng?: number | string | null;
  location_approx?: boolean;
  amenities?: string[] | null;
  listing_terms_at?: string | null;
  listing_grace_until?: string | null;
  plus_until?: string | null;
  languages?: string[] | null;
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
  /** Added by the photography_style migration; absent on rows read before it. */
  style?: PageStyle | null;
  /** Added by the gallery_tone migration. */
  gallery_tone?: "dark" | "light" | null;
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
  /** Added by the service_focal migration; absent on rows read before it. */
  focal_x?: number | string | null;
  focal_y?: number | string | null;
  /** Added by the bookings migration. */
  minutes?: number | null;
  /** Added by the deposits migration. */
  deposit_mode?: "none" | "fixed" | "full" | null;
  deposit_kobo?: number | null;
  /** Added by the new_direction_fields migration. Amounts in kobo. */
  options?: { label: string; price_kobo: number; minutes: number }[] | null;
  extras?: { name: string; price_kobo: number }[] | null;
  event_day?: boolean;
  per_person?: boolean;
  questions?: string[] | null;
  gap_minutes?: number | null;
  /** Added by the per_hour_per_item migration. */
  unit?: "hour" | "item" | null;
  unit_label?: string | null;
  unit_min?: number | null;
  unit_max?: number | null;
  unit_minutes?: number | null;
}

export interface PortfolioRow {
  id: string;
  kind: "photo" | "video";
  image_path: string;
  thumb_path: string;
  caption: string | null;
  duration_s: number | string | null;
  /** Added by the portfolio_collections migration; absent on rows read before it. */
  collection_id?: string | null;
  /** Added by the photography_style migration. */
  width?: number | null;
  height?: number | null;
  tone?: string | null;
  camera?: PhotoCamera | null;
}

export interface CollectionRow {
  id: string;
  name: string;
  slug: string;
  service_name: string | null;
  cover_id: string | null;
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
  if (type === "photo" && value) return { type: "photo", url: fromStored(value)! };
  return { type: "color" };
}

export function backgroundTo(bg: CardBackground | undefined): Pick<BusinessRow, "background_type" | "background_value"> {
  if (bg?.type === "pattern") return { background_type: "pattern", background_value: bg.pattern };
  if (bg?.type === "photo") return { background_type: "photo", background_value: toStored(bg.url) };
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
    minutes: r.minutes ?? undefined,
    depositMode: r.deposit_mode ?? undefined,
    depositKobo: r.deposit_kobo ?? undefined,
    imageUrl: fromStored(r.image_path),
    focal: r.focal_x == null || r.focal_y == null ? undefined : { x: Number(r.focal_x), y: Number(r.focal_y) },
    options: r.options?.length ? r.options.map((o) => ({ label: o.label, price: o.price_kobo / 100, minutes: o.minutes })) : undefined,
    extras: r.extras?.length ? r.extras.map((x) => ({ name: x.name, price: x.price_kobo / 100 })) : undefined,
    eventDay: r.event_day || undefined,
    perPerson: r.per_person || undefined,
    questions: r.questions?.length ? r.questions : undefined,
    gapMinutes: r.gap_minutes ?? undefined,
    unit: r.unit ?? undefined,
    unitLabel: r.unit_label ?? undefined,
    unitMin: r.unit_min ?? undefined,
    unitMax: r.unit_max ?? undefined,
    unitMinutes: r.unit_minutes ?? undefined,
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
    minutes: s.minutes ?? null,
    deposit_mode: s.depositMode ?? null,
    deposit_kobo: s.depositMode === "fixed" ? (s.depositKobo ?? null) : null,
    image_path: toStored(s.imageUrl),
    focal_x: s.focal?.x ?? 0.5,
    focal_y: s.focal?.y ?? 0.3,
    options: s.options?.length ? s.options.map((o) => ({ label: o.label.trim(), price_kobo: Math.round(o.price * 100), minutes: Math.round(o.minutes) })) : null,
    extras: s.extras?.length ? s.extras.map((x) => ({ name: x.name.trim(), price_kobo: Math.round(x.price * 100) })) : null,
    event_day: !!s.eventDay,
    // The database insists on two options or more for per person.
    per_person: !!s.perPerson && (s.options?.length ?? 0) >= 2,
    questions: s.questions?.map((q) => q.trim()).filter(Boolean).slice(0, 3) ?? null,
    gap_minutes: s.gapMinutes ?? null,
    // Per hour or per item: never with per person or event days, and per item needs its name (the database insists).
    ...unitTo(s),
  };
}

function unitTo(s: ServiceItem) {
  const r = unitRange(s);
  if (!s.unit || s.perPerson || s.eventDay || !r || (s.unit === "item" && !s.unitLabel?.trim())) return { unit: null };
  return {
    unit: s.unit,
    unit_label: s.unit === "item" ? s.unitLabel!.trim().slice(0, 20) : null,
    unit_min: r.min,
    unit_max: r.max,
    unit_minutes: s.unit === "item" && s.unitMinutes ? Math.max(5, Math.min(600, Math.round(s.unitMinutes))) : null,
  };
}

export function portfolioFrom(r: PortfolioRow): PortfolioPhoto {
  return {
    id: r.id,
    kind: r.kind,
    url: fromStored(r.image_path)!,
    thumbUrl: fromStored(r.thumb_path)!,
    caption: opt(r.caption),
    seconds: r.duration_s === null ? undefined : Number(r.duration_s),
    collectionId: opt(r.collection_id),
    ...(r.width && r.height ? { width: r.width, height: r.height } : {}),
    ...(r.tone ? { tone: r.tone } : {}),
    ...(r.camera && Object.keys(r.camera).length ? { camera: r.camera } : {}),
  };
}

/** The photo details the portfolio insert takes (checked again by the database). */
export function portfolioDetailsTo(p: Pick<PortfolioPhoto, "width" | "height" | "tone" | "camera">) {
  const size = p.width && p.height ? { width: Math.round(p.width), height: Math.round(p.height) } : {};
  const tone = p.tone && /^#[0-9a-f]{6}$/.test(p.tone) ? { tone: p.tone } : {};
  const camera = p.camera && Object.keys(p.camera).length && JSON.stringify(p.camera).length <= 300 ? { camera: p.camera } : {};
  return { ...size, ...tone, ...camera };
}

export function collectionFrom(r: CollectionRow): PortfolioCollection {
  return { id: r.id, name: r.name, slug: r.slug, serviceName: opt(r.service_name), coverId: opt(r.cover_id) };
}

export function pageFrom(p: PageRow | null, team: TeamRow[], faqs: FaqRow[]): BusinessPage | undefined {
  if (!p) return undefined;
  return {
    heroImageUrl: fromStored(p.hero_image_path),
    heroFocal: { x: Number(p.hero_focal_x), y: Number(p.hero_focal_y) },
    headline: opt(p.headline),
    subline: opt(p.subline),
    aboutImageUrl: fromStored(p.about_image_path),
    showTeam: p.show_team,
    team: team.map((t): TeamMember => ({ id: t.id, name: t.name, role: opt(t.role), photoUrl: fromStored(t.photo_path) })),
    showFaqs: p.show_faqs,
    faqs: faqs.map((f): FaqItem => ({ id: f.id, q: f.question, a: f.answer })),
    showText: p.show_text,
    textTitle: opt(p.text_title),
    textBody: opt(p.text_body),
    ...(p.style ? { style: p.style } : {}),
    ...(p.gallery_tone ? { galleryTone: p.gallery_tone } : {}),
  };
}

export function pageTo(p: BusinessPage | undefined): Omit<PageRow, never> {
  return {
    hero_image_path: toStored(p?.heroImageUrl),
    hero_focal_x: p?.heroFocal?.x ?? 0.5,
    hero_focal_y: p?.heroFocal?.y ?? 0.5,
    headline: p?.headline?.trim() || null,
    subline: p?.subline?.trim() || null,
    about_image_path: toStored(p?.aboutImageUrl),
    show_team: !!p?.showTeam,
    show_faqs: !!p?.showFaqs,
    show_text: !!p?.showText,
    text_title: p?.textTitle?.trim() || null,
    text_body: p?.textBody?.trim() || null,
    style: p?.style ?? null,
    gallery_tone: p?.galleryTone ?? null,
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
  collections: CollectionRow[] = [],
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
    logoUrl: fromStored(b.logo_path),
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
    videoUrl: fromStored(b.video_path),
    videoPosterUrl: fromStored(b.video_poster_path),
    address: opt(b.address),
    portfolio: portfolio.map(portfolioFrom),
    collections: collections.map(collectionFrom),
    foundingMember: !!priv?.founding_member,
    ownerWhatsapp: opt(priv?.owner_whatsapp),
    dailySummary: priv ? priv.daily_summary : undefined,
    isDemo: b.is_demo,
    guaranteeUsed: !!priv?.guarantee_used,
    trades: b.trades?.length ? b.trades : undefined,
    workPlace: b.work_place ?? undefined,
    travelFee: b.travel_fee_kobo == null ? undefined : b.travel_fee_kobo / 100,
    travelReach: b.travel_reach ?? undefined,
    bookingRules: b.booking_rules?.length ? b.booking_rules : undefined,
    gapMinutes: b.gap_minutes ?? undefined,
    homeGapMinutes: b.home_gap_minutes ?? undefined,
    listed: b.listed ?? true,
    lat: b.lat == null ? undefined : Number(b.lat),
    lng: b.lng == null ? undefined : Number(b.lng),
    locationApprox: b.location_approx ?? true,
    amenities: b.amenities ?? undefined,
    listingTermsAt: b.listing_terms_at ?? undefined,
    listingGraceUntil: b.listing_grace_until ?? undefined,
    plusUntil: b.plus_until ?? undefined,
    languages: b.languages ?? undefined,
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
    logo_path: toStored(b.logoUrl),
    video_path: toStored(b.videoUrl),
    video_poster_path: toStored(b.videoPosterUrl),
    hours: b.hours ?? null,
    actions: b.actions ?? [],
    serve_mode: b.serveMode ?? "in_store",
    ...newDirectionTo(b),
  };
}

/** The new direction's business fields (new_direction_fields migration). A shop has no travel fee. */
export function newDirectionTo(b: Business) {
  const travels = !!b.workPlace && b.workPlace !== "shop";
  const rules = (b.bookingRules ?? []).map((r) => r.trim()).filter(Boolean).slice(0, 10);
  return {
    trades: b.trades?.length ? b.trades : null,
    work_place: b.workPlace ?? null,
    travel_fee_kobo: travels && typeof b.travelFee === "number" ? Math.round(b.travelFee * 100) : null,
    travel_reach: travels ? (b.travelReach ?? null) : null,
    booking_rules: rules.length ? rules : null,
    gap_minutes: b.gapMinutes ?? null,
    home_gap_minutes: b.homeGapMinutes ?? null,
  };
}

export function privateTo(b: Business) {
  return { owner_whatsapp: nigerianE164(b.ownerWhatsapp), daily_summary: b.dailySummary ?? true };
}

/** Teams and portfolio items as save_team() and the portfolio insert take them. */
export function teamTo(t: TeamMember) {
  return { name: t.name.trim(), role: t.role?.trim() || null, photo_path: toStored(t.photoUrl) };
}

/** Every file a business points at, to refuse photos pasted in as data instead of uploaded. */
export function mediaOf(b: Business): (string | undefined)[] {
  return [
    b.logoUrl,
    b.background.type === "photo" ? b.background.url : undefined,
    b.videoUrl,
    b.videoPosterUrl,
    b.page?.heroImageUrl,
    b.page?.aboutImageUrl,
    ...b.services.map((x) => x.imageUrl),
    ...(b.page?.team ?? []).map((x) => x.photoUrl),
    ...b.portfolio.flatMap((x) => [x.url, x.thumbUrl]),
  ];
}
