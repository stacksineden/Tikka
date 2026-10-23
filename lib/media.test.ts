import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fromStored, isInline, toStored } from "./media-path";
import { videoCodec } from "./video-codec";

const BASE = "https://proj.supabase.co/storage/v1/object/public/";
let before: string | undefined;
beforeAll(() => {
  before = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proj.supabase.co/";
});
afterAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = before;
});

describe("stored paths", () => {
  it("keep only the path of a Storage address, and give it back", () => {
    const url = `${BASE}images/u1/logo/a.webp`;
    expect(toStored(url)).toBe("images/u1/logo/a.webp");
    expect(fromStored("images/u1/logo/a.webp")).toBe(url);
    expect(fromStored(toStored(`${BASE}videos/u1/video/a.mp4`))).toBe(`${BASE}videos/u1/video/a.mp4`);
  });

  it("leave demo files and empty values alone", () => {
    expect(toStored("/api/demo/media/x")).toBe("/api/demo/media/x");
    expect(fromStored("/mock/glow/hero.webp")).toBe("/mock/glow/hero.webp");
    expect(toStored(undefined)).toBeNull();
    expect(fromStored(null)).toBeUndefined();
    // Only our two buckets count.
    expect(toStored(`${BASE}other/x.png`)).toBe(`${BASE}other/x.png`);
  });

  it("spot photos pasted in as data", () => {
    expect(isInline("data:image/webp;base64,AAAA")).toBe(true);
    expect(isInline(`${BASE}images/u1/a.webp`)).toBe(false);
    expect(isInline(undefined)).toBe(false);
  });
});

describe("video codec", () => {
  const file = (code: string, at = 100) => {
    const bytes = new Uint8Array(400).fill(0x20);
    bytes.set([...code].map((ch) => ch.charCodeAt(0)), at);
    return bytes;
  };
  it("tells H.264 from HEVC, wherever the index sits", () => {
    expect(videoCodec(file("avc1"))).toBe("h264");
    expect(videoCodec(file("hvc1", 390))).toBe("hevc");
    expect(videoCodec(file("hev1", 0))).toBe("hevc");
  });
  it("says unknown when there's no code to find", () => {
    expect(videoCodec(new Uint8Array(64))).toBe("unknown");
    expect(videoCodec(file("hvc"))).toBe("unknown");
  });
});
