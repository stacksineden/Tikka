// Pay per drop (TECH_PLAN §11, docs/REVENUE_PLAN.md item 2). Pure: tiers and packs come from the
// database (drop_tiers, drop_packs, read through lib/data.ts); this file only decides what a drop
// costs. The server prices every drop; the browser never sends an amount. One paid level ("Drop":
// ₦10,000, founding ₦5,000) for any drop up to 1,000 Tikkas; the old Small and Large tiers are
// switched off (`active: false`) but kept, so old drops and payments still read right.

import { count, naira } from "./format";
import { pickVoucher, type Voucher } from "./vouchers";

export interface DropTier {
  id: "free" | "small" | "medium" | "large" | (string & {});
  label: string;
  maxCards: number;
  priceKobo: number;
  /** What founding members pay for a single drop of this size, for life. */
  foundingPriceKobo: number;
  /** The guarantee: fewer redemptions than this earns a free drop of the same size. */
  guaranteeMinRedemptions: number | null;
  sort: number;
  /** Switched-off tiers (Small, Large) are never quoted; old drops on them still show. Default true. */
  active?: boolean;
}

export interface DropPack {
  id: string;
  tierId: string;
  drops: number;
  priceKobo: number;
  /** What founding members pay for the pack, when set. */
  foundingPriceKobo?: number | null;
  active: boolean;
}

/** The free first drop's tier (only ever used through the sign-up free drop). */
export const FREE_TIER_ID = "free";

export function koboToNaira(kobo: number): number {
  return kobo / 100;
}

export function priceLabel(kobo: number): string {
  return kobo === 0 ? "Free" : naira(koboToNaira(kobo));
}

/** Single-drop price, at the founding price for founding members. */
export function priceFor(tier: DropTier, founding: boolean): number {
  return founding ? tier.foundingPriceKobo : tier.priceKobo;
}

/** A season pack's price, at the founding price for founding members (when the pack has one). */
export function packPrice(pack: DropPack, founding: boolean): number {
  return founding && pack.foundingPriceKobo ? pack.foundingPriceKobo : pack.priceKobo;
}

/** The paid levels on sale (today, just "Drop"). */
export function paidTiers(tiers: DropTier[]): DropTier[] {
  return tiers.filter((t) => t.priceKobo > 0 && t.active !== false).sort((a, b) => a.maxCards - b.maxCards);
}

/** The one paid level on sale. */
export function paidTier(tiers: DropTier[]): DropTier | undefined {
  return paidTiers(tiers).at(-1);
}

/** The most Tikkas one drop can have without talking to Tikka (1,000). */
export function maxSelfServe(tiers: DropTier[]): number {
  return paidTier(tiers)?.maxCards ?? 1000;
}

/** "For more than 1,000 Tikkas in one drop, talk to us." */
export function overMaxLine(tiers: DropTier[]): string {
  return `For more than ${count(maxSelfServe(tiers))} Tikkas in one drop, talk to us.`;
}

export interface QuoteContext {
  vouchers: Voucher[];
  founding: boolean;
  now: Date;
}

export type DropQuote =
  /** Covered by one of the business's drops-without-paying (free first drop, season pack, earned, gifted). */
  | { kind: "voucher"; tier: DropTier; voucher: Voucher }
  /** A paid tier. `freeMax` when the free first drop is still there but the drop is too big for it. */
  | { kind: "paid"; tier: DropTier; amountKobo: number; freeMax?: number }
  /** Bigger than the largest tier: Tikka sets it up by hand. */
  | { kind: "contact"; maxSelfServe: number };

/**
 * Mirrors quote_drop(): use the smallest unused drop-without-paying that fits; otherwise the
 * smallest paid tier that fits, at the founding price for founding members. Over the largest
 * tier, talk to us.
 */
