// Pay per drop (TECH_PLAN §11). Pure: tiers and packs come from the database (drop_tiers,
// drop_packs, read through lib/data.ts); this file only decides what a drop costs. The server
// prices every drop; the browser never sends an amount.

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
}

export interface DropPack {
  id: string;
  tierId: string;
  drops: number;
  priceKobo: number;
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

/** Single-drop price. Founding prices apply to single drops only, never to packs. */
export function priceFor(tier: DropTier, founding: boolean): number {
  return founding ? tier.foundingPriceKobo : tier.priceKobo;
}

export function paidTiers(tiers: DropTier[]): DropTier[] {
  return tiers.filter((t) => t.priceKobo > 0).sort((a, b) => a.maxCards - b.maxCards);
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

/** "600 Tikkas · Medium drop · ₦10,000" / "200 Tikkas · Free (your first drop)". */
export function quoteLine(q: DropQuote, total: number): string {
  if (q.kind === "contact") return `For drops over ${count(q.maxSelfServe)} Tikkas, talk to us`;
  if (q.kind === "voucher") return `${count(total)} Tikkas · ${coveredBy(q.voucher)}`;
  return `${count(total)} Tikkas · ${q.tier.label} · ${priceLabel(q.amountKobo)}`;
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

export type AddQuote =
  | { kind: "free" }
  | { kind: "upgrade"; from: DropTier; to: DropTier; amountKobo: number }
  | { kind: "contact"; maxSelfServe: number };

/**
 * Mirrors add_tikkas(): adding to a live drop is free while the new total fits the drop's tier;
 * otherwise pay the difference to the tier that fits. A drop that was covered without paying
 * (free, season pack, earned or gifted) pays the full price of the new tier.
 */
export function quoteAddTikkas(
  tiers: DropTier[],
  current: DropTier,
  currentTotal: number,
  extra: number,
  opts: { paidWithVoucher: boolean; founding: boolean } = { paidWithVoucher: false, founding: false },
): AddQuote {
  const total = currentTotal + extra;
  if (total <= current.maxCards) return { kind: "free" };
  const to = paidTiers(tiers).find((t) => total <= t.maxCards);
  if (!to) return { kind: "contact", maxSelfServe: paidTiers(tiers).at(-1)?.maxCards ?? 0 };
  const newPrice = priceFor(to, opts.founding);
  const amountKobo = opts.paidWithVoucher || current.priceKobo === 0 ? newPrice : Math.max(0, newPrice - priceFor(current, opts.founding));
  return { kind: "upgrade", from: current, to, amountKobo };
}

/** "from ₦5,000": the cheapest paid tier. */
export function fromPrice(tiers: DropTier[]): string {
  const cheapest = paidTiers(tiers).sort((a, b) => a.priceKobo - b.priceKobo)[0];
  return cheapest ? priceLabel(cheapest.priceKobo) : "";
}

/** "3 Small drops · ₦12,000 · ₦4,000 each (save ₦3,000)". */
export function packLine(pack: DropPack, tier: DropTier): { title: string; price: string; saving: string | null } {
  const single = tier.priceKobo * pack.drops;
  const save = single - pack.priceKobo;
  return {
    title: `${count(pack.drops)} ${tier.label.replace(/ drop$/, "")} drops`,
    price: priceLabel(pack.priceKobo),
    saving: save > 0 ? `${priceLabel(Math.round(pack.priceKobo / pack.drops))} each · save ${priceLabel(save)}` : null,
  };
}
