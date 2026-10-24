import { describe, expect, it } from "vitest";
import { cardFrom, checkFrom, claimMessageUrl, leadFrom, statusFrom, type CardJson } from "./claim-map";

const now = new Date("2026-10-23T10:00:00+01:00");
const json = (p: Partial<CardJson> = {}): CardJson => ({
  view_token: "vt1",
  kind: "drop",
  drop_id: "d1",
  tier: "common",
  reward: "A free drink",
  action: "Follow us on Instagram",
  code: "CP-AC3DE",
  serial: 41,
  total: 600,
  first_name: "Adaeze",
  expires_at: "2026-11-06T22:59:00Z",
  redeemed_at: null,
  planned_visit_date: null,
  planned_visit_part: null,
  valid_weekdays: null,
  ...p,
});

describe("a card from the database", () => {
  it("reads as the claim page shows it", () => {
    expect(cardFrom(json())).toEqual({
      token: "vt1",
      kind: "drop",
      tier: "thank_you",
      reward: "A free drink",
      instruction: "Follow us on Instagram and show it at the counter",
      action: "Follow us on Instagram",
      code: "CP-AC3DE",
      serial: "0041",
      total: 600,
      claimer: "Adaeze",
      expiresAt: "2026-11-06T22:59:00.000Z",
    });
    expect(cardFrom(json({ tier: "legendary", action: null })).instruction).toBeUndefined();
  });

  it("knows where it stands", () => {
    const open = statusFrom(json(), now);
    expect(open).toMatchObject({ expired: false, review: "not_redeemed" });
    expect(open.visitOptions?.length).toBeGreaterThan(0);
    const used = statusFrom(json({ redeemed_at: "2026-10-22T12:00:00Z" }), now);
    expect(used).toMatchObject({ redeemedAt: "2026-10-22T12:00:00.000Z", review: "open", visitOptions: undefined });
    expect(statusFrom(json({ expires_at: "2026-10-20T22:59:00Z" }), now)).toMatchObject({ expired: true, visitOptions: undefined });
  });
});

describe("the claim message", () => {
  it("goes to Tikka's number with the code", () => {
    expect(claimMessageUrl("TK-4821K", "Glow Studio", "+234 800 000 0000")).toBe("https://wa.me/2348000000000?text=Claim%20my%20Tikka%20TK-4821K%20from%20Glow%20Studio");
  });
  it("opens any chat until the number is set", () => {
    expect(claimMessageUrl("TK-4821K", "Glow & Co", undefined)).toBe("https://wa.me/?text=Claim%20my%20Tikka%20TK-4821K%20from%20Glow%20%26%20Co");
  });
});

describe("the counter's check", () => {
  it("shows a valid code with the reward, never more", () => {
    expect(
      checkFrom({ kind: "valid", code: "GS-7X4QP", name: "Ada O.", reward: "A free drink", tier: "common", expires_at: "2026-11-06T22:59:00Z", action: "Follow us on Instagram", suggested_status: "returning" }),
    ).toEqual({ kind: "valid", code: "GS-7X4QP", name: "Ada O.", reward: "A free drink", tier: "thank_you", expiresAt: "2026-11-06T22:59:00.000Z", action: "Follow us on Instagram", suggestedStatus: "returning" });
    expect(checkFrom({ kind: "valid", code: "X", tier: "rare", expires_at: "2026-11-06T22:59:00Z", action: null })).not.toHaveProperty("action", expect.anything());
  });

  it("says why a code can't be used", () => {
    expect(checkFrom({ kind: "already_used", code: "X", at: "2026-10-20T12:00:00Z" })).toEqual({ kind: "already_used", code: "X", at: "2026-10-20T12:00:00.000Z" });
    expect(checkFrom({ kind: "wrong_day", code: "X", days: [1, 2, 3, 4] })).toEqual({ kind: "wrong_day", code: "X", days: "Valid Mon–Thu only" });
    expect(checkFrom({ kind: "wrong_business", code: "X" }).kind).toBe("wrong_business");
    expect(checkFrom({ kind: "something else", code: "X" }).kind).toBe("unknown");
  });
});

describe("a lead", () => {
  const row = {
    claim_id: "c1",
    drop_id: "d1",
    first_name: "Ada",
    profile_name: "Ada Okafor",
    phone: "+2348150000001",
    source: "market",
    is_new_lead: true,
    claimed_at: "2026-10-22T09:00:00Z",
    expires_at: "2026-11-05T22:59:00Z",
    redeemed_at: "2026-10-23T12:00:00Z",
    bill_amount_kobo: 1_500_000,
    planned_visit_date: null,
    planned_visit_part: null,
    tier: "rare" as const,
    reward: "20% off any service",
    marketing_opt_in: true,
    last_followup_at: null,
  };
  it("reads as the Leads page shows it, with the full name and number", () => {
    expect(leadFrom(row)).toMatchObject({ id: "c1", name: "Ada Okafor", phone: "+2348150000001", status: "redeemed", isNew: true, fromMarketplace: true, source: "market", tier: "rare", spent: 15000, marketingOptIn: true });
  });
  it("falls back to the first name, and an unknown source is direct", () => {
    expect(leadFrom({ ...row, profile_name: null, source: "tiktok", redeemed_at: null, bill_amount_kobo: null })).toMatchObject({ name: "Ada", source: "direct", status: "claimed", spent: undefined, fromMarketplace: false });
  });
});
