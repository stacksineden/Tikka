import { describe, expect, it } from "vitest";
import { photoSrcSet, smallOf, xsOf } from "./media-path";

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

describe("blurred copies", () => {
  const base = `${(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "")}/storage/v1/object/public/`;
  it("sits beside any photo in the images bucket", () => {
    expect(xsOf(`${base}images/u/service/abc.s.webp`)).toBe(`${base}images/u/service/abc.s-xs.webp`);
    expect(xsOf(`${base}images/u/logo/old.webp`)).toBe(`${base}images/u/logo/old-xs.webp`);
  });
  it("has none for demo files, videos or itself", () => {
    for (const u of ["/mock/glow/hero.webp", `${base}videos/u/v.mp4`, `${base}images/u/a-xs.webp`, `${base}images/u/a.png`, undefined, ""]) expect(xsOf(u)).toBeNull();
  });
});
