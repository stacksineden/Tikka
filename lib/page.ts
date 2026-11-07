// The business page: a one-page website (PRD A5). Pure rules shared by the page, the editor
// ("Your page") and the tests: what shows, how prices and the hero read, and the booking link.

import { naira, place } from "./format";
import { normalizeNgPhone } from "./setup";
import type { Business, BusinessPage, Drop, ServiceItem } from "./types";

export const PAGE_LIMITS = {
  services: 12,
  portfolio: 12,
  videos: 3,
  videoSeconds: 15,
  videoMb: 15,
  team: 8,
  faqs: 10,
  headline: 60,
  subline: 100,
  about: 800,
  textTitle: 40,
  textBody: 600,
  serviceName: 40,
  serviceDescription: 140,
  group: 30,
} as const;

/** Suggested headline from the category: "Hair and beauty in Lekki". */
const CATEGORY_LINE: Record<string, string> = {
  Beauty: "Hair and beauty",
  Wellness: "Spa and wellness",
  Fitness: "Fitness and training",
  "Food & drinks": "Food and drinks",
  Fashion: "Fashion and style",
  Health: "Health and care",
  Education: "Classes and lessons",
  Events: "Events",
  Services: "Services",
};

export function heroHeadline(b: Pick<Business, "page" | "category" | "area" | "serveMode">): string {
  if (b.page?.headline?.trim()) return b.page.headline.trim();
  const what = CATEGORY_LINE[b.category] ?? b.category;
  return b.serveMode === "online" ? `${what}, delivered across Nigeria` : b.serveMode === "come_to_you" ? `${what}, wherever you are` : `${what} in ${b.area}`;
}

/** Where they serve, always from "How do customers use their Tikka?". */
export function whereLine(b: Pick<Business, "area" | "city" | "serveMode">): string {
  if (b.serveMode === "online") return "Serves all of Nigeria";
  if (b.serveMode === "come_to_you") return `We come to you · ${b.city}`;
  return place(b.area, b.city);
}

/** The short line under the headline: their own, else where they serve. */
export function heroLine(b: Pick<Business, "page" | "area" | "city" | "serveMode">): string {
  return b.page?.subline?.trim() || whereLine(b);
}

/** Online and come-to-you businesses have no Hours and location, and no Directions. */
export function showsLocation(b: Pick<Business, "serveMode">): boolean {
  return (b.serveMode ?? "in_store") === "in_store";
}

export function priceText(s: Pick<ServiceItem, "price" | "priceKind">): string {
  if (s.priceKind === "ask" || s.price === null) return "Ask for price";
  return s.priceKind === "from" ? `From ${naira(s.price)}` : naira(s.price);
}

/** The number "Book on WhatsApp" goes to: the Chat on WhatsApp button's, else the owner's. */
export function bookingNumber(b: Pick<Business, "actions" | "ownerWhatsapp">): string | null {
  const raw = b.actions.find((a) => a.kind === "whatsapp")?.value ?? b.ownerWhatsapp;
  return raw ? normalizeNgPhone(raw) : null;
}

/** "Hi Glow Studio, I'd like to book Knotless braids (₦25,000)." */
export function bookingLink(b: Pick<Business, "name" | "actions" | "ownerWhatsapp">, s?: Pick<ServiceItem, "name" | "price" | "priceKind">): string | null {
  const n = bookingNumber(b);
  if (!n) return null;
  const text = s
    ? `Hi ${b.name}, I'd like to book ${s.name}${s.priceKind === "ask" || s.price === null ? "" : ` (${priceText(s)})`}.`
    : `Hi ${b.name}, I'd like to book an appointment.`;
  return `https://wa.me/${n.slice(1)}?text=${encodeURIComponent(text)}`;
}

/** Groups as tabs, only when the business has created more than one. */
export function serviceGroups(services: ServiceItem[]): string[] {
  const groups = [...new Set(services.map((s) => s.group?.trim()).filter((g): g is string => !!g))];
  return groups.length > 1 ? groups : [];
}

