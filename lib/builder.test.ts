// The staged drop builder's rules: rewards written in plain words, conditions printed under them,
// the card's character limits, and which screens each kind of offer goes through.
import { describe, expect, it } from "vitest";
import { cardFrom, checkFrom, type CardJson } from "./claim-map";
import {
  blankDraft,
  draftFromTemplate,
  flowFor,
  LIMITS,
  newReward,
  purchaseFor,
  rewardFromText,
  rewardLabel,
  rewardText,
  runDaysFor,
  splitCondition,
  validateStep2,
} from "./drop";
import { applyFix, dropCheck, FIX_RARE_TERMS } from "./dropcheck";
import type { DropTemplate } from "./templates";
import { compose } from "./wa-text";

const base = newReward("legendary", { id: "x" });

describe("What they get, in plain words", () => {
  it("reads the type from the words", () => {
    expect(rewardFromText(base, "₦5,000 off makeup")).toMatchObject({ type: "naira_off", value: 5000, what: "makeup" });
    expect(rewardFromText(base, "20% off any service")).toMatchObject({ type: "percent_off", value: 20, what: "any service" });
    expect(rewardFromText(base, "Free lashes")).toMatchObject({ type: "free_item", what: "Free lashes" });
    expect(rewardFromText(base, "Priority booking")).toMatchObject({ type: "perk", what: "Priority booking" });
  });

  it("shows on the card exactly as typed", () => {
    for (const t of ["₦5,000 off makeup, or a free photoshoot", "Free induction makeup + content video", "Content video + 2 edited photos"])
      expect(rewardLabel(rewardFromText(base, t))).toBe(t);
  });

  it("keeps what's being typed, spaces and all, and stops at the card's limit", () => {
    const r = rewardFromText(base, "Free ");
    expect(rewardText(r)).toBe("Free ");
    expect(rewardFromText(base, "x".repeat(60)).text).toHaveLength(LIMITS.reward);
  });

  it("shows the real reward when something else changed it", () => {
    const r = { ...rewardFromText(base, "Free lashes"), what: "Free brows" };
    expect(rewardText(r)).toBe("Free brows");
  });

  it("keeps an action card an action card", () => {
    const a = { ...base, type: "action" as const, action: "Follow us on Instagram" };
    expect(rewardFromText(a, "Free brow tint")).toMatchObject({ type: "action", what: "Free brow tint", action: "Follow us on Instagram" });
  });
});

describe("Conditions", () => {
  it("count as needing a purchase when they ask for money", () => {
    const free = { type: "free_item" as const, what: "Free content video", minSpend: null };
    expect(purchaseFor({ ...free, terms: "" })).toBe(false);
    expect(purchaseFor({ ...free, terms: "Book your slot ahead" })).toBe(false);
    expect(purchaseFor({ ...free, terms: "When you book makeup at ₦20,000" })).toBe(true);
    expect(purchaseFor({ ...free, terms: "With any paid service" })).toBe(true);
  });

  it("split off ready-made rewards so the card shows each in its place", () => {
    expect(splitCondition({ type: "free_item", what: "Free deep-conditioning treatment with any service" })).toEqual({
      what: "Free deep-conditioning treatment",
      terms: "With any service",
    });
    expect(splitCondition({ type: "perk", what: "2 months for the price of 1" })).toEqual({ what: "2 months for the price of 1", terms: "" });
    expect(splitCondition({ type: "percent_off", what: "any service" })).toEqual({ what: "any service", terms: "" });
  });

  it("leave the minimum spend off the reward when they already say it", () => {
    const r = { type: "free_item" as const, value: null, what: "Free pedicure", minSpend: 15000 };
    expect(rewardLabel(r)).toBe("Free pedicure over ₦15,000");
    expect(rewardLabel({ ...r, terms: "With any service over ₦15,000" })).toBe("Free pedicure");
  });

  it("come with a ready-made offer", () => {
    const t: DropTemplate = {
      id: "t",
      category: "beauty_hair",
      goal: "new_customers",
      name: "T",
      why: "",
      rewards: [
        { tier: "legendary", share: 2, type: "free_item", value: null, what: "Free full glam", minSpend: null, requiresPurchase: false },
        { tier: "rare", share: 10, type: "free_item", value: null, what: "Free lashes with any makeup", minSpend: null, requiresPurchase: true },
        { tier: "thank_you", share: 88, type: "naira_off", value: 3000, what: "makeup", minSpend: null, requiresPurchase: true },
      ],
      bounceBack: null,
      validityDays: 14,
      validWeekdays: null,
      sort: 1,
    };
    const rare = draftFromTemplate(blankDraft(new Date("2026-11-13T09:00:00Z")), t).rewards.find((r) => r.tier === "rare")!;
    expect(rewardLabel(rare)).toBe("Free lashes");
    expect(rare.terms).toBe("With any makeup");
  });
});

