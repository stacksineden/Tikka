import { describe, expect, it } from "vitest";
import { evaluateGuarantee, guaranteeDue, guaranteeMessage, type GuaranteeClaim, type GuaranteeInput } from "./guarantee";

const endsAt = "2026-11-01T21:00:00+01:00";
const after = new Date("2026-11-20T12:00:00+01:00");
const claim = (p: Partial<GuaranteeClaim> = {}): GuaranteeClaim => ({ kind: "drop", expiresAt: "2026-11-01T21:00:00+01:00", ...p });
const base: GuaranteeInput = {
  paidWith: "payment",
  guaranteeUsed: false,
  minRedemptions: 10,
  endsAt,
  claims: [claim({ redeemedAt: "2026-10-25T12:00:00+01:00" }), claim(), claim()],
  sourcesWithViews: 3,
  fromTemplate: true,
  ignoredWarnings: [],
};

describe("the guarantee", () => {
  it("is earned when every condition holds", () => {
    expect(evaluateGuarantee(base, after)).toEqual({ earned: true, redemptions: 1 });
    expect(guaranteeMessage("Medium drop")).toBe("Your drop brought fewer customers than we promised. Your next Medium drop is on us.");
  });

  it("is never earned for a drop that wasn't paid for", () => {
    expect(evaluateGuarantee({ ...base, paidWith: "voucher" }, after)).toMatchObject({ earned: false, reason: "not_paid" });
  });

  it("is once per business", () => {
    expect(evaluateGuarantee({ ...base, guaranteeUsed: true }, after)).toMatchObject({ earned: false, reason: "already_used" });
  });

  it("counts every redeemed Tikka from the drop, all tiers, but not bounce-backs", () => {
    const redeemed = Array.from({ length: 10 }, () => claim({ redeemedAt: "2026-10-25T12:00:00+01:00" }));
    expect(evaluateGuarantee({ ...base, claims: redeemed }, after)).toMatchObject({ earned: false, reason: "enough_customers", redemptions: 10 });
    const withBounce = [...redeemed.slice(0, 9), claim({ kind: "bounce_back", redeemedAt: "2026-11-10T12:00:00+01:00", expiresAt: "2026-12-01T00:00:00Z" })];
    expect(evaluateGuarantee({ ...base, claims: withBounce }, after)).toMatchObject({ earned: true, redemptions: 9 });
  });

  it("needs views from at least 3 sources, and a template or no ignored warnings", () => {
    expect(evaluateGuarantee({ ...base, sourcesWithViews: 2 }, after)).toMatchObject({ reason: "few_sources" });
    expect(evaluateGuarantee({ ...base, fromTemplate: false, ignoredWarnings: ["long_validity"] }, after)).toMatchObject({ reason: "ignored_warnings" });
    expect(evaluateGuarantee({ ...base, fromTemplate: false, ignoredWarnings: [] }, after)).toMatchObject({ earned: true });
    expect(evaluateGuarantee({ ...base, fromTemplate: true, ignoredWarnings: ["long_validity"] }, after)).toMatchObject({ earned: true });
  });

  it("waits until nothing from the drop can still be redeemed", () => {
    expect(guaranteeDue(base, new Date("2026-10-30T12:00:00+01:00"))).toBe(false);
    // A Tikka claimed on the last day that's still valid after the drop ends keeps the check waiting…
    const lastDay = claim({ expiresAt: "2026-11-15T21:00:00+01:00" });
    const input = { ...base, claims: [...base.claims, lastDay] };
    expect(guaranteeDue(input, new Date("2026-11-05T12:00:00+01:00"))).toBe(false);
    expect(evaluateGuarantee(input, new Date("2026-11-05T12:00:00+01:00"))).toMatchObject({ earned: false, reason: "not_due" });
    // …and if it's redeemed after the drop ended, it counts.
    const redeemedLate = { ...input, claims: [...base.claims, { ...lastDay, redeemedAt: "2026-11-06T12:00:00+01:00" }] };
    expect(guaranteeDue(redeemedLate, new Date("2026-11-06T13:00:00+01:00"))).toBe(true);
    expect(evaluateGuarantee(redeemedLate, new Date("2026-11-06T13:00:00+01:00"))).toEqual({ earned: true, redemptions: 2 });
    // Or once its own expiry passes.
    expect(guaranteeDue(input, new Date("2026-11-16T12:00:00+01:00"))).toBe(true);
  });

  it("is due early once the drop has ended and every claim is used or expired", () => {
    const allUsed = { ...base, claims: [claim({ redeemedAt: "2026-10-25T12:00:00+01:00", expiresAt: "2026-11-30T00:00:00Z" })] };
    expect(guaranteeDue(allUsed, new Date("2026-11-02T12:00:00+01:00"))).toBe(true);
  });
});
