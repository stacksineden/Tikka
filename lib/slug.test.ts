import { describe, expect, it } from "vitest";
import { slugAlternatives, slugError, suggestSlug } from "./slug";

describe("business page slugs", () => {
  it("suggests a short slug from the name", () => {
    expect(suggestSlug("Glow Studio")).toBe("glowstudio");
    expect(suggestSlug("Mama Put's Deluxe & Grill")).toBe("mamaputsdeluxeandgrill");
    expect(suggestSlug("Café Lagos")).toBe("cafelagos");
  });

  it("rejects reserved words that clash with Tikka's own pages", () => {
    for (const s of ["drops", "app", "admin", "api", "pricing", "terms", "privacy", "sign-in"]) expect(slugError(s)).toMatch(/reserved/);
  });

  it("checks the shape", () => {
    expect(slugError("glowstudio")).toBeNull();
    expect(slugError("glow-studio")).toBeNull();
    expect(slugError("gs")).toMatch(/at least 3/);
    expect(slugError("Glow")).toMatch(/lowercase/);
    expect(slugError("-glow")).toMatch(/lowercase/);
    expect(slugError("glow--studio")).toMatch(/lowercase/);
  });

  it("offers free alternatives", () => {
    expect(slugAlternatives("glowstudio", "Lagos", new Set(["glowstudio", "glowstudiolagos"]))).toEqual(["glowstudio-lagos", "glowstudio2", "glowstudio3"]);
  });
});
