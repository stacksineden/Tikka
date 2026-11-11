import { describe, expect, it } from "vitest";
import { ACTION_KINDS } from "./setup";
import { parseSocial, socialHref, SOCIAL_KINDS } from "./social";

describe("social links: a username or a link becomes the same stored value", () => {
  it("Instagram", () => {
    for (const v of ["glowstudio", "@glowstudio", "instagram.com/glowstudio", "https://www.instagram.com/glowstudio/?igsh=abc123", "http://m.instagram.com/glowstudio"]) {
      expect(parseSocial("instagram", v), v).toBe("glowstudio");
    }
    expect(socialHref("instagram", "glow.studio_ng")).toBe("https://instagram.com/glow.studio_ng");
  });

  it("TikTok", () => {
    for (const v of ["glowstudio", "@glowstudio", "tiktok.com/@glowstudio", "https://www.tiktok.com/@glowstudio?lang=en", "https://m.tiktok.com/@glowstudio/video/123"]) {
      expect(parseSocial("tiktok", v), v).toBe("glowstudio");
    }
    expect(parseSocial("tiktok", "https://www.tiktok.com/discover/glow")).toBeNull();
    expect(socialHref("tiktok", "glowstudio")).toBe("https://www.tiktok.com/@glowstudio");
  });

  it("Facebook, including profile.php links", () => {
    for (const v of ["glowstudiong", "facebook.com/glowstudiong", "https://web.facebook.com/glowstudiong", "https://m.facebook.com/glowstudiong?ref=bookmarks", "fb.com/glowstudiong"]) {
      expect(parseSocial("facebook", v), v).toBe("glowstudiong");
    }
    expect(parseSocial("facebook", "https://www.facebook.com/profile.php?id=100089123456789")).toBe("profile.php?id=100089123456789");
    expect(parseSocial("facebook", "https://www.facebook.com/groups/123456")).toBeNull();
    expect(socialHref("facebook", "profile.php?id=100089123456789")).toBe("https://www.facebook.com/profile.php?id=100089123456789");
  });

  it("X, from x.com or twitter.com", () => {
    for (const v of ["glowstudio", "@glowstudio", "x.com/glowstudio", "https://twitter.com/glowstudio", "https://x.com/glowstudio/status/123"]) {
      expect(parseSocial("x", v), v).toBe("glowstudio");
    }
    expect(parseSocial("x", "a_name_that_is_far_too_long")).toBeNull();
    expect(socialHref("x", "glowstudio")).toBe("https://x.com/glowstudio");
  });

  it("YouTube handles and older channel links", () => {
    for (const v of ["glowstudio", "@glowstudio", "youtube.com/@glowstudio", "https://www.youtube.com/@glowstudio/videos", "https://m.youtube.com/@glowstudio"]) {
      expect(parseSocial("youtube", v), v).toBe("@glowstudio");
    }
    expect(parseSocial("youtube", "https://www.youtube.com/channel/UC1234567890abcdefghijkl")).toBe("channel/UC1234567890abcdefghijkl");
    expect(parseSocial("youtube", "https://youtube.com/c/GlowStudio")).toBe("c/GlowStudio");
    expect(parseSocial("youtube", "https://www.youtube.com/watch?v=abc")).toBeNull();
    expect(socialHref("youtube", "@glowstudio")).toBe("https://www.youtube.com/@glowstudio");
  });

  it("refuses links to the wrong platform, other sites and junk", () => {
    expect(parseSocial("instagram", "https://www.tiktok.com/@glowstudio")).toBeNull();
    expect(parseSocial("tiktok", "instagram.com/glowstudio")).toBeNull();
    expect(parseSocial("x", "https://glowstudio.com/about")).toBeNull();
    expect(parseSocial("instagram", "glow studio")).toBeNull();
    expect(parseSocial("facebook", "  ")).toBeNull();
    expect(parseSocial("instagram", "https://instagram.com/")).toBeNull();
  });

  it("every social page is a card button option", () => {
    for (const k of SOCIAL_KINDS) expect(ACTION_KINDS.find((a) => a.kind === k)?.input).toBe("social");
  });
});
