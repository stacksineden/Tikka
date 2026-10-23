// Drops a business can publish without paying (TECH_PLAN §3 drop_vouchers): the free first
// drop, season pack drops, a drop earned through the guarantee, and drops Tikka gives. One
// voucher pays for one drop up to its tier's size. The UI never says "voucher": the wording
// lives here.

import { count, dayMonthYear } from "./format";
import type { DropPack, DropTier } from "./pricing";

export type VoucherSource = "signup" | "pack" | "guarantee" | "admin";

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

/** The smallest usable voucher whose tier fits `total` Tikkas (ties: the one that expires first). */
export function pickVoucher(vouchers: Voucher[], tiers: DropTier[], total: number, now: Date): Voucher | null {
  const size = (v: Voucher) => tiers.find((t) => t.id === v.tierId)?.maxCards ?? 0;
  return (
    vouchers
      .filter((v) => usable(v, now) && size(v) >= total)
      .sort((a, b) => size(a) - size(b) || (a.expiresAt ?? "9999").localeCompare(b.expiresAt ?? "9999"))[0] ?? null
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
 * Plain lines for the owner: "Your first drop is free", "Drops left in your season pack:
 * 2 Small", "You've earned a free Medium drop", "Tikka gave you a free Small drop".
 */
export function voucherLines(vouchers: Voucher[], tiers: DropTier[], now: Date): string[] {
  const left = vouchers.filter((v) => usable(v, now));
  const name = (tierId: string) => tiers.find((t) => t.id === tierId)?.label.replace(/ drop$/, "") ?? tierId;
  const lines: string[] = [];
  if (left.some((v) => v.source === "signup")) lines.push(`Your first drop is free (up to ${count(tiers.find((t) => t.id === "free")?.maxCards ?? 200)} Tikkas)`);
  const packs = left.filter((v) => v.source === "pack");
  if (packs.length) {
    const byTier = new Map<string, number>();
    for (const v of packs) byTier.set(v.tierId, (byTier.get(v.tierId) ?? 0) + 1);
    const soonest = packs.map((v) => v.expiresAt!).sort()[0];
    lines.push(
      `Drops left in your season pack: ${[...byTier].map(([t, n]) => `${count(n)} ${name(t)}`).join(", ")} (use by ${dayMonthYear(soonest)})`,
    );
  }
  for (const v of left.filter((x) => x.source === "guarantee")) lines.push(`You've earned a free ${name(v.tierId)} drop`);
  for (const v of left.filter((x) => x.source === "admin")) lines.push(`Tikka gave you a free ${name(v.tierId)} drop${v.expiresAt ? ` (use by ${dayMonthYear(v.expiresAt)})` : ""}`);
  return lines;
}

/** How many drops the business can publish without paying. */
export function dropsReady(vouchers: Voucher[], now: Date): number {
  return vouchers.filter((v) => usable(v, now)).length;
}
