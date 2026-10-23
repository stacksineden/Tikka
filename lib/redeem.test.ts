import { describe, expect, it } from "vitest";
import { addRating, bounceBackFor, checkClaim, confirmClaim, displayName, offlineCheck, reviewState, validateReview, type ClaimRecord } from "./redeem";

const now = new Date("2026-10-21T12:00:00+01:00");

const claim: ClaimRecord = {
  token: "t1",
  dropId: "drop_oct",
  ownerId: "owner_a",
  claimedAt: "2026-10-20T10:00:00+01:00",
  lastInitial: "O",
  card: {
    token: "t1",
    tier: "rare",
    reward: "20% off any service",
    code: "GS-7X4QX",
    serial: "0412",
    total: 600,
    claimer: "Adaeze",
    expiresAt: "2026-10-31T21:00:00+01:00",
  },
};
const action: ClaimRecord = {
  ...claim,
  token: "t2",
  card: { ...claim.card, token: "t2", code: "GS-T9RWR", reward: "Free brow tint", action: "Follow @glowstudio on Instagram" },
};
const by = "staff_1";

describe("check_code", () => {
  it("is valid, shows first name and initial, and never changes the claim", () => {
    const before = structuredClone(claim);
    const r = checkClaim(claim, "owner_a", "GS-7X4QX", now);
    expect(r).toMatchObject({ kind: "valid", name: "Adaeze O.", reward: "20% off any service", tier: "rare" });
    expect(JSON.stringify(r)).not.toMatch(/\+?234|080/);
    expect(claim).toEqual(before);
  });

  it("gives one reason when it's not valid", () => {
    expect(checkClaim(undefined, "owner_a", "GS-AAAAA", now).kind).toBe("unknown");
    expect(checkClaim(claim, "owner_b", "GS-7X4QX", now).kind).toBe("wrong_business");
    expect(checkClaim({ ...claim, redeemedAt: "2026-10-20T14:14:00+01:00" }, "owner_a", "GS-7X4QX", now)).toEqual({
      kind: "already_used",
      code: "GS-7X4QX",
      at: "2026-10-20T14:14:00+01:00",
    });
    expect(checkClaim({ ...claim, card: { ...claim.card, expiresAt: "2026-10-01T21:00:00+01:00" } }, "owner_a", "GS-7X4QX", now).kind).toBe("expired");
  });

  it("catches typos offline", () => {
    expect(offlineCheck("gs 7x4qx")).toEqual({ ok: true, code: "GS-7X4QX" });
    expect(offlineCheck("GS-7X4QA")).toEqual({ ok: false, result: { kind: "typo", code: "GS-7X4QA" } });
    expect(offlineCheck("hello")).toMatchObject({ ok: false, result: { kind: "unknown" } });
  });
});

describe("confirm_redemption", () => {
  it("marks the claim used with the bill and who did it", () => {
    const r = confirmClaim(claim, "owner_a", "GS-7X4QX", { billKobo: 2_500_000, actionConfirmed: false, by }, now);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.claim).toMatchObject({ redeemedAt: now.toISOString(), billKobo: 2_500_000, redeemedBy: by });
  });

  it("two confirms of the same code: one success", () => {
    let record: ClaimRecord | undefined = claim;
    const results = [0, 1].map(() => {
      const r = confirmClaim(record, "owner_a", "GS-7X4QX", { actionConfirmed: false, by }, now);
      if (r.ok) record = r.claim;
      return r.ok;
    });
    expect(results).toEqual([true, false]);
  });

  it("needs the staff tick for action cards", () => {
    expect(confirmClaim(action, "owner_a", "GS-T9RWR", { actionConfirmed: false, by }, now)).toEqual({
      ok: false,
      result: { kind: "needs_action", code: "GS-T9RWR" },
    });
    expect(confirmClaim(action, "owner_a", "GS-T9RWR", { actionConfirmed: true, by }, now).ok).toBe(true);
  });

  it("never confirms a code that isn't valid", () => {
    expect(confirmClaim(claim, "owner_b", "GS-7X4QX", { actionConfirmed: true, by }, now)).toMatchObject({ ok: false, result: { kind: "wrong_business" } });
  });
});

