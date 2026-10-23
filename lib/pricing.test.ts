import { describe, expect, it } from "vitest";
import { coveredBy, fromPrice, guaranteeLine, packLine, publishLabel, quoteAddTikkas, quoteDrop, quoteLine, type DropPack, type DropTier } from "./pricing";
import { signupVoucher, type Voucher } from "./vouchers";

const TIERS: DropTier[] = [
  { id: "free", label: "First drop", maxCards: 200, priceKobo: 0, foundingPriceKobo: 0, guaranteeMinRedemptions: null, sort: 0 },
  { id: "small", label: "Small drop", maxCards: 300, priceKobo: 500_000, foundingPriceKobo: 400_000, guaranteeMinRedemptions: 5, sort: 1 },
  { id: "medium", label: "Medium drop", maxCards: 1000, priceKobo: 1_000_000, foundingPriceKobo: 800_000, guaranteeMinRedemptions: 10, sort: 2 },
  { id: "large", label: "Large drop", maxCards: 3000, priceKobo: 2_000_000, foundingPriceKobo: 1_600_000, guaranteeMinRedemptions: 20, sort: 3 },
];
const tier = (id: string) => TIERS.find((t) => t.id === id)!;
const now = new Date("2026-10-21T12:00:00+01:00");
const fresh = { vouchers: [signupVoucher("b1", now)], founding: false, now };
const usedUp = { vouchers: [] as Voucher[], founding: false, now };

describe("quoteDrop", () => {
  it("covers a first drop of up to 200 Tikkas with the free drop", () => {
    const q = quoteDrop(TIERS, fresh, 200);
    expect(q).toMatchObject({ kind: "voucher", tier: { id: "free" }, voucher: { source: "signup" } });
    expect(quoteLine(q, 200)).toBe("200 Tikkas · Free (your first drop)");
    expect(publishLabel(q)).toBe("Publish free");
    expect(guaranteeLine(q)).toBeNull();
  });

  it("charges once the free drop is used, at the smallest tier that fits", () => {
    expect(quoteDrop(TIERS, usedUp, 150)).toMatchObject({ kind: "paid", tier: { id: "small" }, amountKobo: 500_000 });
    expect(quoteDrop(TIERS, usedUp, 301)).toMatchObject({ tier: { id: "medium" } });
    const q = quoteDrop(TIERS, usedUp, 600);
    expect(quoteLine(q, 600)).toBe("600 Tikkas · Medium drop · ₦10,000");
    expect(publishLabel(q)).toBe("Pay ₦10,000 and publish");
    expect(guaranteeLine(q)).toBe("If this drop brings fewer than 10 customers, your next one is free.");
  });

  it("keeps the free drop for later when a first drop is bigger, and says it's there", () => {
    expect(quoteDrop(TIERS, fresh, 600)).toMatchObject({ kind: "paid", tier: { id: "medium" }, freeMax: 200 });
    expect(quoteDrop(TIERS, usedUp, 600)).not.toHaveProperty("freeMax", expect.anything());
  });

  it("gives founding members the founding price on single drops", () => {
    expect(quoteDrop(TIERS, { ...usedUp, founding: true }, 600)).toMatchObject({ amountKobo: 800_000 });
  });

  it("uses the smallest drop-without-paying that fits", () => {
    const vouchers: Voucher[] = [
      { id: "m", businessId: "b1", tierId: "medium", source: "pack", createdAt: "x", expiresAt: "2027-10-01T00:00:00Z" },
      { id: "s", businessId: "b1", tierId: "small", source: "pack", createdAt: "x", expiresAt: "2027-10-01T00:00:00Z" },
    ];
    const ctx = { vouchers, founding: false, now };
    expect(quoteDrop(TIERS, ctx, 250)).toMatchObject({ kind: "voucher", voucher: { id: "s" } });
    expect(quoteDrop(TIERS, ctx, 900)).toMatchObject({ kind: "voucher", voucher: { id: "m" }, tier: { id: "medium" } });
    expect(publishLabel(quoteDrop(TIERS, ctx, 250))).toBe("Publish with your season pack");
    expect(quoteDrop(TIERS, ctx, 1200)).toMatchObject({ kind: "paid", tier: { id: "large" } });
  });

  it("can't self-publish over 3,000", () => {
    expect(quoteDrop(TIERS, fresh, 3001)).toEqual({ kind: "contact", maxSelfServe: 3000 });
    expect(quoteLine(quoteDrop(TIERS, usedUp, 5000), 5000)).toBe("For drops over 3,000 Tikkas, talk to us");
  });

  it("never says voucher", () => {
    for (const s of ["signup", "pack", "guarantee", "admin"] as const) expect(coveredBy({ source: s }).toLowerCase()).not.toContain("voucher");
  });
});

describe("quoteAddTikkas", () => {
  it("is free while the new total fits the tier", () => {
    expect(quoteAddTikkas(TIERS, tier("medium"), 600, 400)).toEqual({ kind: "free" });
  });

  it("charges the difference to the next tier", () => {
    expect(quoteAddTikkas(TIERS, tier("medium"), 600, 500)).toEqual({ kind: "upgrade", from: tier("medium"), to: tier("large"), amountKobo: 1_000_000 });
  });

  it("makes a drop covered without paying pay the full price of its new tier", () => {
    expect(quoteAddTikkas(TIERS, tier("free"), 200, 50)).toMatchObject({ to: { id: "small" }, amountKobo: 500_000 });
    expect(quoteAddTikkas(TIERS, tier("small"), 300, 100, { paidWithVoucher: true, founding: false })).toMatchObject({ to: { id: "medium" }, amountKobo: 1_000_000 });
  });

  it("stops at the largest tier", () => {
    expect(quoteAddTikkas(TIERS, tier("large"), 2900, 200)).toEqual({ kind: "contact", maxSelfServe: 3000 });
  });
});

it("reads 'from' the cheapest paid tier and describes packs", () => {
  expect(fromPrice(TIERS)).toBe("₦5,000");
  const pack: DropPack = { id: "small3", tierId: "small", drops: 3, priceKobo: 1_200_000, active: true };
  expect(packLine(pack, tier("small"))).toEqual({ title: "3 Small drops", price: "₦12,000", saving: "₦4,000 each · save ₦3,000" });
});
