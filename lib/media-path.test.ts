import { describe, expect, it } from "vitest";
import { photoSrcSet, smallOf } from "./media-path";

describe("phone copies", () => {
  const url = "https://x.supabase.co/storage/v1/object/public/images/u/service/abc.s.webp";

  it("finds the copy beside a photo uploaded with one", () => {
    expect(smallOf(url)).toBe("https://x.supabase.co/storage/v1/object/public/images/u/service/abc.s-sm.webp");
    expect(photoSrcSet(url)).toBe(`${smallOf(url)} 700w, ${url} 1400w`);
  });

  it("offers nothing for older photos, demo files or nothing at all", () => {
    for (const old of ["https://x.supabase.co/storage/v1/object/public/images/u/service/abc.webp", "/mock/glow/hero.webp", undefined, null, ""]) {
      expect(smallOf(old)).toBeNull();
      expect(photoSrcSet(old)).toBeUndefined();
    }
  });
});
