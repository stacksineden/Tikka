import { describe, expect, it } from "vitest";
import glow from "./mock/business.json";
import { bookingLink, focalPosition, heroHeadline, heroLine, whereLine, pageChecklist, pageDropsFrom, priceText, serviceGroups, showsLocation, visibleSections } from "./page";
import type { Business } from "./types";

const base = { ...(glow as unknown as Business), page: undefined, portfolio: [], services: [], about: undefined, hours: undefined, address: undefined };

describe("hero", () => {
  it("suggests a headline from the category, and says where they serve", () => {
    expect(heroHeadline(base)).toBe("Hair and beauty in Lekki");
    expect(heroLine(base)).toBe("Lekki, Lagos");
    expect(heroLine({ ...base, serveMode: "online" })).toBe("Serves all of Nigeria");
    expect(heroLine({ ...base, serveMode: "come_to_you" })).toBe("We come to you · Lagos");
    expect(heroHeadline({ ...base, page: { headline: "Skin that glows" } })).toBe("Skin that glows");
    expect(focalPosition({ x: 0.3, y: 1.4 })).toBe("30% 100%");
    // Their own line wins under the headline; where they serve always follows the setting.
    const own = { ...base, serveMode: "online" as const, page: { subline: "Facials and peels" } };
    expect(heroLine(own)).toBe("Facials and peels");
    expect(whereLine(own)).toBe("Serves all of Nigeria");
  });
});

describe("services", () => {
  it("reads prices plainly and books on WhatsApp", () => {
    expect(priceText({ price: 25000, priceKind: "fixed" })).toBe("₦25,000");
    expect(priceText({ price: 15000, priceKind: "from" })).toBe("From ₦15,000");
    expect(priceText({ price: null })).toBe("Ask for price");
    const b = { ...base, name: "Glow Studio", actions: [{ kind: "whatsapp" as const, value: "0803 774 4521" }] };
    expect(bookingLink(b, { name: "Knotless braids", price: 25000, priceKind: "fixed" })).toBe(
      `https://wa.me/2348037744521?text=${encodeURIComponent("Hi Glow Studio, I'd like to book Knotless braids (₦25,000).")}`,
    );
    expect(bookingLink({ ...b, actions: [], ownerWhatsapp: undefined })).toBeNull();
  });
  it("shows group tabs only with more than one group", () => {
    expect(serviceGroups([{ name: "a", price: 1, group: "Hair" }, { name: "b", price: 1, group: "Hair" }])).toEqual([]);
    expect(serviceGroups([{ name: "a", price: 1, group: "Hair" }, { name: "b", price: 1, group: "Nails" }, { name: "c", price: 1 }])).toEqual(["Hair", "Nails"]);
  });
});

describe("sections", () => {
  it("hide themselves when empty, in a fixed order", () => {
    expect(visibleSections(base, { reviews: 0 })).toEqual(["hero", "drop", "cta"]);
    const full: Business = {
      ...base,
      about: "We do facials.",
      address: "14 Admiralty Way",
      services: [{ name: "Facial", price: 20000 }],
      portfolio: [{ id: "p", url: "/x", thumbUrl: "/x" }],
      page: { showTeam: true, team: [{ id: "t", name: "Funmi" }], showFaqs: true, faqs: [{ id: "f", q: "Q?", a: "A." }], showText: true, textTitle: "Our promise", textBody: "Clean tools." },
    };
    expect(visibleSections(full, { reviews: 3 })).toEqual(["hero", "drop", "about", "services", "portfolio", "reviews", "team", "faqs", "text", "location", "cta"]);
    // Switched off or empty: hidden.
    expect(visibleSections({ ...full, page: { ...full.page, showTeam: false, faqs: [] } }, { reviews: 3 })).not.toContain("team");
    expect(visibleSections({ ...full, page: { ...full.page, faqs: [] } }, { reviews: 3 })).not.toContain("faqs");
  });
  it("drops hours and location for online and come-to-you businesses", () => {
    const b: Business = { ...base, address: "14 Admiralty Way", serveMode: "online" };
    expect(showsLocation(b)).toBe(false);
    expect(visibleSections(b, { reviews: 0 })).not.toContain("location");
  });
  it("tracks the four steps to finish the page", () => {
    expect(pageChecklist(base).filter((s) => s.done)).toHaveLength(0);
    const done = pageChecklist({
      ...base,
      page: { heroImageUrl: "/h.webp" },
      about: "A calm studio in Lekki for facials, peels and glow-ups since 2019.",
      services: [{ name: "a", price: 1 }, { name: "b", price: null, priceKind: "ask" }, { name: "c", price: 3 }],
      portfolio: Array.from({ length: 4 }, (_, i) => ({ id: `${i}`, url: "/x", thumbUrl: "/x" })),
    });
    expect(done.every((s) => s.done)).toBe(true);
  });
});

