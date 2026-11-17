// Drops a business can publish without paying (TECH_PLAN §3 drop_vouchers): the free first
// drop, season pack drops, a drop earned through the guarantee, and drops Tikka gives. One
// voucher pays for one drop up to its tier's size. The UI never says "voucher": the wording
// lives here.

import { count, dayMonthYear } from "./format";
import type { DropPack, DropTier } from "./pricing";

/** "paid": a drop paid for that couldn't go out when the money arrived (complete_payment). */
export type VoucherSource = "signup" | "pack" | "guarantee" | "admin" | "paid";

export interface Voucher {
  id: string;
  businessId: string;
  tierId: string;
  source: VoucherSource;
  packPaymentId?: string;
  usedByDropId?: string;
  /** Pack drops expire 12 months after purchase; others never, unless Tikka set a date. */
  expiresAt?: string;
  createdAt: string;
  usedAt?: string;
}

export const PACK_MONTHS = 12;

export function usable(v: Voucher, now: Date): boolean {
  return !v.usedByDropId && (!v.expiresAt || new Date(v.expiresAt) > now);
}

/**
 * The usable voucher that fits `total` Tikkas: the free first drop first, then the smallest, then
 * the one that expires first. Mirrors private.pick_voucher().
 */
export function pickVoucher(vouchers: Voucher[], tiers: DropTier[], total: number, now: Date): Voucher | null {
  const size = (v: Voucher) => tiers.find((t) => t.id === v.tierId)?.maxCards ?? 0;
  const first = (v: Voucher) => (v.source === "signup" ? 0 : 1);
  return (
    vouchers
      .filter((v) => usable(v, now) && size(v) >= total)
      .sort((a, b) => first(a) - first(b) || size(a) - size(b) || (a.expiresAt ?? "9999").localeCompare(b.expiresAt ?? "9999"))[0] ?? null
  );
}

function id(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** Every new business gets its first drop free. */
export function signupVoucher(businessId: string, now: Date): Voucher {
  return { id: id("vch"), businessId, tierId: "free", source: "signup", createdAt: now.toISOString() };
}

/** A paid season pack: one drop per pack drop, usable for 12 months. */
export function packVouchers(pack: DropPack, businessId: string, paymentId: string, now: Date): Voucher[] {
  const expires = new Date(now);
  expires.setMonth(expires.getMonth() + PACK_MONTHS);
  return Array.from({ length: pack.drops }, () => ({
    id: id("vch"),
    businessId,
    tierId: pack.tierId,
    source: "pack" as const,
    packPaymentId: paymentId,
    expiresAt: expires.toISOString(),
    createdAt: now.toISOString(),
  }));
}

/** The guarantee's free drop: the same size, never expires. */
export function guaranteeVoucher(businessId: string, tierId: string, now: Date): Voucher {
  return { id: id("vch"), businessId, tierId, source: "guarantee", createdAt: now.toISOString() };
}

/** A drop Tikka gives (pilot and done-for-you businesses); optional expiry. */
export function adminVoucher(businessId: string, tierId: string, now: Date, expiresAt?: string): Voucher {
  return { id: id("vch"), businessId, tierId, source: "admin", expiresAt, createdAt: now.toISOString() };
}

/**
 * Plain lines for the owner: "Your first drop is free", "Drops left in your season pack: 2",
 * "You've earned a free drop", "Tikka gave you a free drop". No sizes: every drop is one price.
 */
export function voucherLines(vouchers: Voucher[], now: Date): string[] {
  const left = vouchers.filter((v) => usable(v, now));
  const lines: string[] = [];
  if (left.some((v) => v.source === "signup")) lines.push("Your first drop is free");
  const packs = left.filter((v) => v.source === "pack");
  if (packs.length) {
    const soonest = packs.map((v) => v.expiresAt!).sort()[0];
    lines.push(`Drops left in your season pack: ${count(packs.length)} (use by ${dayMonthYear(soonest)})`);
  }
  lines.push(...left.filter((x) => x.source === "guarantee").map(() => "You've earned a free drop"));
  for (const v of left.filter((x) => x.source === "admin")) lines.push(`Tikka gave you a free drop${v.expiresAt ? ` (use by ${dayMonthYear(v.expiresAt)})` : ""}`);
  lines.push(...left.filter((x) => x.source === "paid").map(() => "A drop you've already paid for"));
  return lines;
}

/** How many drops the business can publish without paying. */
export function dropsReady(vouchers: Voucher[], now: Date): number {
  return vouchers.filter((v) => usable(v, now)).length;
}
