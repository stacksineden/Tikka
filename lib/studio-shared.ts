// Tikka Studio (PRD B11): the content's shape, the checks every content file must pass, search
// with synonyms, and Cloudinary sizes. Pure, so it's unit-tested; lib/studio.ts reads the files.

export const STUDIO_CATEGORIES = [
  { id: "websites", label: "Websites" },
  { id: "whatsapp", label: "WhatsApp automations" },
  { id: "follow_up", label: "Lead follow-up systems" },
  { id: "ads", label: "Ads and content" },
  { id: "drops", label: "Drops, done for you" },
] as const;
export type StudioCategory = (typeof STUDIO_CATEGORIES)[number]["id"];

/** The work filters (PRD B11): services first, then industries. */
export const WORK_FILTER_CATEGORIES: StudioCategory[] = ["websites", "whatsapp", "ads", "drops"];

export const STUDIO_INDUSTRIES = [
  { id: "beauty", label: "Beauty" },
  { id: "skincare", label: "Skincare" },
  { id: "fashion", label: "Fashion" },
  { id: "food", label: "Food" },
  { id: "health", label: "Health" },
  { id: "home", label: "Home" },
  { id: "events", label: "Events" },
] as const;
export type StudioIndustry = (typeof STUDIO_INDUSTRIES)[number]["id"];

export interface StudioMedia {
  type: "image" | "video";
  src: string;
  alt: string;
  poster?: string;
  caption?: string;
  /** Show inside a phone outline (screenshots of chats). */
  frame?: "phone";
}

export interface CaseStudy {
  title: string;
  slug: string;
  client: string;
  city: string | null;
  categories: StudioCategory[];
  industry: StudioIndustry;
  services: string[];
  cover: string | null;
  media: StudioMedia[];
  challenge: string | null;
  what_we_did: string | null;
  /** Each a figure from the client's own data; empty when there's none. */
  results: string[];
  quote: string | null;
  live_url: string | null;
  featured: boolean;
  order: number;
  published: boolean;
}

export interface StudioPiece {
  key: string;
  src: string;
  type: "image" | "video";
  /** What it advertises, e.g. "Face serum campaign". */
  title: string;
  categories: StudioCategory[];
  industry: StudioIndustry;
  /** Only when we made it for that client. */
  client: string | null;
  featured: boolean;
  /** Hero placement: the centre reel or a card beside it. */
  hero: "reel" | "fan" | null;
  published: boolean;
}

export interface Testimonial {
  id: string;
  quote: string;
  name: string;
  role: string | null;
  business: string;
  permission_confirmed: boolean;
  published: boolean;
}

/** One tile in /studio/work: a case study, or one of our ad and content pieces. */
export type WorkItem = { kind: "case"; item: CaseStudy } | { kind: "piece"; item: StudioPiece };

