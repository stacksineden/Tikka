import { describe, expect, it } from "vitest";
import { ALPHABET, generate, isWellFormed, normalize } from "./codes";
import { seededRng } from "./deck";

const rng = seededRng(7);
const sample = Array.from({ length: 200 }, (_, i) => generate(["GS", "AB", "ZO", "KM"][i % 4], rng));

describe("codes", () => {
  it("generates well-formed codes in the right shape", () => {
    for (const c of sample) {
      expect(c).toMatch(/^[A-Z]{2}-[ACDEFGHJKMNPQRTUVWXY34679]{5}$/);
      expect(isWellFormed(c)).toBe(true);
    }
  });

  it("normalizes what people type", () => {
    const c = sample[0];
    expect(normalize(` ${c.toLowerCase().replace("-", " ")} `)).toBe(c);
    expect(normalize(c.replace("-", ""))).toBe(c);
    expect(normalize("GS-7X4Q")).toBeNull();
    expect(normalize("GS-7X4Q0")).toBeNull(); // 0 is not in the alphabet
    expect(normalize("G5-7X4QP")).toBeNull();
  });

  it("catches every single-character typo in the body", () => {
    for (const c of sample) {
      for (let pos = 3; pos < 8; pos++) {
        for (const ch of ALPHABET) {
          if (ch === c[pos]) continue;
          expect(isWellFormed(c.slice(0, pos) + ch + c.slice(pos + 1))).toBe(false);
        }
      }
    }
  });

  it("catches every adjacent swap in the body", () => {
    for (const c of sample) {
      for (let pos = 3; pos < 7; pos++) {
        const a = c[pos];
        const b = c[pos + 1];
        if (a === b) continue;
        expect(isWellFormed(c.slice(0, pos) + b + a + c.slice(pos + 2))).toBe(false);
      }
    }
  });
});

describe("demo seed codes", () => {
  it("are all well-formed", async () => {
    const seeds = (await import("./mock/claims.json")).default as { card: { code: string } }[];
    for (const s of seeds) expect(isWellFormed(s.card.code), s.card.code).toBe(true);
  });
});
