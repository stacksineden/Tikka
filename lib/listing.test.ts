import { describe, expect, it } from "vitest";
import { cleanExtras, cleanLanguages, extrasForPage, LISTING_TERMS, LISTING_TERMS_VERSION } from "./listing";

describe("listing extras", () => {
  it("keeps only known extras and languages, once, in list order", () => {
    expect(cleanExtras(["card", "ac", "ac", "spaceship", 4])).toEqual(["ac", "card"]);
    expect(cleanLanguages(["yo", "en", "xx"])).toEqual(["en", "yo"]);
    expect(cleanExtras("ac")).toEqual([]);
  });

  it("groups the picks for the listing page, leaving empty groups out", () => {
    expect(extrasForPage(["power", "cash", "transfer"], ["pcm"])).toEqual([
      { label: "Comforts", items: ["Always-on power"] },
      { label: "Payment", items: ["Cash", "Transfer"] },
      { label: "Languages", items: ["Pidgin"] },
    ]);
    expect(extrasForPage()).toEqual([]);
  });
});

describe("listing terms", () => {
  it("are dated and say the fee promise plainly", () => {
    expect(LISTING_TERMS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(LISTING_TERMS.join(" ")).toMatch(/free for now/);
    expect(LISTING_TERMS.join(" ")).toMatch(/30 days/);
    expect(LISTING_TERMS.join(" ")).not.toMatch(/\b(win|luck|odds|bet)\b/i);
  });
});