describe("reviews", () => {
  it("opens only after redeeming, once, within 30 days", () => {
    expect(reviewState(claim, now)).toBe("not_redeemed");
    expect(reviewState({ redeemedAt: "2026-10-20T12:00:00+01:00" }, now)).toBe("open");
    expect(reviewState({ redeemedAt: "2026-09-10T12:00:00+01:00" }, now)).toBe("closed");
    expect(reviewState({ redeemedAt: "2026-10-20T12:00:00+01:00", review: { rating: 5, at: "x", status: "visible" } }, now)).toBe("reviewed");
  });

  it("validates the stars and the line", () => {
    expect(validateReview("5", "  Lovely   visit ")).toEqual({ ok: true, rating: 5, body: "Lovely visit" });
    expect(validateReview(0, "")).toMatchObject({ ok: false });
    expect(validateReview(4, "x".repeat(141))).toMatchObject({ ok: false });
  });

  it("updates the average", () => {
    expect(addRating(4.8, 126, 5)).toEqual({ rating: 4.8, reviewCount: 127 });
    expect(addRating(undefined, 0, 4)).toEqual({ rating: 4, reviewCount: 1 });
    expect(displayName("Tunde")).toBe("Tunde");
  });
});

describe("quiet-day codes", () => {
  it("only work on the drop's days, and checking never uses them", () => {
    const quiet = { ...claim, validWeekdays: [1, 2] }; // now is a Wednesday
    expect(checkClaim(quiet, claim.ownerId, claim.card.code, now)).toEqual({ kind: "wrong_day", code: claim.card.code, days: "Valid Mon, Tue only" });
    expect(confirmClaim(quiet, claim.ownerId, claim.card.code, { actionConfirmed: false, by }, now).ok).toBe(false);
    expect(checkClaim({ ...claim, validWeekdays: [3] }, claim.ownerId, claim.card.code, now).kind).toBe("valid");
  });
});

describe("bounce-back", () => {
  const offer = { reward: "10% off your next visit", validityDays: 30 };
  const make = { token: "bb_token", code: "GS-NEXT1" };
  const redeemed = confirmClaim(claim, claim.ownerId, claim.card.code, { actionConfirmed: false, by }, now);
  const parent = redeemed.ok ? redeemed.claim : claim;

  it("is created once per redeemed Tikka, with its own code and expiry", () => {
    const bb = bounceBackFor(parent, offer, [], make, now)!;
    expect(bb).toMatchObject({ kind: "bounce_back", parentToken: parent.token, token: "bb_token" });
    expect(bb.card).toMatchObject({ kind: "bounce_back", reward: "10% off your next visit", code: "GS-NEXT1" });
    expect(bb.card.expiresAt).toBe(new Date("2026-11-20T23:59:00+01:00").toISOString());
    expect(bb.redeemedAt).toBeUndefined();
    expect(bounceBackFor(parent, offer, [bb], make, now)).toBeNull();
  });

  it("needs a redemption and an offer, and a bounce-back never makes another", () => {
    expect(bounceBackFor(claim, offer, [], make, now)).toBeNull();
    expect(bounceBackFor(parent, null, [], make, now)).toBeNull();
    const bb = bounceBackFor(parent, offer, [], make, now)!;
    expect(bounceBackFor({ ...bb, redeemedAt: now.toISOString() }, offer, [], { token: "x", code: "y" }, now)).toBeNull();
  });
});

describe("new customer or been here before", () => {
  it("preselects from their history, and the counter's choice is saved", () => {
    const fresh = checkClaim(claim, claim.ownerId, claim.card.code, now);
    expect(fresh.kind === "valid" && fresh.suggestedStatus).toBe("new");
    const back = checkClaim(claim, claim.ownerId, claim.card.code, now, true);
    expect(back.kind === "valid" && back.suggestedStatus).toBe("returning");
    const r = confirmClaim(claim, claim.ownerId, claim.card.code, { actionConfirmed: false, by, customerStatus: "returning" }, now);
    expect(r.ok && r.claim.customerStatus).toBe("returning");
    const d = confirmClaim(claim, claim.ownerId, claim.card.code, { actionConfirmed: false, by }, now);
    expect(d.ok && d.claim.customerStatus).toBe("new");
  });
});
