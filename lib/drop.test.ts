import { describe, expect, it } from "vitest";
import {
  publishWindowProblem,
  applyMix,
  blankDraft,
  copyDraft,
  dropItems,
  isoToWat,
  mixCounts,
  newReward,
  rewardLabel,
  setTierCount,
  setTotal,
  sizeAdvice,
  summary,
  tierCount,
  validateStep1,
  validateStep2,
  validateStep3,
  watToIso,
  withThankYouFilled,
  type DropDraft,
} from "./drop";

const NOW = new Date("2026-10-20T10:00:00+01:00");

function draft(p: Partial<DropDraft> = {}): DropDraft {
  return { ...blankDraft(NOW), name: "December Glow", ...p };
}

describe("mixes", () => {
  it("matches the PRD's Balanced example", () => {
    expect(mixCounts(600, [2, 10, 88])).toEqual([12, 60, 528]);
  });

  it("keeps at least one legendary and one rare when it can", () => {
    expect(mixCounts(20, [1, 4, 95])).toEqual([1, 1, 18]);
    expect(mixCounts(2, [1, 4, 95])).toEqual([0, 0, 2]);
  });

  it("re-applies the mix when the total changes, and refills thank-you on custom", () => {
    const d = setTotal(draft(), 1000);
    expect([tierCount(d, "legendary"), tierCount(d, "rare"), tierCount(d, "thank_you")]).toEqual([20, 100, 880]);
    const custom = setTierCount({ ...d, mix: "custom" }, "legendary", 7);
    const bigger = setTotal(withThankYouFilled(custom), 1200);
    expect(tierCount(bigger, "legendary")).toBe(7);
    expect(tierCount(bigger, "thank_you")).toBe(1200 - 7 - 100);
  });

  it("splits a tier across its rewards", () => {
    let d = draft({ total: 600 });
    d = { ...d, rewards: [...d.rewards, newReward("rare", { type: "action", action: "Follow us", what: "Free brow tint" })] };
    d = withThankYouFilled(setTierCount(d, "rare", 50));
    const rares = d.rewards.filter((r) => r.tier === "rare").map((r) => r.count);
    expect(rares.reduce((a, b) => a + b, 0)).toBe(50);
    expect(tierCount(d, "thank_you")).toBe(600 - tierCount(d, "legendary") - 50);
  });
});

describe("labels and summary", () => {
  it("reads rewards the way the card shows them", () => {
    expect(rewardLabel({ type: "percent_off", value: 20, what: "any service" })).toBe("20% off any service");
    expect(rewardLabel({ type: "naira_off", value: 5000, what: "" })).toBe("₦5,000 off any service");
    expect(rewardLabel({ type: "free_item", value: null, what: "Signature facial" })).toBe("Free signature facial");
    expect(rewardLabel({ type: "free_item", value: null, what: "Free drink" })).toBe("Free drink");
    expect(rewardLabel({ type: "perk", value: null, what: "Priority booking" })).toBe("Priority booking");
  });

  it("writes the PRD's live summary", () => {
    let d = draft({ total: 600, mix: "custom" });
    d = withThankYouFilled(setTierCount(setTierCount(d, "legendary", 10), "rare", 50));
    expect(summary(d)).toBe("600 Tikkas · 10 legendary (1.7%) · 50 rare (8.3%) · 540 thank-you (90%)");
  });

  it("lists what's inside, legendary first, skipping empty rewards", () => {
    const d = applyMix(draft({ total: 600 }), "balanced");
    expect(dropItems(d).map((i) => i.tier)).toEqual(["legendary", "rare", "thank_you"]);
  });
});