export function quoteDrop(tiers: DropTier[], ctx: QuoteContext, total: number): DropQuote {
  const paid = paidTiers(tiers);
  const largest = paid.at(-1)?.maxCards ?? 0;
  if (total > largest) return { kind: "contact", maxSelfServe: largest };
  const voucher = pickVoucher(ctx.vouchers, tiers, total, ctx.now);
  if (voucher) return { kind: "voucher", tier: tiers.find((t) => t.id === voucher.tierId)!, voucher };
  const tier = paid.find((t) => total <= t.maxCards)!;
  const free = tiers.find((t) => t.id === FREE_TIER_ID);
  const freeLeft = ctx.vouchers.some((v) => v.source === "signup" && !v.usedByDropId);
  return { kind: "paid", tier, amountKobo: priceFor(tier, ctx.founding), freeMax: freeLeft && free ? free.maxCards : undefined };
}

/** "Drop · ₦10,000" / "Free (your first drop)". Never a number of Tikkas next to a price. */
export function quoteLine(q: DropQuote): string {
  if (q.kind === "contact") return `For more than ${count(q.maxSelfServe)} Tikkas in one drop, talk to us`;
  if (q.kind === "voucher") return coveredBy(q.voucher);
  return `${q.tier.label} · ${priceLabel(q.amountKobo)}`;
}

/** How a covered drop reads, never "voucher". */
export function coveredBy(v: Pick<Voucher, "source">): string {
  switch (v.source) {
    case "signup":
      return "Free (your first drop)";
    case "pack":
      return "Covered by your season pack";
    case "guarantee":
      return "Free (the drop you earned)";
    case "admin":
      return "Free (a drop from Tikka)";
    case "paid":
      return "Already paid for";
  }
}

/** The publish button for a quote. */
export function publishLabel(q: DropQuote): string {
  if (q.kind === "voucher") return q.voucher.source === "pack" ? "Publish with your season pack" : "Publish free";
  if (q.kind === "paid") return `Pay ${priceLabel(q.amountKobo)} and publish`;
  return "Talk to us";
}

/** "If this drop brings fewer than 10 customers, your next one is free." Paid drops only. */
export function guaranteeLine(q: DropQuote): string | null {
  if (q.kind !== "paid" || !q.tier.guaranteeMinRedemptions) return null;
  return `If this drop brings fewer than ${count(q.tier.guaranteeMinRedemptions)} customers, your next one is free.`;
}

export type AddQuote = { kind: "free" } | { kind: "contact"; maxSelfServe: number };

/** How many Tikkas a live drop can grow to: 1,000, or its own size if an old Large drop is bigger. */
export function addCap(tiers: DropTier[], current: Pick<DropTier, "maxCards"> | undefined): number {
  return Math.max(current?.maxCards ?? 0, maxSelfServe(tiers));
}

/**
 * Mirrors add_tikkas(): adding to a live drop is free up to 1,000 Tikkas (or an old Large drop's
 * own size). Past that, talk to us. There's no paying between sizes any more.
 */
export function quoteAddTikkas(tiers: DropTier[], current: Pick<DropTier, "maxCards"> | undefined, currentTotal: number, extra: number): AddQuote {
  const cap = addCap(tiers, current);
  return currentTotal + extra <= cap ? { kind: "free" } : { kind: "contact", maxSelfServe: cap };
}

/** "₦10,000": the price of a drop (the cheapest paid level on sale; today there's one). */
export function fromPrice(tiers: DropTier[]): string {
  const cheapest = paidTiers(tiers).sort((a, b) => a.priceKobo - b.priceKobo)[0];
  return cheapest ? priceLabel(cheapest.priceKobo) : "";
}

/** "3 drops · ₦25,000 · ₦8,333 each · save ₦5,000", at the founding prices for founding members. */
export function packLine(pack: DropPack, tier: DropTier, founding = false): { title: string; price: string; saving: string | null } {
  const price = packPrice(pack, founding);
  const save = priceFor(tier, founding) * pack.drops - price;
  return {
    title: `${count(pack.drops)} drops`,
    price: priceLabel(price),
    saving: save > 0 ? `${priceLabel(Math.round(price / pack.drops))} each · save ${priceLabel(save)}` : null,
  };
}