export type SectionId = "hero" | "drop" | "about" | "services" | "portfolio" | "reviews" | "team" | "faqs" | "text" | "location" | "cta";

/** The fixed order, keeping only sections with something to show. */
export function visibleSections(b: Business, ctx: { reviews: number }): SectionId[] {
  const p = b.page ?? {};
  const show: Record<SectionId, boolean> = {
    hero: true,
    drop: true,
    about: !!b.about?.trim(),
    services: b.services.length > 0,
    portfolio: b.portfolio.length > 0,
    reviews: ctx.reviews > 0,
    team: !!p.showTeam && (p.team?.length ?? 0) > 0,
    faqs: !!p.showFaqs && (p.faqs?.length ?? 0) > 0,
    text: !!p.showText && !!p.textTitle?.trim() && !!p.textBody?.trim(),
    location: showsLocation(b) && !!(b.address || b.hours),
    cta: true,
  };
  return (Object.keys(show) as SectionId[]).filter((k) => show[k]);
}

/** "Finish your page": four steps, never blocking a drop. */
export function pageChecklist(b: Business): { id: string; label: string; done: boolean }[] {
  return [
    { id: "hero", label: "Add a hero photo", done: !!b.page?.heroImageUrl },
    { id: "about", label: "Write your about", done: (b.about?.trim().length ?? 0) >= 40 },
    { id: "services", label: "Add 3 services with prices", done: b.services.filter((s) => s.price !== null || s.priceKind === "ask").length >= 3 },
    { id: "portfolio", label: "Add 4 portfolio photos", done: b.portfolio.length >= 4 },
  ];
}

/** Hero focal point as CSS object-position. */
export function focalPosition(f?: { x: number; y: number }): string {
  const c = (n: number) => `${Math.round(Math.min(1, Math.max(0, n)) * 100)}%`;
  return f ? `${c(f.x)} ${c(f.y)}` : "50% 50%";
}

/* ---------------------------------------------------------- validation */

export type PageErrors = Partial<Record<string, string>>;

const GAMBLING = /\b(win|wins|winner|winning|luck|lucky|jackpot|odds|bet|stake|lottery|raffle|prize draw)\b/i;
const tooLong = (v: string | undefined, max: number) => (v ?? "").trim().length > max;

/** The page's text fields (hero, about, text section, team, FAQs). */
export function validatePage(p: BusinessPageInput): PageErrors {
  const e: PageErrors = {};
  if (tooLong(p.headline, PAGE_LIMITS.headline)) e.headline = `Keep it under ${PAGE_LIMITS.headline} characters.`;
  if (tooLong(p.subline, PAGE_LIMITS.subline)) e.subline = `Keep it under ${PAGE_LIMITS.subline} characters.`;
  if (tooLong(p.about, PAGE_LIMITS.about)) e.about = `Keep it under ${PAGE_LIMITS.about} characters.`;
  if (tooLong(p.textTitle, PAGE_LIMITS.textTitle)) e.textTitle = `Keep it under ${PAGE_LIMITS.textTitle} characters.`;
  if (tooLong(p.textBody, PAGE_LIMITS.textBody)) e.textBody = `Keep it under ${PAGE_LIMITS.textBody} characters.`;
  if (p.showText && (!p.textTitle?.trim() || !p.textBody?.trim())) e.textBody = "Add a title and some text, or switch this section off.";
  if ((p.team?.length ?? 0) > PAGE_LIMITS.team) e.team = `Up to ${PAGE_LIMITS.team} people.`;
  if (p.team?.some((t) => !t.name.trim())) e.team = "Every team member needs a name.";
  if ((p.faqs?.length ?? 0) > PAGE_LIMITS.faqs) e.faqs = `Up to ${PAGE_LIMITS.faqs} questions.`;
  if (p.faqs?.some((f) => !f.q.trim() || !f.a.trim())) e.faqs = "Every question needs an answer.";
  const words = [p.headline, p.subline, p.about, p.textTitle, p.textBody, ...(p.faqs ?? []).flatMap((f) => [f.q, f.a])].join(" ");
  if (GAMBLING.test(words)) e.form = 'Avoid words like win or luck. Try "Every Tikka holds something".';
  return e;
}

