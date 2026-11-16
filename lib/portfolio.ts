// Portfolio collections (PRD A5). Pure rules shared by the editor, the business page, the demo
// store and the tests. The database decides for real accounts (portfolio_plan(), the limits and
// the collection functions in supabase/migrations/20261116130000_portfolio_collections.sql);
// this mirrors it for the demo and for what the screens say.

import { shortDate } from "./format";
import { bookingNumber, priceText } from "./page";
import type { Business, Drop, PortfolioCollection, PortfolioPhoto, ServiceItem } from "./types";
import type { Voucher } from "./vouchers";

/** The free page: one grid. */
export const PORTFOLIO_FREE = { items: 20, videos: 3, collections: 0 } as const;
/** With a paid drop. */
export const PORTFOLIO_OPEN = { items: 60, videos: 8, collections: 8 } as const;
/** Collections stay open this many days after a paid drop ends. */
export const OPEN_DAYS_AFTER = 7;
export const COLLECTION_NAME_MAX = 30;

export interface PortfolioPlan {
  open: boolean;
  /** Why it's open: a founding member, a season pack waiting to be used, or a paid drop. */
  reason?: "founding" | "pack" | "drop";
  /** When it closes (a paid drop: 7 days after it ends). None while there's no date yet. */
  until?: string;
  items: number;
  videos: number;
  collections: number;
}

const closed: PortfolioPlan = { open: false, ...PORTFOLIO_FREE };
const opened = (reason: PortfolioPlan["reason"], until?: string): PortfolioPlan => ({ open: true, reason, until, ...PORTFOLIO_OPEN });

/**
 * Is the portfolio open? A founding member; or a season pack (or a paid drop that couldn't go
 * out) still waiting to be used; or a drop that wasn't the free first one, from publishing until
 * 7 days after it ends. Mirrors private.portfolio_window().
 */
export function portfolioPlan(input: {
  founding: boolean;
  vouchers: Pick<Voucher, "id" | "source" | "usedByDropId" | "expiresAt">[];
  drops: Pick<Drop, "id" | "status" | "endsAt" | "paidWith">[];
  now: Date;
}): PortfolioPlan {
  const { founding, vouchers, drops, now } = input;
  if (founding) return opened("founding");
  const waiting = vouchers.some((v) => (v.source === "pack" || v.source === "paid") && !v.usedByDropId && (!v.expiresAt || new Date(v.expiresAt) > now));
  if (waiting) return opened("pack");
  const paidFor = (d: Pick<Drop, "id" | "paidWith">) => {
    if (d.paidWith === "payment") return true;
    const used = vouchers.find((v) => v.usedByDropId === d.id);
    return d.paidWith === "voucher" && !!used && used.source !== "signup";
  };
  const ends = drops.filter((d) => d.status !== "draft" && paidFor(d)).map((d) => new Date(d.endsAt).getTime());
  if (!ends.length) return closed;
  const until = new Date(Math.max(...ends) + OPEN_DAYS_AFTER * 24 * 60 * 60 * 1000);
  return until > now ? opened("drop", until.toISOString()) : closed;
}

/** "Bridal & Gele" → "bridal-gele"; "-2", "-3" when the business already has one. Mirrors private.collection_slug(). */
export function collectionSlug(name: string, taken: string[] = []): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 27)
      .replace(/-+$/g, "") || "collection";
  let slug = base;
  for (let n = 2; taken.includes(slug); n++) slug = `${base}-${n}`;
  return slug;
}

const GAMBLING = /\b(win|wins|winner|winning|luck|lucky|jackpot|odds|bet|stake|lottery|raffle|prize draw)\b/i;

/** What's wrong with a collection name, in the owner's words. */
export function collectionNameProblem(name: string, others: string[] = []): string | null {
  const n = name.trim();
  if (!n) return "Give it a name, like Bridal.";
  if (n.length > COLLECTION_NAME_MAX) return `Keep it under ${COLLECTION_NAME_MAX} characters.`;
  if (GAMBLING.test(n)) return "Avoid words like win or luck.";
  if (others.some((o) => o.trim().toLowerCase() === n.toLowerCase())) return "You already have one with that name.";
  return null;
}

export interface ShownCollection extends PortfolioCollection {
  photos: PortfolioPhoto[];
  cover: PortfolioPhoto;
  /** The service its Book button asks for, when it still exists. */
  service?: ServiceItem;
}

/**
 * What the business page shows: collections that hold something (in the owner's order, each
 * with its cover), and the photos in none of them. With no collections, everything is `rest`.
 */
export function portfolioView(b: Pick<Business, "portfolio" | "collections" | "services">): { collections: ShownCollection[]; rest: PortfolioPhoto[] } {
  const known = new Set((b.collections ?? []).map((c) => c.id));
  const collections = (b.collections ?? []).flatMap((c): ShownCollection[] => {
    const photos = b.portfolio.filter((p) => p.collectionId === c.id);
    if (!photos.length) return [];
    const cover = photos.find((p) => p.id === c.coverId) ?? photos[0];
    return [{ ...c, photos, cover, service: b.services.find((s) => s.name.trim().toLowerCase() === c.serviceName?.trim().toLowerCase()) }];
  });
  return { collections, rest: b.portfolio.filter((p) => !p.collectionId || !known.has(p.collectionId)) };
}

/** Under a cover: "14 looks · from ₦150,000". */
export function collectionLine(c: ShownCollection): string {
  const n = c.photos.length;
  const price = c.service && c.service.priceKind !== "ask" && c.service.price !== null ? priceText(c.service).replace(/^From /, "from ") : null;
  return [`${n} ${n === 1 ? "photo" : "photos"}`, price].filter(Boolean).join(" · ");
}

/** "Hi Maril Kay, I saw your Bridal work on Tikka and I'd like to book Bridal makeup (From ₦150,000)." */
export function collectionBookingLink(b: Pick<Business, "name" | "actions" | "ownerWhatsapp">, c: Pick<ShownCollection, "name" | "service">): string | null {
  const n = bookingNumber(b);
  if (!n) return null;
  const s = c.service;
  const what = s ? `${s.name}${s.priceKind === "ask" || s.price === null ? "" : ` (${priceText(s)})`}` : "an appointment";
  return `https://wa.me/${n.slice(1)}?text=${encodeURIComponent(`Hi ${b.name}, I saw your ${c.name} work on Tikka and I'd like to book ${what}.`)}`;
}

/** The editor's banner: what the owner has right now, in plain words. */
export function planMessage(plan: PortfolioPlan, used: { items: number; collections: number }): { tone: "open" | "free" | "locked"; title: string; body: string } {
  if (plan.open) {
    const title =
      plan.reason === "founding" ? "Collections are open" : plan.until ? `Collections are open till ${shortDate(plan.until)}` : "Collections are open all season";
    const body =
      plan.reason === "founding"
        ? "A founding member thank-you. Sort your work into collections, each with its own link."
        : plan.until
          ? `Add and sort your work until ${OPEN_DAYS_AFTER} days after your drop ends.`
          : "Your season pack keeps them open. Add and sort your work any time.";
    return { tone: "open", title, body };
  }
  if (used.collections > 0 || used.items > plan.items) {
    return {
      tone: "locked",
      title: "Your collections are locked",
      body: "Your page stays exactly as it is, and your links still work. Run a drop to add, move and rename again. You can still remove photos.",
    };
  }
  return {
    tone: "free",
    title: `Free page: one grid of ${plan.items} photos`,
    body: `Run a paid drop to get ${PORTFOLIO_OPEN.items} photos and sort them into collections like Bridal or Gele, each with its own link and Book button.`,
  };
}