describe("editing the page", () => {
  it("checks lengths, the text section, team and FAQs", async () => {
    const { validatePage, validateServices } = await import("./page");
    expect(validatePage({ headline: "x".repeat(61) }).headline).toMatch(/under 60/);
    expect(validatePage({ showText: true, textTitle: "Promise" }).textBody).toMatch(/switch this section off/);
    expect(validatePage({ faqs: [{ id: "f", q: "Open Sunday?", a: "" }] }).faqs).toMatch(/needs an answer/);
    expect(validatePage({ headline: "Try your luck" }).form).toMatch(/Every Tikka holds something/);
    expect(validatePage({ headline: "Skin that glows" })).toEqual({});
    expect(validateServices([{ name: "Facial", price: null, priceKind: "fixed" }])["service-0"]).toMatch(/Add a price/);
    expect(validateServices([{ name: "Consultation", price: null, priceKind: "ask" }])).toEqual({});
  });
  it("allows 12 portfolio items with at most 3 videos of 15 s / 15 MB", async () => {
    const { videoProblem } = await import("./page");
    const three = [{ kind: "video" }, { kind: "video" }, { kind: "video" }];
    expect(videoProblem(three, 10, 1000)).toMatch(/Up to 3 videos/);
    expect(videoProblem([], 20, 1000)).toMatch(/15 seconds/);
    expect(videoProblem([], 10, 16 * 1024 * 1024)).toMatch(/15 MB/);
    expect(videoProblem(Array.from({ length: 12 }, () => ({ kind: "photo" })), 5, 100)).toMatch(/Up to 12/);
    expect(videoProblem([{ kind: "video" }], 14, 5_000_000)).toBeNull();
  });
});

describe("pageDropsFrom (the public page's and the poster's drops)", () => {
  const now = new Date("2026-11-07T12:00:00Z");
  const row = (over: Partial<{ slug: string; starts_at: string; ends_at: string; left: number }> = {}) => ({
    slug: "glow-up",
    title: "Glow up",
    starts_at: "2026-11-01T09:00:00Z",
    ends_at: "2026-11-20T21:00:00Z",
    total: 200,
    left: 120,
    ...over,
  });

  it("marks a running drop with Tikkas left as live, with its count", () => {
    expect(pageDropsFrom([row()], now)).toEqual([
      { slug: "glow-up", name: "Glow up", status: "live", total: 200, left: 120, startsAt: "2026-11-01T09:00:00.000Z", endsAt: "2026-11-20T21:00:00.000Z" },
    ]);
  });

  it("marks a drop that hasn't started as scheduled, and one with none left as sold out", () => {
    expect(pageDropsFrom([row({ starts_at: "2026-11-10T09:00:00Z" })], now)[0].status).toBe("scheduled");
    expect(pageDropsFrom([row({ left: 0 })], now)[0].status).toBe("sold_out");
  });

  it("leaves out drops that have ended", () => {
    expect(pageDropsFrom([row({ ends_at: "2026-11-07T11:59:00Z" })], now)).toEqual([]);
  });
});
