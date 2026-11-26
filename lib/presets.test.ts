import { describe, expect, it } from "vitest";
import { depositOn, presetRules, presetServices, priceScale, roundNaira, TRADES, tradeCategory, travelFeeFor } from "./presets";

describe("presets", () => {
  it("scales prices by place and rounds to ₦500", () => {
    expect(priceScale("Lagos")).toBe(1);
    expect(priceScale("Oyo")).toBe(0.75);
    expect(roundNaira(26250)).toBe(26500);
    expect(roundNaira(100)).toBe(500);
    const lagos = presetServices(["hair"], "Lagos").services[0].item;
    const ibadan = presetServices(["hair"], "Oyo").services[0].item;
    expect(lagos.options?.[2].price).toBe(35000);
    expect(ibadan.options?.[2].price).toBe(26500);
    expect(ibadan.price).toBe(19000);
    expect(ibadan.priceKind).toBe("from");
  });

  it("ticks the first three services of each trade and no extras", () => {
    const { services, extras } = presetServices(["hair", "makeup"], "Lagos");
    expect(services.filter((s) => s.on && s.trade === "hair")).toHaveLength(3);
    expect(services.filter((s) => s.on && s.trade === "makeup")).toHaveLength(3);
    expect(extras.every((x) => !x.on)).toBe(true);
    expect(services.find((s) => s.item.name === "Bridal makeup")?.item.eventDay).toBe(true);
  });

  it("works out deposits: rounded up, at least ₦1,000, never above the price", () => {
    expect(depositOn(26500, { mode: "percent", percent: 30 })).toBe(8000);
    expect(depositOn(3000, { mode: "percent", percent: 30 })).toBe(1000);
    expect(depositOn(800, { mode: "percent", percent: 30 })).toBe(800);
    expect(depositOn(20000, { mode: "fixed", amount: 5000 })).toBe(5000);
    expect(depositOn(0, { mode: "fixed", amount: 5000 })).toBe(0);
  });

  it("fills in rules for home service and event days", () => {
    expect(presetRules("shop", false)).toHaveLength(3);
    expect(presetRules("both", true)).toHaveLength(5);
  });

  it("picks the category and travel fee", () => {
    expect(tradeCategory(["photo", "video"])).toBe("Photography");
    expect(tradeCategory(["photo", "makeup"])).toBe("Beauty");
    expect(travelFeeFor("Lagos")).toBe(5000);
    expect(travelFeeFor("Oyo")).toBe(3000);
  });

  it("gives every trade examples, at least three services and unique service names", () => {
    for (const t of TRADES) {
      expect(t.examples.length).toBeGreaterThan(0);
      const names = presetServices([t.id], "Lagos").services.map((s) => s.item.name);
      expect(names.length).toBeGreaterThanOrEqual(3);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it("treats content studios like photographers", () => {
    expect(tradeCategory(["content"])).toBe("Photography");
    expect(tradeCategory(["content", "photo", "video"])).toBe("Photography");
    const { services } = presetServices(["content"], "Lagos");
    expect(services.filter((s) => s.on).map((s) => s.item.name)).toEqual(["Content day", "Product shoot", "Reels package"]);
  });
});
