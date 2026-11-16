import { describe, expect, it } from "vitest";
import { packCountLabel, packLines, type PackItem } from "./pack";

const L: PackItem = { tier: "legendary", count: 2, reward: "Free induction makeup + content video" };
const R: PackItem = { tier: "rare", count: 36, reward: "Free content video + 2 edited photos" };
const T: PackItem = { tier: "thank_you", count: 162, reward: "₦5,000 off makeup, or a free photoshoot" };

describe("the wrapper's reward lines", () => {
  it("lists the rarest first, whatever order they arrive in", () => {
    expect(packLines([T, L, R]).lines.map((i) => i.tier)).toEqual(["legendary", "rare", "thank_you"]);
  });

  it("shows three at most and counts the rest", () => {
    const extra: PackItem = { tier: "rare", count: 5, reward: "Free lashes" };
    const r = packLines([L, R, extra, T]);
    expect(r.lines).toHaveLength(3);
    expect(r.more).toBe(1);
    expect(packLines([L, R, T]).more).toBe(0);
  });

  it("says how many in plain words", () => {
    const items = [L, R, T];
    expect(packCountLabel(L, items)).toBe("2 only");
    expect(packCountLabel(R, items)).toBe("36");
    expect(packCountLabel(T, items)).toBe("everyone else");
  });

  it("only calls a thank-you \"everyone else\" when it is the one thank-you among other rewards", () => {
    const T2: PackItem = { tier: "thank_you", count: 40, reward: "Free brow tint" };
    expect(packCountLabel(T, [L, T, T2])).toBe("162");
    expect(packCountLabel(T, [T])).toBe("162");
    expect(packCountLabel({ ...T, count: 1200 }, [T])).toBe("1,200");
  });
});
