import { describe, expect, it } from "vitest";
import {
  backgroundFrom,
  backgroundTo,
  businessFrom,
  cardTo,
  nigerianE164,
  pageFrom,
  pageTo,
  portfolioDetailsTo,
  portfolioFrom,
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

describe("portfolio photo details", () => {
  const row = { id: "p1", kind: "photo" as const, image_path: "media/a.webp", thumb_path: "media/a-t.webp", caption: null, duration_s: null };
  it("reads shape, colour and camera when saved, and nothing when not", () => {
    expect(portfolioFrom({ ...row, width: 1600, height: 2000, tone: "#b98a4e", camera: { camera: "Canon EOS R5" } })).toMatchObject({ width: 1600, height: 2000, tone: "#b98a4e", camera: { camera: "Canon EOS R5" } });
    const old = portfolioFrom(row);
    expect(old.width).toBeUndefined();
    expect(old.tone).toBeUndefined();
    expect(old.camera).toBeUndefined();
  });
  it("only sends details the database accepts", () => {
    expect(portfolioDetailsTo({ width: 1600.4, height: 2000, tone: "#b98a4e", camera: { iso: "ISO 100" } })).toEqual({ width: 1600, height: 2000, tone: "#b98a4e", camera: { iso: "ISO 100" } });
    expect(portfolioDetailsTo({ width: 1600, tone: "gold", camera: {} })).toEqual({});
    expect(portfolioDetailsTo({ camera: { camera: "x".repeat(400) } })).toEqual({});
  });
});

describe("the new direction's fields (docs/DB_MOVE.md step 1)", () => {
  const row = (b: Business): BusinessRow => ({ id: "b1", verified: false, suspended: false, rating_avg: null, rating_count: 0, is_demo: false, ...cardTo(b) }) as BusinessRow;

  it("round-trip trades, home service, rules and gaps", () => {
    const b: Business = { ...business, trades: ["hair", "makeup"], workPlace: "both", travelFee: 5000, travelReach: "city", bookingRules: ["Come with washed hair"], gapMinutes: 15, homeGapMinutes: 30 };
    const back = businessFrom(row(b), null, null, [], [], [], []);
    expect(back).toMatchObject({ trades: ["hair", "makeup"], workPlace: "both", travelFee: 5000, travelReach: "city", bookingRules: ["Come with washed hair"], gapMinutes: 15, homeGapMinutes: 30 });
    expect(cardTo(b)).toMatchObject({ travel_fee_kobo: 500000 });
  });

  it("stay empty for a business set up the old way", () => {
    const back = businessFrom(row(business), null, null, [], [], [], []);
    expect(back.trades).toBeUndefined();
    expect(back.workPlace).toBeUndefined();
    expect(back.bookingRules).toBeUndefined();
    expect(cardTo(business)).toMatchObject({ trades: null, work_place: null, travel_fee_kobo: null, booking_rules: null, gap_minutes: null });
  });

  it("drop the travel fee for a shop and blank booking rules (the database insists)", () => {
    const c = cardTo({ ...business, workPlace: "shop", travelFee: 5000, travelReach: "city", bookingRules: [" ", "Be on time "] });
    expect(c).toMatchObject({ work_place: "shop", travel_fee_kobo: null, travel_reach: null, booking_rules: ["Be on time"] });
  });

  it("round-trip service options, extras, questions and gaps in kobo", () => {
    const s = {
      name: "Bridal makeup",
      price: 80000,
      minutes: 120,
      options: [{ label: "Bride", price: 80000, minutes: 120 }, { label: "Each bridesmaid", price: 25000, minutes: 45 }],
      extras: [{ name: "Lashes", price: 3000 }],
      eventDay: true,
      perPerson: true,
      questions: ["How many people? ", ""],
      gapMinutes: 30,
    };
    const out = serviceTo(s);
    expect(out).toMatchObject({ options: [{ label: "Bride", price_kobo: 8000000, minutes: 120 }, { label: "Each bridesmaid", price_kobo: 2500000, minutes: 45 }], extras: [{ name: "Lashes", price_kobo: 300000 }], event_day: true, per_person: true, questions: ["How many people?"], gap_minutes: 30 });
    const back = serviceFrom({ id: "s1", ...out } as Parameters<typeof serviceFrom>[0]);
    expect(back).toMatchObject({ options: s.options, extras: s.extras, eventDay: true, perPerson: true, questions: ["How many people?"], gapMinutes: 30 });
  });

  it("never send per person without two options", () => {
    expect(serviceTo({ name: "Gele", price: 5000, perPerson: true, options: [{ label: "One", price: 5000, minutes: 30 }] }).per_person).toBe(false);
    expect(serviceTo({ name: "Silk press", price: 15000 })).toMatchObject({ options: null, extras: null, event_day: false, per_person: false, questions: null, gap_minutes: null });
  });
});
