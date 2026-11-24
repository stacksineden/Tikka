// Business cards (docs/BUSINESS_CARDS.md, PRD B10a). In code they're "contact cards" because
// "card" already means the Tikka card; owners only ever read "Business cards". Pure rules shared
// by the card face, the editor, the print kit, the demo store and the tests: the style a card
// uses, its photo, what each line says, and the permanent code behind its QR.

import { ALPHABET } from "./codes";
import { deepen, ON_WHITE } from "./color";
import { cryptoRng, type Rng } from "./deck";
import { place } from "./format";
import { formatNgPhone, normalizeNgPhone } from "./setup";
import { parseSocial } from "./social";
import type { Business, PortfolioPhoto } from "./types";

export type ContactCardStyle = "classic" | "photo" | "minimal" | "bold";

export interface ContactCard {
  id: string;
  businessId: string;
  /** 6 characters from the Tikka code alphabet: usetikka.com/c/<code>. Never changes. */
  code: string;
  /** Unset follows the category (defaultStyle()). */
  style?: ContactCardStyle;
  /** The Photo style's photo; unset (or gone) uses the first portfolio photo. */
  photoId?: string;
  /** Unset: the business's own card. */
  personName?: string;
  personRole?: string;
  rounded: boolean;
  showPhone: boolean;
  showInstagram: boolean;
  showPlace: boolean;
  createdAt: string;
  /** Scans this month (WAT) and ever, once per visitor per day. */
  scansMonth: number;
  scansTotal: number;
}

export const CONTACT_CODE_LENGTH = 6;
export const MAX_CONTACT_CARDS = 20;
export const PERSON_MAX = 40;
/** 85 × 55 mm, the size Nigerian printers use, with 3 mm bleed all round. */
export const CARD_MM = { w: 85, h: 55 } as const;
export const CARD_BLEED_MM = 3;

export const CONTACT_STYLES: readonly { id: ContactCardStyle; label: string; about: string }[] = [
  { id: "classic", label: "Classic", about: "Your logo in the middle on your colour." },
  { id: "photo", label: "Photo", about: "One of your photos, edge to edge." },
  { id: "minimal", label: "Minimal", about: "Soft white, small logo, lots of space." },
  { id: "bold", label: "Bold", about: "Your name, very large." },
];

const STYLE_IDS = new Set<string>(CONTACT_STYLES.map((s) => s.id));
export function isContactStyle(s: unknown): s is ContactCardStyle {
  return typeof s === "string" && STYLE_IDS.has(s);
}

/* ------------------------------------------------------------------ codes */

export function newContactCode(rng: Rng = cryptoRng()): string {
  let s = "";
  for (let i = 0; i < CONTACT_CODE_LENGTH; i++) s += ALPHABET[Math.floor(rng() * ALPHABET.length)];
  return s;
}

/** A code from a link: any case, spaces or dashes. Anything else isn't a code. */
export function normalizeContactCode(input: string): string | null {
  const s = input.toUpperCase().replace(/[\s-]/g, "");
  if (s.length !== CONTACT_CODE_LENGTH || [...s].some((c) => !ALPHABET.includes(c))) return null;
  return s;
}

/** What the QR holds. Permanent, so a printed card keeps working when the page link changes. */
export function contactScanPath(code: string): string {
  return `/c/${code}`;
}

/** Where a scan goes: always the business page, never a drop, tagged as a business card visit. */
export function contactTarget(businessSlug: string): string {
  return `/${businessSlug}?c=card`;
}

/** The easy-to-type link printed under the QR. */
export function pageLink(businessSlug: string): string {
  return `usetikka.com/${businessSlug}`;
}

/* ----------------------------------------------------------------- photos */

type PhotoSource = Pick<Business, "portfolio">;

/** The photos a card can use: the business's own portfolio photos, never videos. */
export function photoChoices(b: PhotoSource): PortfolioPhoto[] {
  return b.portfolio.filter((p) => (p.kind ?? "photo") === "photo");
}

/** The Photo style's photo: the owner's pick while it's still on their page, else the first. */
export function cardPhoto(card: Pick<ContactCard, "photoId">, b: PhotoSource): PortfolioPhoto | undefined {
  const photos = photoChoices(b);
  return photos.find((p) => p.id === card.photoId) ?? photos[0];
}