export type BusinessPageInput = BusinessPage & { about?: string };

export function validateServices(services: ServiceItem[]): PageErrors {
  const e: PageErrors = {};
  if (services.length > PAGE_LIMITS.services) e.services = `Up to ${PAGE_LIMITS.services} services.`;
  services.forEach((s, i) => {
    if (!s.name.trim()) e[`service-${i}`] = "Name this service.";
    else if (tooLong(s.name, PAGE_LIMITS.serviceName)) e[`service-${i}`] = `Keep the name under ${PAGE_LIMITS.serviceName} characters.`;
    else if (tooLong(s.description, PAGE_LIMITS.serviceDescription)) e[`service-${i}`] = `Keep the description under ${PAGE_LIMITS.serviceDescription} characters.`;
    else if (tooLong(s.group, PAGE_LIMITS.group)) e[`service-${i}`] = `Keep the group under ${PAGE_LIMITS.group} characters.`;
    else if (s.priceKind !== "ask" && (s.price === null || !Number.isFinite(s.price) || s.price < 0)) e[`service-${i}`] = "Add a price, or choose Ask for price.";
  });
  return e;
}

/** Portfolio limits: 12 items, of which 3 videos of up to 15 s and 15 MB. */
export function videoProblem(existing: { kind?: string }[], seconds: number, bytes: number): string | null {
  if (existing.length >= PAGE_LIMITS.portfolio) return `Up to ${PAGE_LIMITS.portfolio} photos and videos.`;
  if (existing.filter((x) => x.kind === "video").length >= PAGE_LIMITS.videos) return `Up to ${PAGE_LIMITS.videos} videos. Remove one to add another.`;
  if (seconds > PAGE_LIMITS.videoSeconds + 0.5) return `Keep videos to ${PAGE_LIMITS.videoSeconds} seconds. This one is ${Math.round(seconds)}.`;
  if (bytes > PAGE_LIMITS.videoMb * 1024 * 1024) return `Keep videos under ${PAGE_LIMITS.videoMb} MB.`;
  return null;
}

/** A live or upcoming drop as the public business page and the QR poster see it: counts only,
 *  never the deck. Real businesses read it from get_business_page(), whoever is signed in. */
export interface PageDrop {
  slug: string;
  name: string;
  status: "live" | "scheduled" | "sold_out";
  total: number;
  left: number;
  startsAt: string;
  endsAt: string;
}

/** One entry of get_business_page()'s `drops`: published drops that haven't ended. */
export interface PageDropRow {
  slug: string;
  title: string;
  starts_at: string;
  ends_at: string;
  total: number;
  left: number;
}

export function pageDropsFrom(rows: PageDropRow[], now: Date): PageDrop[] {
  const t = now.getTime();
  return rows
    .filter((r) => new Date(r.ends_at).getTime() > t)
    .map((r) => {
      const left = Math.max(0, Number(r.left) || 0);
      const status = new Date(r.starts_at).getTime() > t ? "scheduled" : left > 0 ? "live" : "sold_out";
      return { slug: r.slug, name: r.title, status, total: Number(r.total) || 0, left, startsAt: new Date(r.starts_at).toISOString(), endsAt: new Date(r.ends_at).toISOString() };
    });
}

/** DEMO businesses: the same shape from their drops. */
export function pageDropsFromDrops(drops: Drop[]): PageDrop[] {
  return drops
    .filter((d): d is Drop & { status: PageDrop["status"] } => d.status === "live" || d.status === "scheduled" || d.status === "sold_out")
    .map((d) => ({ slug: d.slug, name: d.name, status: d.status, total: d.total, left: Math.max(0, d.total - d.claimed), startsAt: d.startsAt, endsAt: d.endsAt }));
}
