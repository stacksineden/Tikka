import { describe, expect, it } from "vitest";
import {
  backgroundFrom,
  backgroundTo,
  businessFrom,
  cardTo,
  nigerianE164,
  pageFrom,
  pageTo,
  privateTo,
  serviceFrom,
  serviceTo,
  type BusinessRow,
  type PageRow,
} from "./business-map";
import type { Business } from "./types";

const business: Business = {
  id: "b1",
  slug: "glowstudio",
  name: "Glow Studio",
  initials: "GS",
  category: "Beauty",
  area: "Lekki",
  city: "Lagos",
  state: "Lagos",
  brandColor: "#9C3B5C",
  onBrandColor: "#FFFFFF",
  codePrefix: "GS",
  logoUrl: "logos/gs.webp",
  background: { type: "pattern", pattern: "dots" },
  tagline: "Hair and nails",
  about: "Since 2019.",
  hours: { weekdays: { open: true, from: "09:00", to: "18:00" }, saturday: { open: true, from: "10:00", to: "16:00" }, sunday: { open: false, from: "09:00", to: "18:00" } },
  verified: false,
  reviewCount: 0,
  actions: [{ kind: "whatsapp", value: "+2348012345678" }],
  services: [],
  serveMode: "in_store",
  hasVideo: false,
  address: "12 Admiralty Way",
  portfolio: [],
  foundingMember: false,
  guaranteeUsed: false,
};

describe("the card", () => {
  it("round-trips through the businesses row", () => {
    const row: BusinessRow = { ...cardTo(business), id: "b1", verified: false, suspended: false, rating_avg: "4.5", rating_count: 2, is_demo: false };
    const back = businessFrom(row, null, null, [], [], [], []);
    expect(back).toMatchObject({ ...business, rating: 4.5, reviewCount: 2, page: undefined, isDemo: false });
    expect(back.initials).toBe("GS");
  });

  it("tidies what the owner typed", () => {
    expect(cardTo({ ...business, name: "  Glow Studio ", slug: "GlowStudio", codePrefix: "gs", tagline: "  ", address: "" })).toMatchObject({
      name: "Glow Studio",
      slug: "glowstudio",
      code_prefix: "GS",
      tagline: null,
      address: null,
    });
  });

  it("maps every card background", () => {
    for (const bg of [{ type: "color" }, { type: "pattern", pattern: "sparks" }, { type: "photo", url: "bg/x.webp" }] as const) {
      const r = backgroundTo(bg);
      expect(backgroundFrom(r.background_type, r.background_value)).toEqual(bg);
    }
    expect(backgroundFrom("photo", null)).toEqual({ type: "color" });
  });
});

describe("owner alerts", () => {
  it("stores Nigerian numbers as +234…", () => {
    expect(nigerianE164("0803 123 4567")).toBe("+2348031234567");
    expect(nigerianE164("234-803-123-4567")).toBe("+2348031234567");
    expect(nigerianE164("+2348031234567")).toBe("+2348031234567");
    expect(nigerianE164("12345")).toBeNull();
    expect(nigerianE164(undefined)).toBeNull();
  });

  it("keeps the daily summary on unless turned off", () => {
    expect(privateTo(business).daily_summary).toBe(true);
    expect(privateTo({ ...business, dailySummary: false }).daily_summary).toBe(false);
  });
});

describe("services", () => {
  it("are naira on screen and kobo in the database", () => {
    const row = serviceTo({ name: " Silk press ", price: 25000, priceKind: "fixed", group: "Hair", duration: "2 hr" });
    expect(row).toMatchObject({ name: "Silk press", price_kobo: 2_500_000, price_kind: "fixed", group_name: "Hair" });
    expect(serviceFrom({ id: "s1", ...row }).price).toBe(25000);
  });

  it("with no price become Ask for price (the database insists)", () => {
    expect(serviceTo({ name: "Braids", price: null, priceKind: "fixed" })).toMatchObject({ price_kobo: null, price_kind: "ask" });
    expect(serviceTo({ name: "Braids", price: 5000, priceKind: "ask" })).toMatchObject({ price_kobo: null, price_kind: "ask" });
  });
});

describe("the page", () => {
  it("round-trips, with team and FAQs", () => {
    const page = {
      heroImageUrl: "page/hero.webp",
      heroFocal: { x: 0.3, y: 0.6 },
      headline: "Hair and beauty in Lekki",
      showTeam: true,
      showFaqs: true,
      showText: true,
      textTitle: "Our promise",
      textBody: "On time.",
    };
    const row = pageTo(page) as PageRow;
    const back = pageFrom(row, [{ id: "t1", name: "Tobi", role: "Stylist", photo_path: null }], [{ id: "f1", question: "Walk-ins?", answer: "Yes." }]);
    expect(back).toMatchObject({ ...page, team: [{ id: "t1", name: "Tobi", role: "Stylist" }], faqs: [{ id: "f1", q: "Walk-ins?", a: "Yes." }] });
  });

  it("has defaults for a page nobody has touched", () => {
    expect(pageTo(undefined)).toMatchObject({ hero_focal_x: 0.5, hero_focal_y: 0.5, show_team: false, headline: null });
  });
});
