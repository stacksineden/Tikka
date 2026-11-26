import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RESERVED_SLUGS, slugAlternatives, slugError, suggestSlug } from "./slug";

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

describe("reserved page links", () => {
  // Every top-level page (app/<name> and app/(group)/<name>) must be reserved, or a business could
  // take its link and hide it. supabase/migrations/20261217100000_reserved_slugs_sync.sql mirrors it.
  it("cover every top-level route", () => {
    const root = join(process.cwd(), "app");
    const dirs = (p: string) => readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
    const top = [...dirs(root), ...dirs(root).filter((d) => d.startsWith("(")).flatMap((g) => dirs(join(root, g)))]
      .filter((d) => !d.startsWith("(") && !d.startsWith("[") && !d.startsWith("_"));
    expect(top.filter((d) => !RESERVED_SLUGS.has(d))).toEqual([]);
  });
});
