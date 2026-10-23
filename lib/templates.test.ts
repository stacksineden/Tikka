import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import seeded from "./mock/drop_templates.json";
import { daysLabel, parseDays, parseReward, parseTemplatesMarkdown, shareCounts, templateCategory, templateProblems, type DropTemplate } from "./templates";

const fromDoc = parseTemplatesMarkdown(readFileSync("docs/drop-templates.md", "utf8"));

describe("drop templates", () => {
  it("has 36: three per goal for beauty and spa, one per goal for the other six", () => {
    expect(fromDoc).toHaveLength(36);
    const n = (c: string, g: string) => fromDoc.filter((t) => t.category === c && t.goal === g).length;
    for (const g of ["new_customers", "bring_back", "quiet_days"]) {
      expect(n("beauty_hair", g)).toBe(3);
      expect(n("spa_wellness", g)).toBe(3);
      for (const c of ["fitness", "food_drinks", "fashion", "health_clinics", "education", "other_services"]) expect(n(c, g)).toBe(1);
    }
  });

  it("every template follows the rules", () => {
    expect(fromDoc.flatMap(templateProblems)).toEqual([]);
  });

  it("the seed matches the doc (rerun pnpm seed:templates after editing it)", () => {
    expect(seeded).toEqual(JSON.parse(JSON.stringify(fromDoc)));
  });

  it("uses no gambling words", () => {
    const text = JSON.stringify(fromDoc);
    expect(text).not.toMatch(/\b(win|winner|luck|lucky|jackpot|odds|bet|stake|lottery|raffle|prize)\b/i);
  });

  it("flags a free main service with no purchase outside legendary", () => {
    const t = structuredClone(fromDoc[0]) as DropTemplate;
    t.rewards[1] = { ...t.rewards[1], ...parseReward("Free wash & style (no purchase)") };
    expect(templateProblems(t)).toContain("beauty-new-1: rare needs a purchase");
  });
});

describe("parseReward", () => {
  it("reads % and ₦ off with a minimum spend", () => {
    expect(parseReward("₦3,000 off any service over ₦10,000")).toEqual({ type: "naira_off", value: 3000, what: "any service", minSpend: 10000, requiresPurchase: true });
    expect(parseReward("25% off any service")).toMatchObject({ type: "percent_off", value: 25, what: "any service", minSpend: null });
  });
  it("reads free items and perks, and whether they need a purchase", () => {
    expect(parseReward("Free wash & style (no purchase)")).toEqual({ type: "free_item", value: null, what: "Free wash & style", minSpend: null, requiresPurchase: false });
    expect(parseReward("Free drink with any meal").requiresPurchase).toBe(true);
    expect(parseReward("Free day pass").requiresPurchase).toBe(false);
    expect(parseReward("2 months for the price of 1")).toMatchObject({ type: "perk", requiresPurchase: true });
  });
});

describe("days and shares", () => {
  it("parses day ranges, wrapping past Sunday", () => {
    expect(parseDays("Mon–Wed")).toEqual([1, 2, 3]);
    expect(parseDays("Fri–Sun")).toEqual([5, 6, 7]);
    expect(parseDays("Sat–Mon")).toEqual([6, 7, 1]);
    expect(parseDays("—")).toBeNull();
    expect(daysLabel([1, 2, 3])).toBe("Mon–Wed");
    expect(daysLabel([1, 3])).toBe("Mon, Wed");
    expect(daysLabel(null)).toBe("Any day");
  });
  it("scales 2/10/88 to any size, at least one legendary and rare", () => {
    expect(shareCounts(200)).toEqual([4, 20, 176]);
    expect(shareCounts(250)).toEqual([5, 25, 220]);
    expect(shareCounts(10)).toEqual([1, 1, 8]);
    expect(shareCounts(3)).toEqual([1, 1, 1]);
    expect(shareCounts(333).reduce((a, b) => a + b)).toBe(333);
  });
  it("maps business categories", () => {
    expect(templateCategory("Beauty")).toBe("beauty_hair");
    expect(templateCategory("Events")).toBe("other_services");
    expect(templateCategory("Services")).toBe("other_services");
  });
});
