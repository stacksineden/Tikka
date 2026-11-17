import { describe, expect, it } from "vitest";
import {
  addCap,
  coveredBy,
  fromPrice,
  guaranteeLine,
  maxSelfServe,
  overMaxLine,
  packLine,
  packPrice,
  paidTiers,
  publishLabel,
  quoteAddTikkas,
  quoteDrop,
  quoteLine,
  type DropPack,
  type DropTier,
} from "./pricing";
import { signupVoucher, type Voucher } from "./vouchers";

// Flat pricing (docs/REVENUE_PLAN.md item 2): one paid level for any drop up to 1,000 Tikkas.
// Small and Large are switched off but kept, so old drops and payments still read right.
const TIERS: DropTier[] = [
  { id: "free", label: "First drop", maxCards: 1000, priceKobo: 0, foundingPriceKobo: 0, guaranteeMinRedemptions: null, sort: 0, active: true },
  { id: "medium", label: "Drop", maxCards: 1000, priceKobo: 1_000_000, foundingPriceKobo: 500_000, guaranteeMinRedemptions: 10, sort: 1, active: true },
  { id: "small", label: "Small drop", maxCards: 300, priceKobo: 500_000, foundingPriceKobo: 500_000, guaranteeMinRedemptions: 5, sort: 2, active: false },
  { id: "large", label: "Large drop", maxCards: 3000, priceKobo: 2_000_000, foundingPriceKobo: 2_000_000, guaranteeMinRedemptions: 20, sort: 3, active: false },
];
const tier = (id: string) => TIERS.find((t) => t.id === id)!;
const now = new Date("2026-11-17T12:00:00+01:00");
const fresh = { vouchers: [signupVoucher("b1", now)], founding: false, now };
const usedUp = { vouchers: [] as Voucher[], founding: false, now };

describe("quoteDrop", () => {
  it("covers a first drop of any size up to 1,000 with the free drop", () => {
    for (const n of [40, 200, 900, 1000]) expect(quoteDrop(TIERS, fresh, n)).toMatchObject({ kind: "voucher", tier: { id: "free" }, voucher: { source: "signup" } });
    const q = quoteDrop(TIERS, fresh, 40);
    expect(quoteLine(q)).toBe("Free (your first drop)");
    expect(publishLabel(q)).toBe("Publish free");
    expect(guaranteeLine(q)).toBeNull();
  });

  it("charges the same for 40 Tikkas or 900 once the free drop is used", () => {
    for (const n of [40, 300, 900, 1000]) expect(quoteDrop(TIERS, usedUp, n)).toMatchObject({ kind: "paid", tier: { id: "medium" }, amountKobo: 1_000_000 });
    const q = quoteDrop(TIERS, usedUp, 600);
    expect(quoteLine(q)).toBe("Drop · ₦10,000");
    expect(publishLabel(q)).toBe("Pay ₦10,000 and publish");
    expect(guaranteeLine(q)).toBe("If this drop brings fewer than 10 customers, your next one is free.");
  });

  it("never puts a number of Tikkas next to a price", () => {
    for (const q of [quoteDrop(TIERS, fresh, 300), quoteDrop(TIERS, usedUp, 300), quoteDrop(TIERS, { ...usedUp, founding: true }, 300)]) {
      expect(quoteLine(q)).not.toMatch(/\d+ Tikkas/);
    }
  });

  it("gives founding members ₦5,000 a drop", () => {
    expect(quoteDrop(TIERS, { ...usedUp, founding: true }, 40)).toMatchObject({ amountKobo: 500_000 });
    expect(quoteDrop(TIERS, { ...usedUp, founding: true }, 900)).toMatchObject({ amountKobo: 500_000 });
  });

  it("uses the free first drop before a pack, then the pack", () => {
    const pack: Voucher = { id: "p", businessId: "b1", tierId: "medium", source: "pack", createdAt: "x", expiresAt: "2027-01-01T00:00:00Z" };
    expect(quoteDrop(TIERS, { ...fresh, vouchers: [pack, ...fresh.vouchers] }, 300)).toMatchObject({ voucher: { source: "signup" } });
    const q = quoteDrop(TIERS, { ...usedUp, vouchers: [pack] }, 300);
    expect(q).toMatchObject({ kind: "voucher", voucher: { id: "p" } });
    expect(publishLabel(q)).toBe("Publish with your season pack");
  });

  it("never quotes the switched-off sizes", () => {
    expect(paidTiers(TIERS).map((t) => t.id)).toEqual(["medium"]);
    expect(quoteDrop(TIERS, usedUp, 100)).not.toMatchObject({ tier: { id: "small" } });
  });

  it("can't self-publish over 1,000", () => {
    expect(quoteDrop(TIERS, fresh, 1001)).toEqual({ kind: "contact", maxSelfServe: 1000 });
    expect(quoteLine(quoteDrop(TIERS, usedUp, 5000))).toBe("For more than 1,000 Tikkas in one drop, talk to us");
    expect(overMaxLine(TIERS)).toBe("For more than 1,000 Tikkas in one drop, talk to us.");
    expect(maxSelfServe(TIERS)).toBe(1000);
  });

  it("never says voucher", () => {
    for (const s of ["signup", "pack", "guarantee", "admin", "paid"] as const) expect(coveredBy({ source: s }).toLowerCase()).not.toContain("voucher");
  });
});

describe("quoteAddTikkas", () => {
  it("is free up to 1,000, whatever the drop's old size", () => {
    expect(quoteAddTikkas(TIERS, tier("free"), 200, 800)).toEqual({ kind: "free" });
    expect(quoteAddTikkas(TIERS, tier("small"), 300, 500)).toEqual({ kind: "free" });
    expect(quoteAddTikkas(TIERS, undefined, 100, 900)).toEqual({ kind: "free" });
  });

  it("past 1,000, talk to us (an old Large drop keeps its own size)", () => {
    expect(quoteAddTikkas(TIERS, tier("medium"), 900, 101)).toEqual({ kind: "contact", maxSelfServe: 1000 });
    expect(addCap(TIERS, tier("large"))).toBe(3000);
    expect(quoteAddTikkas(TIERS, tier("large"), 2900, 100)).toEqual({ kind: "free" });
  });
});

it("reads the one price and describes the pack, at founding prices for founding members", () => {
  expect(fromPrice(TIERS)).toBe("₦10,000");
  const pack: DropPack = { id: "medium3", tierId: "medium", drops: 3, priceKobo: 2_500_000, foundingPriceKobo: 1_200_000, active: true };
  expect(packLine(pack, tier("medium"))).toEqual({ title: "3 drops", price: "₦25,000", saving: "₦8,333 each · save ₦5,000" });
  expect(packLine(pack, tier("medium"), true)).toEqual({ title: "3 drops", price: "₦12,000", saving: "₦4,000 each · save ₦3,000" });
  expect(packPrice(pack, true)).toBe(1_200_000);
  expect(packPrice({ ...pack, foundingPriceKobo: null }, true)).toBe(2_500_000);
});