describe("The card's limits", () => {
  it("refuse a reward or condition that won't fit", () => {
    const d = blankDraft(new Date("2026-11-13T09:00:00Z"));
    const long = { ...d, rewards: d.rewards.map((r) => (r.tier === "legendary" ? { ...r, count: 2, type: "perk" as const, what: "y".repeat(45), terms: "z".repeat(41) } : r)) };
    const id = long.rewards.find((r) => r.tier === "legendary")!.id;
    const e = validateStep2(long);
    expect(e[`reward-${id}`]).toMatch(/44 characters/);
    expect(e[`terms-${id}`]).toMatch(/40 characters/);
  });
});

describe("The freebie warning", () => {
  it("is fixed with a condition under Rare", () => {
    const d = blankDraft(new Date("2026-11-13T09:00:00Z"));
    const freebies = { ...d, rewards: d.rewards.map((r) => (r.tier === "rare" ? { ...r, type: "free_item" as const, what: "Free lashes", value: null, requiresPurchase: false } : r)) };
    expect(dropCheck(freebies).map((w) => w.id)).toContain("no_purchase");
    const fixed = applyFix(freebies, "no_purchase");
    expect(fixed.rewards.find((r) => r.tier === "rare")!.terms).toBe(FIX_RARE_TERMS);
    expect(dropCheck(fixed).map((w) => w.id)).not.toContain("no_purchase");
  });
});

describe("Open for", () => {
  it("offers 3 and 5 days, and rounds others up", () => {
    expect(runDaysFor(3)).toBe(3);
    expect(runDaysFor(4)).toBe(5);
    expect(runDaysFor(6)).toBe(7);
    expect(runDaysFor(20)).toBe(30);
  });
});

describe("The steps", () => {
  it("skip the three card screens for a ready-made offer", () => {
    expect(flowFor(false)).toEqual(["goal", "offer", "cards", "when", "review"]);
    expect(flowFor(true)).toEqual(["goal", "offer", "legendary", "rare", "thank_you", "when", "review"]);
  });
});

describe("The condition reaches the claimer and the counter", () => {
  const json: CardJson = {
    view_token: "v",
    kind: "drop",
    drop_id: "d",
    tier: "common",
    reward: "₦5,000 off makeup",
    action: null,
    terms: "When you pay ₦20,000",
    code: "GT-K9MWA",
    serial: 3,
    total: 200,
    first_name: "Bola",
    expires_at: "2026-11-30T20:00:00Z",
    redeemed_at: null,
    planned_visit_date: null,
    planned_visit_part: null,
    valid_weekdays: null,
  };

  it("on the card", () => {
    expect(cardFrom(json).terms).toBe("When you pay ₦20,000");
    expect(cardFrom({ ...json, terms: null }).terms).toBeUndefined();
  });

  it("at the counter", () => {
    const r = checkFrom({ kind: "valid", code: "GT-K9MWA", reward: "₦5,000 off makeup", tier: "common", expires_at: json.expires_at, terms: "When you pay ₦20,000" });
    expect(r.kind === "valid" && r.terms).toBe("When you pay ₦20,000");
  });

  it("in the WhatsApp card message", () => {
    const text = compose("card", { business_name: "Glam by Tolu", reward: "₦5,000 off makeup", terms: "When you pay ₦20,000", tier: "common", code: "GT-K9MWA", expires_at: json.expires_at, view_token: "v" }, "https://tikka.ng").text;
    expect(text).toContain("₦5,000 off makeup (When you pay ₦20,000)");
  });
});