/* ----------------------------------------------------------------- styles */

/** Photography and Beauty lead with their work when they have a photo; everyone else gets Classic. */
export function defaultStyle(b: Pick<Business, "category" | "portfolio">): ContactCardStyle {
  return (b.category === "Photography" || b.category === "Beauty") && photoChoices(b).length > 0 ? "photo" : "classic";
}

/** The styles to offer: Photo only with a photo to put on it. */
export function availableStyles(b: PhotoSource): ContactCardStyle[] {
  const hasPhoto = photoChoices(b).length > 0;
  return CONTACT_STYLES.map((s) => s.id).filter((id) => id !== "photo" || hasPhoto);
}

/** The style a card is drawn in. A Photo card whose photos are all gone falls back to the default. */
export function cardStyle(card: Pick<ContactCard, "style">, b: Pick<Business, "category" | "portfolio">): ContactCardStyle {
  const s = card.style;
  if (!s || (s === "photo" && photoChoices(b).length === 0)) return defaultStyle(b);
  return s;
}

/* ------------------------------------------------------------------ lines */

const CATEGORY_WORDS: Record<string, string> = {
  Beauty: "Hair and beauty",
  Photography: "Photography",
  Wellness: "Spa and wellness",
  Fitness: "Fitness and training",
  "Food & drinks": "Food and drinks",
  Fashion: "Fashion and style",
  Health: "Health and care",
  Education: "Classes and lessons",
  Events: "Events",
  Services: "Services",
};

/** The longest tagline the card prints under the name, in characters (taglines go up to 60). */
export const ABOUT_MAX = 44;

/**
 * The line under the name: what the business is, in its own words. Their tagline ("Beauty and
 * Content Studio") when it's short enough for one line, else the category in words ("Hair and
 * beauty"). Never a list of services.
 */
export function aboutLine(b: Pick<Business, "tagline" | "category">): string {
  const tagline = (b.tagline ?? "").trim().replace(/\s+/g, " ").replace(/\.$/, "");
  if (tagline && tagline.length <= ABOUT_MAX) return tagline;
  return CATEGORY_WORDS[b.category] || b.category;
}

/** The number on the card: the WhatsApp button's, else the Call button's, as "0803 000 0000". */
export function cardPhone(b: Pick<Business, "actions">): string | undefined {
  const raw = b.actions.find((a) => a.kind === "whatsapp")?.value ?? b.actions.find((a) => a.kind === "call")?.value;
  const e164 = raw ? normalizeNgPhone(raw) : null;
  return e164 ? formatNgPhone(e164) : undefined;
}

/** "@glowstudio.ng", from the Instagram button. */
export function cardInstagram(b: Pick<Business, "actions">): string | undefined {
  const raw = b.actions.find((a) => a.kind === "instagram")?.value;
  const name = raw ? parseSocial("instagram", raw) : null;
  return name ? `@${name}` : undefined;
}

/** Where they are: "Lekki, Lagos", or how they serve when they don't have a shop. */
export function cardPlace(b: Pick<Business, "area" | "city" | "serveMode">): string {
  if (b.serveMode === "online") return "Serves all of Nigeria";
  if (b.serveMode === "come_to_you") return `We come to you · ${b.city}`;
  return place(b.area, b.city);
}

/** The words under the QR. */
export function cardCta(bookingsOn: boolean, category: string): string {
  if (!bookingsOn) return "Scan to see our work";
  return category === "Photography" ? "Scan to book a shoot" : "Scan to book";
}

export interface ContactLines {
  phone?: string;
  instagram?: string;
  place?: string;
}

/** The back's contact lines: each one the owner hasn't hidden and the business has. */
export function contactLines(card: Pick<ContactCard, "showPhone" | "showInstagram" | "showPlace">, b: Pick<Business, "actions" | "area" | "city" | "serveMode">): ContactLines {
  return {
    phone: card.showPhone ? cardPhone(b) : undefined,
    instagram: card.showInstagram ? cardInstagram(b) : undefined,
    place: card.showPlace ? cardPlace(b) : undefined,
  };
}

