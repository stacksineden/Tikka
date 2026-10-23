import { describe, expect, it } from "vitest";
import { ALPHABET } from "./codes";
import { seededRng } from "./deck";
import { BLEED_MM, DEFAULT_HOOK, FORMATS, newPosterCode, normalizePosterCode, posterTarget, rewardHook, spacedCode, validateHook, validateLabel } from "./posters";

describe("poster codes", () => {
  it("are 6 characters from the Tikka alphabet", () => {
    const rng = seededRng(7);
    for (let i = 0; i < 50; i++) {
      const c = newPosterCode(rng);
      expect(c).toHaveLength(6);
      expect([...c].every((x) => ALPHABET.includes(x))).toBe(true);
    }
  });
  it("forgive how people type them", () => {
    expect(normalizePosterCode("k7m 2qp")).toBe(normalizePosterCode("K7M-2QP"));
    expect(normalizePosterCode("K7M")).toBeNull();
    expect(normalizePosterCode("ACD-EFG")).toBe("ACDEFG");
    expect(normalizePosterCode("acdef0")).toBeNull();
    expect(spacedCode("K7M2QP")).toBe("K7M 2QP");
  });
});

describe("where a scan goes", () => {
  it("opens the one live drop, tagged with the poster", () => {
    expect(posterTarget("glowstudio", "pst_1", [{ slug: "october-glow", status: "live" }, { slug: "november-glow", status: "scheduled" }])).toBe(
      "/d/glowstudio/october-glow?c=qr&p=pst_1",
    );
  });
  it("opens the business page when nothing (or more than one) is live", () => {
    expect(posterTarget("glowstudio", "pst_1", [{ slug: "november-glow", status: "scheduled" }])).toBe("/glowstudio?c=qr&p=pst_1");
    expect(posterTarget("glowstudio", "pst_1", [])).toBe("/glowstudio?c=qr&p=pst_1");
    expect(posterTarget("glowstudio", "pst_1", [{ slug: "a", status: "live" }, { slug: "b", status: "live" }])).toBe("/glowstudio?c=qr&p=pst_1");
  });
});

describe("what the printable says", () => {
  it("checks labels and hook lines, and keeps gambling words out", () => {
    expect(validateLabel("")).toMatch(/Name the place/);
    expect(validateLabel("Shop counter")).toBeNull();
    expect(validateHook(DEFAULT_HOOK)).toBeNull();
    expect(validateHook("Try your luck!")).toMatch(/Every Tikka holds something/);
    expect(validateHook("x".repeat(81))).toMatch(/under 80/);
    expect(rewardHook("Free signature facial")).toBe("Free signature facial and more inside. Every Tikka holds something.");
    expect(validateHook(rewardHook("Free signature facial")!)).toBeNull();
  });
  it("prints at trim size plus 3 mm bleed", () => {
    expect(BLEED_MM).toBe(3);
    expect(FORMATS.a4).toMatchObject({ w: 210, h: 297 });
    expect(FORMATS.sticker).toMatchObject({ w: 50, h: 50 });
  });
});
