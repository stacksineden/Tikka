import { describe, expect, it } from "vitest";
import { appendCounts, apportion, buildDeck, CHUNK, seededRng, serials } from "./deck";

const balanced = [
  { id: "legendary", count: 10 },
  { id: "rare-pct", count: 30 },
  { id: "rare-action", count: 20 },
  { id: "thank-you", count: 540 },
];

function counts(ids: string[]) {
  const m = new Map<string, number>();
  for (const id of ids) m.set(id, (m.get(id) ?? 0) + 1);
  return m;
}

describe("apportion", () => {
  it("splits exactly with largest remainder", () => {
    expect(apportion(10, [1, 1, 1])).toEqual([4, 3, 3]);
    expect(apportion(600, [2, 10, 88])).toEqual([12, 60, 528]);
    expect(apportion(0, [1, 2])).toEqual([0, 0]);
  });
});

describe("buildDeck", () => {
  it("has exactly the right number of every reward", () => {
    const deck = buildDeck(balanced, seededRng(1));
    expect(deck).toHaveLength(600);
    const c = counts(deck);
    for (const r of balanced) expect(c.get(r.id)).toBe(r.count);
  });

  it("gives every chunk of 50 its share of each reward, within one card", () => {
    for (const seed of [1, 2, 3, 42]) {
      const deck = buildDeck(balanced, seededRng(seed));
      for (let start = 0; start < deck.length; start += CHUNK) {
        const chunk = deck.slice(start, start + CHUNK);
        const c = counts(chunk);
        for (const r of balanced) {
          const share = (r.count * chunk.length) / 600;
          const got = c.get(r.id) ?? 0;
          expect(got).toBeGreaterThanOrEqual(Math.floor(share) - 1);
          expect(got).toBeLessThanOrEqual(Math.ceil(share) + 1);
        }
      }
    }
  });

  it("spreads legendary cards instead of clumping them", () => {
    const deck = buildDeck(balanced, seededRng(7));
    const positions = deck.flatMap((id, i) => (id === "legendary" ? [i] : []));
    const gaps = positions.slice(1).map((p, i) => p - positions[i]);
    expect(Math.max(...gaps)).toBeLessThan(120); // 10 in 600: roughly one per 60
  });

  it("is deterministic with a seed and different across seeds", () => {
    expect(buildDeck(balanced, seededRng(9))).toEqual(buildDeck(balanced, seededRng(9)));
    expect(buildDeck(balanced, seededRng(9))).not.toEqual(buildDeck(balanced, seededRng(10)));
  });

  it("handles small and uneven drops", () => {
    const deck = buildDeck(
      [
        { id: "a", count: 1 },
        { id: "b", count: 2 },
        { id: "c", count: 70 },
      ],
      seededRng(3),
    );
    expect(deck).toHaveLength(73);
    expect(counts(deck).get("a")).toBe(1);
  });
});

describe("serials and appending", () => {
  it("numbers every card once", () => {
    const s = serials(600, seededRng(5));
    expect(new Set(s).size).toBe(600);
    expect(Math.min(...s)).toBe(1);
    expect(Math.max(...s)).toBe(600);
  });

  it("adds more Tikkas in the same proportions", () => {
    const add = appendCounts(balanced, 300);
    expect(add.reduce((a, r) => a + r.count, 0)).toBe(300);
    expect(add.map((r) => r.count)).toEqual([5, 15, 10, 270]);
  });
});
