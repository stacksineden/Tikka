import { describe, expect, it } from "vitest";
import { funnel, groupViews, rate, suggestNextSize } from "./dashboard";

describe("drop dashboard", () => {
  it("gives each funnel step as % of the one before", () => {
    const f = funnel({ opened: 2000, tore: 1500, tapped: 750, continued: 600, claimed: 540, redeemed: 135, followedUp: 27 });
    expect(f.map((s) => s.ofPrev)).toEqual([null, 75, 50, 80, 90, 25, 20]);
    expect(funnel({ opened: 0, tore: 0, tapped: 0, continued: 0, claimed: 0, redeemed: 0, followedUp: 0 })[1].ofPrev).toBe(0);
  });

  it("suggests the next size from people who came after it sold out", () => {
    // 400 claims from 1,600 viewers (25%); 420 more came after sell-out → 105 more → 505 → 550
    expect(suggestNextSize(420, 1600, 400)).toBe(550);
    expect(suggestNextSize(0, 1600, 400)).toBe(400);
    expect(suggestNextSize(10, 0, 0)).toBe(0);
  });

  it("groups bursts of views", () => {
    const views = [
      { at: "2026-10-20T10:00:00Z", source: "ig" as const },
      { at: "2026-10-20T10:01:00Z", source: "ig" as const },
      { at: "2026-10-20T10:03:00Z", source: "wa" as const },
      { at: "2026-10-20T09:30:00Z", source: "qr" as const },
    ];
    const g = groupViews(views);
    expect(g).toHaveLength(2);
    expect(g[0]).toMatchObject({ kind: "views", count: 3, source: undefined, at: "2026-10-20T10:03:00Z" });
    expect(g[1]).toMatchObject({ kind: "views", count: 1, source: "qr" });
    expect(rate(1, 4)).toBe("25%");
    expect(rate(1, 0)).toBe("–");
  });
});
