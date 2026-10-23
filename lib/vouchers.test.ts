import { describe, expect, it } from "vitest";
import type { DropPack, DropTier } from "./pricing";
import { adminVoucher, dropsReady, guaranteeVoucher, packVouchers, pickVoucher, signupVoucher, usable, voucherLines } from "./vouchers";

const TIERS = [
  { id: "free", label: "First drop", maxCards: 200 },
  { id: "small", label: "Small drop", maxCards: 300 },
  { id: "medium", label: "Medium drop", maxCards: 1000 },
] as DropTier[];
const now = new Date("2026-10-21T12:00:00+01:00");

describe("drops without paying", () => {
  it("gives every new business one free first drop that never expires", () => {
    const v = signupVoucher("b1", now);
    expect(v).toMatchObject({ tierId: "free", source: "signup" });
    expect(v.expiresAt).toBeUndefined();
    expect(usable(v, new Date("2030-01-01"))).toBe(true);
  });

  it("makes a season pack's drops, usable for 12 months", () => {
    const pack: DropPack = { id: "medium3", tierId: "medium", drops: 3, priceKobo: 2_500_000, active: true };
    const vs = packVouchers(pack, "b1", "pay_1", now);
    expect(vs).toHaveLength(3);
    expect(new Set(vs.map((v) => v.id)).size).toBe(3);
    expect(vs.every((v) => v.source === "pack" && v.tierId === "medium" && v.packPaymentId === "pay_1")).toBe(true);
    expect(vs[0].expiresAt!.slice(0, 7)).toBe("2027-10");
    expect(usable(vs[0], new Date("2027-11-01"))).toBe(false);
  });

  it("never uses a used or expired one", () => {
    const used = { ...signupVoucher("b1", now), usedByDropId: "d1" };
    const expired = adminVoucher("b1", "small", now, "2026-10-01T00:00:00Z");
    expect(pickVoucher([used, expired], TIERS, 100, now)).toBeNull();
    expect(adminVoucher("b1", "small", now).expiresAt).toBeUndefined();
  });

  it("speaks plainly, never 'voucher'", () => {
    const pack: DropPack = { id: "small3", tierId: "small", drops: 3, priceKobo: 1_200_000, active: true };
    const vs = [signupVoucher("b1", now), ...packVouchers(pack, "b1", "p", now).slice(0, 2), guaranteeVoucher("b1", "medium", now), adminVoucher("b1", "small", now)];
    const lines = voucherLines(vs, TIERS, now);
    expect(lines[0]).toBe("Your first drop is free (up to 200 Tikkas)");
    expect(lines[1]).toMatch(/^Drops left in your season pack: 2 Small \(use by \d+ Oct \d{4}\)$/);
    expect(lines).toContain("You've earned a free Medium drop");
    expect(lines).toContain("Tikka gave you a free Small drop");
    expect(lines.join(" ").toLowerCase()).not.toContain("voucher");
    expect(dropsReady(vs, now)).toBe(5);
  });
});
