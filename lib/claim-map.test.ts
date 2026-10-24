import { describe, expect, it } from "vitest";
import { cardFrom, claimMessageUrl, statusFrom, type CardJson } from "./claim-map";

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
