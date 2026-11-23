import { describe, expect, it } from "vitest";
import { blankDraft, draftFromTemplate, ownOffer, tierCount, type DropDraft } from "./drop";
import { applyFix, dropCheck } from "./dropcheck";
import templates from "./mock/drop_templates.json";
import type { DropTemplate } from "./templates";

const now = new Date("2026-10-21T09:00:00+01:00");
const fromTemplate = (id: string) => draftFromTemplate(blankDraft(now), (templates as DropTemplate[]).find((t) => t.id === id)!);
const ids = (d: DropDraft) => dropCheck(d).map((w) => w.id);

describe("drop check", () => {
  it("every template passes clean", () => {
    for (const t of templates as DropTemplate[]) expect(ids(draftFromTemplate(blankDraft(now), t)), t.id).toEqual([]);
  });

  it("warns about freebies, and the fix adds a minimum spend to Rare", () => {
    let d = ownOffer(blankDraft(now));
    d = { ...d, rewards: d.rewards.map((r) => (r.tier === "rare" ? { ...r, type: "free_item", value: null, what: "Free wash", requiresPurchase: false } : r.tier === "legendary" ? { ...r, what: "Free braids" } : r)) };
    expect(ids(d)).toContain("no_purchase");
    expect(ids(applyFix(d, "no_purchase"))).not.toContain("no_purchase");
  });

  it("warns about 30-day Tikkas, an empty thank-you and a missing bounce-back", () => {
    const d = fromTemplate("beauty-new-1");
    const bad: DropDraft = {
      ...d,
      validityDays: 30,
      bounceBack: { ...d.bounceBack, on: false },
      rewards: d.rewards.map((r) => (r.tier === "thank_you" ? { ...r, type: "perk", value: null, what: "" } : r)),
    };
    expect(ids(bad)).toEqual(["long_validity", "empty_thank_you", "no_bounce_back"]);
    let fixed = bad;
    for (const w of dropCheck(bad)) fixed = applyFix(fixed, w.id);
    expect(ids(fixed)).toEqual([]);
    expect(fixed.validityDays).toBe(14);
  });

  it("warns when the drop is much bigger than the audience, and fixes the size", () => {
    const d = { ...fromTemplate("food-new-1"), audienceBand: "under_300" as const, total: 1000 };
    expect(ids(d)).toEqual(["too_big"]);
    const fixed = applyFix(d, "too_big");
    expect(fixed.total).toBe(100);
    expect(tierCount(fixed, "legendary") + tierCount(fixed, "rare") + tierCount(fixed, "thank_you")).toBe(100);
  });

  it("warns when legendary is over 10%, and brings it to 2%", () => {
    const d = fromTemplate("spa-new-1");
    const heavy = { ...d, total: 500, mix: "custom" as const, rewards: d.rewards.map((r) => (r.tier === "legendary" ? { ...r, count: 100 } : r)) };
    expect(ids(heavy)).toContain("big_legendary");
    expect(tierCount(applyFix(heavy, "big_legendary"), "legendary")).toBe(10);
  });

  // Divora Beauty's "We miss you": both action cards, the % only in the words.
  const withRewards = (d: DropDraft, give: Partial<Record<"legendary" | "rare" | "thank_you", Partial<DropDraft["rewards"][number]>>>): DropDraft => ({
    ...d,
    rewards: d.rewards.map((r) => (give[r.tier] ? { ...r, ...give[r.tier] } : r)),
  });
  const action = (what: string) => ({ type: "action" as const, value: null, what, action: "Follow us on TikTok", text: what });

  it("warns when a rarer card gives less, and the fix swaps them, keeping the counts", () => {
    const d = withRewards(fromTemplate("beauty-back-1"), { legendary: action("40% off any services in December"), rare: { ...action("50% off any service"), terms: "First visit only" } });
    const w = dropCheck(d).find((x) => x.id === "tier_order");
    expect(w?.text).toBe("Your Rare card gives more than your Legendary card.");
    expect(w?.fix).toBe("Swap Rare and Legendary");
    const fixed = applyFix(d, "tier_order");
    expect(ids(fixed)).not.toContain("tier_order");
    const leg = fixed.rewards.find((r) => r.tier === "legendary")!;
    const rare = fixed.rewards.find((r) => r.tier === "rare")!;
    expect([leg.what, leg.terms, rare.what]).toEqual(["50% off any service", "First visit only", "40% off any services in December"]);
    expect([tierCount(fixed, "legendary"), tierCount(fixed, "rare")]).toEqual([tierCount(d, "legendary"), tierCount(d, "rare")]);
  });

  it("checks Rare against Thank-you, and ₦ off too", () => {
    const pct = withRewards(fromTemplate("beauty-back-1"), { legendary: { type: "percent_off", value: 40, what: "any service" }, rare: { type: "percent_off", value: 15, what: "any service" }, thank_you: { type: "percent_off", value: 20, what: "any service" } });
    expect(dropCheck(pct).find((x) => x.id === "tier_order")?.fix).toBe("Swap Thank-you and Rare");
    const naira = withRewards(fromTemplate("beauty-back-1"), { legendary: { type: "naira_off", value: 2000, what: "any service" }, rare: action("₦5,000 off any service") });
    expect(ids(naira)).toContain("tier_order");
  });

  it("stays quiet in the right order, with equal amounts, or when the rewards can't be compared", () => {
    const base = fromTemplate("beauty-back-1");
    const pct = (n: number) => ({ type: "percent_off" as const, value: n, what: "any service" });
    expect(ids(withRewards(base, { legendary: pct(50), rare: pct(20) }))).not.toContain("tier_order");
    expect(ids(withRewards(base, { legendary: pct(20), rare: pct(20) }))).not.toContain("tier_order");
    expect(ids(withRewards(base, { legendary: { type: "free_item", value: null, what: "Free braids" }, rare: pct(50) }))).not.toContain("tier_order");
    expect(ids(withRewards(base, { legendary: { type: "naira_off", value: 10, what: "any service" }, rare: pct(50) }))).not.toContain("tier_order");
  });
});

describe("drafts from templates", () => {
  it("scales to 4/16/80 at 50, sets the goal's rules, days and bounce-back", () => {
    const d = fromTemplate("beauty-quiet-1");
    expect(d.total).toBe(50);
    expect([tierCount(d, "legendary"), tierCount(d, "rare"), tierCount(d, "thank_you")]).toEqual([2, 8, 40]);
    expect(d.goal).toBe("quiet_days");
    expect(d.validWeekdays).toEqual([1, 2, 3]);
    expect(d.name).toBe("Midweek glow");
    expect(d.bounceBack.on).toBe(true);
    expect(fromTemplate("beauty-new-1").eligibility).toBe("new_only");
    expect(fromTemplate("beauty-back-1").eligibility).toBe("once_per_drop");
  });
});