describe("validation", () => {
  it("step 1: name, size and dates", () => {
    expect(validateStep1(draft(), NOW)).toEqual({});
    const e = validateStep1(draft({ name: "", total: 5, startMode: "later", startsAt: "2026-10-19T09:00" }), NOW);
    expect(Object.keys(e).sort()).toEqual(["name", "startsAt", "total"]);
    expect(validateStep1(draft({ endsAt: "2026-10-20T10:30" }), NOW).endsAt).toBeDefined();
    expect(validateStep1(draft({ endsAt: "2026-11-25T10:00" }), NOW).endsAt).toMatch(/30 days/);
    expect(validateStep1(draft({ endsAt: "2026-11-19T09:00" }), NOW).endsAt).toBeUndefined();
    expect(validateStep1(draft({ total: 3001 }), NOW).total).toBe("For drops over 3,000 Tikkas, talk to us.");
  });

  it("step 2: every reward that's given out needs its details", () => {
    const d = applyMix(draft({ total: 600 }), "balanced");
    const e = validateStep2(d);
    // the blank legendary free item has no name yet
    expect(Object.keys(e)).toEqual([`reward-${d.rewards[0].id}`]);
    const fixed = { ...d, rewards: d.rewards.map((r, i) => (i === 0 ? { ...r, what: "Signature facial" } : r)) };
    expect(validateStep2(fixed)).toEqual({});
  });

  it("step 2: legendary and rare can't outnumber the drop", () => {
    const d = setTierCount(draft({ total: 100, mix: "custom" }), "rare", 150);
    expect(validateStep2(d).counts).toMatch(/more than the 100/);
  });

  it("step 3: rules", () => {
    expect(validateStep3(draft({ eligibility: "once_per_period", periodDays: 0 })).periodDays).toBeDefined();
    expect(validateStep3(draft({ marketplaceCap: 9999 })).marketplaceCap).toBeDefined();
    expect(validateStep3(draft())).toEqual({});
  });
});

describe("dates, copies and size advice", () => {
  it("round-trips WAT wall-clock times", () => {
    expect(watToIso("2026-12-31T21:00")).toBe("2026-12-31T21:00:00+01:00");
    expect(isoToWat("2026-12-31T21:00:00+01:00")).toBe("2026-12-31T21:00");
  });

  it("runs a drop again with fresh dates and the same rewards", () => {
    const from = applyMix(draft({ name: "September Reset" }), "generous");
    const copy = copyDraft(from, NOW, "drop_sep");
    expect(copy.name).toBe("September Reset (again)");
    expect(copy.copiedFrom).toBe("drop_sep");
    expect(copy.rewards.map((r) => r.count)).toEqual(from.rewards.map((r) => r.count));
    expect(copy.rewards[0].id).not.toBe(from.rewards[0].id);
  });

  it("suggests a size from the last drop", () => {
    expect(sizeAdvice({ name: "September Reset", total: 400, claimed: 400 })).toEqual({
      suggest: 500,
      text: "September Reset ran out (400 of 400 claimed). Try 500.",
    });
    expect(sizeAdvice({ name: "October Glow", total: 600, claimed: 577 })?.text).toBe("October Glow nearly ran out (577 of 600 claimed). Try 750.");
    expect(sizeAdvice({ name: "Quiet one", total: 400, claimed: 120 })?.suggest).toBe(150);
    expect(sizeAdvice(undefined)).toBeNull();
  });
});

describe("one live drop, one scheduled next", () => {
  const now = new Date("2026-10-21T12:00:00+01:00");
  const live = { id: "a", status: "live" as const, startsAt: "2026-10-14T09:00:00+01:00", endsAt: "2026-10-31T21:00:00+01:00" };
  const next = { id: "b", status: "scheduled" as const, startsAt: "2026-11-07T09:00:00+01:00", endsAt: "2026-11-30T21:00:00+01:00" };

  it("allows a first drop now, or a next drop after the live one ends", () => {
    expect(publishWindowProblem([], { startsAt: now.toISOString() }, now)).toBeNull();
    expect(publishWindowProblem([live], { startsAt: "2026-11-01T09:00:00+01:00" }, now)).toBeNull();
    expect(publishWindowProblem([{ ...live, status: "ended" }], { startsAt: now.toISOString() }, now)).toBeNull();
  });

  it("refuses a second live drop, a second scheduled one, or one that overlaps the live drop", () => {
    expect(publishWindowProblem([live], { startsAt: now.toISOString() }, now)).toMatch(/already have a live drop/);
    expect(publishWindowProblem([live, next], { startsAt: "2026-12-01T09:00:00+01:00" }, now)).toMatch(/live drop and one scheduled/);
    expect(publishWindowProblem([live, next], { startsAt: now.toISOString() }, now)).toMatch(/live drop and one scheduled/);
    expect(publishWindowProblem([next], { startsAt: "2026-12-01T09:00:00+01:00" }, now)).toMatch(/already have a drop scheduled/);
    expect(publishWindowProblem([live], { startsAt: "2026-10-25T09:00:00+01:00" }, now)).toMatch(/Start this one on or after/);
  });

  it("ignores the drop being republished", () => {
    expect(publishWindowProblem([next], { id: "b", startsAt: next.startsAt }, now)).toBeNull();
  });
});