/** The back's heading: the person's name and role, or the business. */
export function cardHeading(card: Pick<ContactCard, "personName" | "personRole">, b: Pick<Business, "name" | "tagline" | "category">): { name: string; sub: string } {
  if (card.personName) return { name: card.personName, sub: card.personRole ? `${card.personRole} · ${b.name}` : b.name };
  return { name: b.name, sub: aboutLine(b) };
}

/* ------------------------------------------------------------- validation */

const GAMBLING = /\b(win|wins|winner|winning|luck|lucky|jackpot|odds|bet|stake|lottery|raffle|prize draw)\b/i;

/** A person's name and role for their card. Null when they're fine. */
export function validatePerson(name: string, role: string): string | null {
  const n = name.trim();
  const r = role.trim();
  if (r && !n) return "Add the person's name too.";
  if (n.length > PERSON_MAX) return `Keep the name under ${PERSON_MAX} characters.`;
  if (r.length > PERSON_MAX) return `Keep the role under ${PERSON_MAX} characters.`;
  if (GAMBLING.test(r)) return "Pick other words for the role.";
  return null;
}

/** A new card's settings: the business's own card, following the defaults. */
export function newContactCard(businessId: string, code: string, now: Date, person?: { name?: string; role?: string }): ContactCard {
  const name = person?.name?.trim() || undefined;
  return {
    id: "",
    businessId,
    code,
    personName: name,
    personRole: name ? person?.role?.trim() || undefined : undefined,
    rounded: false,
    showPhone: true,
    showInstagram: true,
    showPlace: true,
    createdAt: now.toISOString(),
    scansMonth: 0,
    scansTotal: 0,
  };
}

/* ----------------------------------------------------------------- layout */

/**
 * A headline's size in mm so it fits `widthMm` on one line: `maxMm`, or smaller for long words.
 * Fraunces averages about half an em per character, a little more for capitals.
 */
export function fitMm(text: string, maxMm: number, widthMm: number, em = 0.54): number {
  const chars = Math.max(1, [...text].length);
  const fit = widthMm / (chars * em);
  // Rounded down, so a shrunk headline is never a hair wider than its space.
  return fit >= maxMm ? maxMm : Math.floor(fit * 10) / 10;
}

/** Bold sets the name on two lines: the first word, then the rest ("Glow" / "Studio"). */
export function boldLines(name: string): [string, string] {
  const words = name.trim().split(/\s+/);
  return [words[0] ?? "", words.slice(1).join(" ")];
}

/** The QR in the business's colour, deep enough for any phone camera, on white. */
export function cardQrColors(b: Pick<Business, "brandColor">): { dark: string; light: string } {
  return { dark: deepen(b.brandColor, 10), light: ON_WHITE };
}

/** Small text on a light card in the business's colour: darkened until it reads clearly. */
export function cardInk(b: Pick<Business, "brandColor">): string {
  return deepen(b.brandColor, 7);
}

/** The column under the QR, in mm, and the smallest size the page link may print at. */
export const LINK_WIDTH_MM = 27;
export const LINK_MIN_MM = 1.8;

/**
 * How the page link prints under the QR: one line when it fits at a readable size (1.8 mm or
 * more), else two lines at 1.8 mm, never shrunk to a smudge. Tikka picks the break itself, so
 * every phone, computer and printer shows the same lines (a browser left to wrap picks its own):
 * after "usetikka.com/" when the address fits on the second line, else in the middle. Page
 * addresses are at most 30 characters, so two lines always hold it.
 */
export function linkLayout(slug: string): { sizeMm: number; lines: string[] } {
  const link = pageLink(slug);
  const oneLine = fitMm(link, 1.95, LINK_WIDTH_MM, 0.62);
  if (oneLine >= LINK_MIN_MM) return { sizeMm: oneLine, lines: [link] };
  if (fitMm(slug, LINK_MIN_MM, LINK_WIDTH_MM, 0.62) >= LINK_MIN_MM) return { sizeMm: LINK_MIN_MM, lines: [link.slice(0, link.length - slug.length), slug] };
  const half = Math.ceil(link.length / 2);
  return { sizeMm: LINK_MIN_MM, lines: [link.slice(0, half), link.slice(half)] };
}
