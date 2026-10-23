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
    const heavy = { ...d, mix: "custom" as const, rewards: d.rewards.map((r) => (r.tier === "legendary" ? { ...r, count: 100 } : r)) };
    expect(ids(heavy)).toContain("big_legendary");
    expect(tierCount(applyFix(heavy, "big_legendary"), "legendary")).toBe(10);
  });
});

describe("drafts from templates", () => {
  it("scales to 2/10/88, sets the goal's rules, days and bounce-back", () => {
    const d = fromTemplate("beauty-quiet-1");
    expect(d.total).toBe(500);
    expect([tierCount(d, "legendary"), tierCount(d, "rare"), tierCount(d, "thank_you")]).toEqual([10, 50, 440]);
    expect(d.goal).toBe("quiet_days");
    expect(d.validWeekdays).toEqual([1, 2, 3]);
    expect(d.name).toBe("Midweek glow");
    expect(d.bounceBack.on).toBe(true);
    expect(fromTemplate("beauty-new-1").eligibility).toBe("new_only");
    expect(fromTemplate("beauty-back-1").eligibility).toBe("once_per_drop");
  });
});