const CATEGORY_IDS = new Set<string>(STUDIO_CATEGORIES.map((c) => c.id));
const INDUSTRY_IDS = new Set<string>(STUDIO_INDUSTRIES.map((i) => i.id));
const isStr = (v: unknown, max = 400) => typeof v === "string" && v.trim().length > 0 && v.length <= max;
const isOptStr = (v: unknown, max = 2000) => v === null || v === undefined || (typeof v === "string" && v.length <= max);
const isSrc = (v: unknown) => typeof v === "string" && (/^https:\/\/res\.cloudinary\.com\//.test(v) || /^\/studio\/[a-z0-9/_.-]+$/i.test(v));
/** Never let the former agency's name through to a page (PRD B11). */
const FORMER_NAME = /retena/i;

/** Why a case study file can't be used ([] when it's fine). */
export function caseStudyProblems(c: Record<string, unknown>): string[] {
  const p: string[] = [];
  if (!isStr(c.title, 120)) p.push("title");
  if (typeof c.slug !== "string" || !/^[a-z0-9-]{1,80}$/.test(c.slug)) p.push("slug");
  if (!isStr(c.client, 120)) p.push("client");
  if (!Array.isArray(c.categories) || !c.categories.length || !c.categories.every((x) => CATEGORY_IDS.has(x))) p.push("categories");
  if (!INDUSTRY_IDS.has(String(c.industry))) p.push("industry");
  if (!Array.isArray(c.services) || !c.services.every((s) => isStr(s, 60))) p.push("services");
  if (c.cover !== null && !isSrc(c.cover)) p.push("cover");
  if (!Array.isArray(c.media) || !c.media.every((m) => m && (m.type === "image" || m.type === "video") && isSrc(m.src) && isStr(m.alt, 300))) p.push("media");
  for (const k of ["challenge", "what_we_did", "city", "quote", "live_url"]) if (!isOptStr(c[k])) p.push(k);
  if (!Array.isArray(c.results) || !c.results.every((r) => isStr(r, 200))) p.push("results");
  if (typeof c.featured !== "boolean" || typeof c.published !== "boolean" || typeof c.order !== "number") p.push("featured, order or published");
  if (FORMER_NAME.test(JSON.stringify(c))) p.push("mentions the former agency");
  return p;
}

export function pieceProblems(x: Record<string, unknown>): string[] {
  const p: string[] = [];
  if (!isStr(x.key, 200)) p.push("key");
  if (!isSrc(x.src)) p.push("src");
  if (x.type !== "image" && x.type !== "video") p.push("type");
  if (!isStr(x.title, 120)) p.push("title");
  if (!Array.isArray(x.categories) || !x.categories.every((c) => CATEGORY_IDS.has(c))) p.push("categories");
  if (!INDUSTRY_IDS.has(String(x.industry))) p.push("industry");
  if (x.client !== null && !isStr(x.client, 120)) p.push("client");
  if (x.hero !== null && x.hero !== "reel" && x.hero !== "fan") p.push("hero");
  if (typeof x.featured !== "boolean" || typeof x.published !== "boolean") p.push("featured or published");
  if (FORMER_NAME.test(JSON.stringify(x))) p.push("mentions the former agency");
  return p;
}

/** Testimonials show only with recorded permission, and never name the former agency. */
export function testimonialShows(t: Testimonial): boolean {
  return t.published && t.permission_confirmed && !FORMER_NAME.test(t.quote);
}

/* ----------------------------------------------------------------- search */

/** Words people type → the words the content uses. */
const SYNONYMS: [RegExp, string][] = [
  [/\bskin\s*care\b/g, "skincare"],
  [/\b(serums?|cleansers?|face)\b/g, "skincare"],
  [/\bhair\s*care\b|\bhair\b|\bsalons?\b/g, "beauty"],
  [/\bfood\s*(and|&)\s*drinks?\b|\brestaurants?\b|\bkitchens?\b|\bsauces?\b/g, "food"],
  [/\bclothes\b|\bclothing\b|\bapparel\b|\bshoes?\b|\bfootwear\b|\bgymwear\b/g, "fashion"],
  [/\bsupplements?\b|\bwellness\b|\bclinics?\b/g, "health"],
  [/\bweb\s*sites?\b|\bsites?\b|\bweb\b|\bstores?\b|\blanding\s*pages?\b/g, "websites"],
  [/\bautomations?\b|\bwhats\s*app\b/g, "whatsapp"],
  [/\badverts?\b|\bads?\b|\bcreatives?\b|\breels?\b|\bvideos?\b|\bcontent\b/g, "ads"],
];

export function normaliseQuery(q: string): string[] {
  let s = q.toLowerCase().replace(/[^\p{L}\p{N}&\s-]/gu, " ");
  for (const [re, to] of SYNONYMS) s = s.replace(re, to);
  return [...new Set(s.split(/\s+/).filter((w) => w.length > 1))];
}

function haystack(w: WorkItem): string {
  const i = w.item;
  const parts =
    w.kind === "case"
      ? [i.title, (i as CaseStudy).client, (i as CaseStudy).services.join(" "), (i as CaseStudy).what_we_did ?? ""]
      : [i.title, (i as StudioPiece).client ?? ""];
  const cats = i.categories.map((c) => `${c} ${STUDIO_CATEGORIES.find((x) => x.id === c)?.label ?? ""}`);
  const ind = `${i.industry} ${STUDIO_INDUSTRIES.find((x) => x.id === i.industry)?.label ?? ""}`;
  return normaliseQuery([...parts, ...cats, ind].join(" ")).join(" ");
}

export interface WorkFilters {
  category?: StudioCategory;
  industry?: StudioIndustry;
  search?: string;
}

export function parseWorkFilters(sp: Record<string, string | string[] | undefined>): WorkFilters {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const category = one("category");
  const industry = one("industry");
  const search = one("search")?.trim().slice(0, 80);
  return {
    category: category && CATEGORY_IDS.has(category) ? (category as StudioCategory) : undefined,
    industry: industry && INDUSTRY_IDS.has(industry) ? (industry as StudioIndustry) : undefined,
    search: search || undefined,
  };
}

/** Case studies first (in their order), then featured pieces, then the rest. */
export function filterWork(items: WorkItem[], f: WorkFilters): WorkItem[] {
  const words = f.search ? normaliseQuery(f.search) : [];
  const rank = (w: WorkItem) => (w.kind === "case" ? w.item.order : w.item.featured ? 1000 : 2000);
  return items
    .filter((w) => !f.category || w.item.categories.includes(f.category))
    .filter((w) => !f.industry || w.item.industry === f.industry)
    .filter((w) => {
      if (!words.length) return true;
      const h = haystack(w);
      return words.every((word) => h.includes(word));
    })
    .sort((a, b) => rank(a) - rank(b));
}

/** The address of a filtered view, so it can be shared. */
export function workHref(f: WorkFilters, patch: Partial<WorkFilters> = {}): string {
  const next = { ...f, ...patch };
  const p = new URLSearchParams();
  if (next.category) p.set("category", next.category);
  if (next.industry) p.set("industry", next.industry);
  if (next.search) p.set("search", next.search);
  const s = p.toString();
  return `/studio/work${s ? `?${s}` : ""}`;
}

/* ------------------------------------------------------------- Cloudinary */

/** A Cloudinary image at a width (auto format and quality); local files as they are. */
export function imageAt(src: string, width: number): string {
  if (!src.includes("res.cloudinary.com")) return src;
  // A still taken from a video: a frame two seconds in (many ads fade in), as JPG.
  if (src.includes("/video/upload/")) return src.replace("/video/upload/", `/video/upload/so_2,w_${width},c_limit,f_jpg,q_auto/`).replace(/\.\w+$/, ".jpg");
  return src.replace("/image/upload/", `/image/upload/w_${width},c_limit,f_auto,q_auto/`);
}

/** The poster for a video: a frame two seconds in, as an image. */
export function posterFor(src: string, width = 720): string {
  return imageAt(src.replace(/\.\w+$/, ".jpg"), width);
}

/** A video sized for phones, in whatever format the browser plays best. */
export function videoAt(src: string, width = 720): string {
  return src.includes("res.cloudinary.com") ? src.replace("/video/upload/", `/video/upload/w_${width},c_limit,f_auto,q_auto/`) : src;
}

export const IMAGE_WIDTHS = [320, 480, 720, 960, 1280];

/* ------------------------------------------------------------- enquiries */

const STUDIO_WA_DEFAULT = "+2348022211241";

/** "Chat with us on WhatsApp": the Studio team's own number, with the PRD B11 message. */
export function studioWhatsApp(client?: string, number = STUDIO_WA_DEFAULT): string {
  const text = client
    ? `Hi Tikka Studio, I saw your work for ${client} and I'd like something similar.`
    : "Hi Tikka Studio, I'd like help with my business.";
  return `https://wa.me/${number.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}

export const BUDGET_RANGES = ["Under ₦200,000", "₦200,000 – ₦500,000", "₦500,000 – ₦1,000,000", "Over ₦1,000,000"] as const;
