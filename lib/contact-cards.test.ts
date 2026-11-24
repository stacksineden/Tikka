import { describe, expect, it } from "vitest";
import { ALPHABET } from "./codes";
import { contrast } from "./color";
import {
  availableStyles,
  boldLines,
  cardInk,
  cardQrColors,
  fitMm,
  cardCta,
  cardHeading,
  cardInstagram,
  cardPhone,
  cardPhoto,
  cardPlace,
  cardStyle,
  contactLines,
  contactScanPath,
  contactTarget,
  defaultStyle,
  newContactCard,
  newContactCode,
  normalizeContactCode,
  pageLink,
  validatePerson,
  whatWeDo,
} from "./contact-cards";
import { seededRng } from "./deck";
import type { Business, PortfolioPhoto } from "./types";

const photo = (id: string, kind: "photo" | "video" = "photo"): PortfolioPhoto => ({ id, kind, url: `/${id}.webp`, thumbUrl: `/${id}-t.webp` });

const biz = (over: Partial<Business> = {}): Business =>
  ({
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
    background: { type: "color" },
    verified: true,
    reviewCount: 0,
    actions: [
      { kind: "whatsapp", value: "+2348030000000" },
      { kind: "instagram", value: "https://instagram.com/glowstudio.ng" },
    ],
    services: [
      { name: "Signature facial", price: 25000, group: "Facials" },
      { name: "Hydrating facial", price: 30000, group: "Facials" },
      { name: "Chemical peel", price: 40000, group: "Peels" },
      { name: "Brow lamination", price: 15000, group: "Brows & lashes" },
    ],
    hasVideo: false,
    portfolio: [],
    foundingMember: false,
    guaranteeUsed: false,
    ...over,
  }) as Business;

describe("card codes", () => {
  it("are 6 characters from the Tikka alphabet", () => {
    const rng = seededRng(3);
    for (let i = 0; i < 50; i++) {
      const c = newContactCode(rng);
      expect(c).toHaveLength(6);
      expect([...c].every((x) => ALPHABET.includes(x))).toBe(true);
    }
  });
  it("forgive how a link is typed", () => {
    expect(normalizeContactCode("gs7 kqa")).toBeNull(); // S isn't in the alphabet
    expect(normalizeContactCode("ac7-kqm")).toBe("AC7KQM");
    expect(normalizeContactCode("AC7KQ")).toBeNull();
    expect(normalizeContactCode("AC7KQ0")).toBeNull();
  });
  it("always open the business page, never a drop", () => {
    expect(contactScanPath("AC7KQM")).toBe("/c/AC7KQM");
    expect(contactTarget("glowstudio")).toBe("/glowstudio?c=card");
    expect(pageLink("glowstudio")).toBe("usetikka.com/glowstudio");
  });
});

describe("styles", () => {
  it("lead with a photo for photographers and beauty when they have one", () => {
    expect(defaultStyle(biz({ portfolio: [photo("p1")] }))).toBe("photo");
    expect(defaultStyle(biz({ category: "Photography", portfolio: [photo("p1")] }))).toBe("photo");
    expect(defaultStyle(biz())).toBe("classic");
    expect(defaultStyle(biz({ category: "Food & drinks", portfolio: [photo("p1")] }))).toBe("classic");
    expect(defaultStyle(biz({ portfolio: [photo("v1", "video")] }))).toBe("classic");
  });
  it("offer Photo only with a photo to put on it", () => {
    expect(availableStyles(biz())).toEqual(["classic", "minimal", "bold"]);
    expect(availableStyles(biz({ portfolio: [photo("p1")] }))).toEqual(["classic", "photo", "minimal", "bold"]);
  });
  it("keep the owner's pick, and fall back when a Photo card has no photos left", () => {
    expect(cardStyle({ style: "bold" }, biz())).toBe("bold");
    expect(cardStyle({ style: undefined }, biz({ portfolio: [photo("p1")] }))).toBe("photo");
    expect(cardStyle({ style: "photo" }, biz())).toBe("classic");
  });
});

describe("the photo", () => {
  const b = biz({ portfolio: [photo("v1", "video"), photo("p1"), photo("p2")] });
  it("is the owner's pick while it's on their page", () => {
    expect(cardPhoto({ photoId: "p2" }, b)?.id).toBe("p2");
  });
  it("is otherwise the first photo, never a video", () => {
    expect(cardPhoto({ photoId: undefined }, b)?.id).toBe("p1");
    expect(cardPhoto({ photoId: "gone" }, b)?.id).toBe("p1");
    expect(cardPhoto({ photoId: "v1" }, b)?.id).toBe("p1");
    expect(cardPhoto({}, biz())).toBeUndefined();
  });
});

describe("the lines", () => {
  it("say what they do in one line", () => {
    expect(whatWeDo(biz())).toBe("Facials · Peels · Brows & lashes");
    expect(whatWeDo(biz({ services: [] }))).toBe("Hair and beauty");
    expect(whatWeDo(biz({ services: [{ name: "Birthday portraits", price: 1 }, { name: "Couples & pre-wedding", price: 1 }, { name: "Maternity", price: 1 }] }))).toBe("Birthday portraits · Maternity");
    for (const line of [whatWeDo(biz({ services: Array.from({ length: 6 }, (_, i) => ({ name: `A really long service name ${i}`, price: 1 })) }))]) {
      expect(line.length).toBeLessThanOrEqual(38);
    }
  });
  it("use the WhatsApp number, else the Call number, written the Nigerian way", () => {
    expect(cardPhone(biz())).toBe("0803 000 0000");
    expect(cardPhone(biz({ actions: [{ kind: "call", value: "08031110099" }] }))).toBe("0803 111 0099");
    expect(cardPhone(biz({ actions: [] }))).toBeUndefined();
  });
  it("read the Instagram handle from a link or a name", () => {
    expect(cardInstagram(biz())).toBe("@glowstudio.ng");
    expect(cardInstagram(biz({ actions: [{ kind: "instagram", value: "@imolestudio" }] }))).toBe("@imolestudio");
    expect(cardInstagram(biz({ actions: [] }))).toBeUndefined();
  });
  it("say where they are, nationwide", () => {
    expect(cardPlace(biz())).toBe("Lekki, Lagos");
    expect(cardPlace(biz({ area: "Bodija", city: "Ibadan" }))).toBe("Bodija, Ibadan");
    expect(cardPlace(biz({ serveMode: "online" }))).toBe("Serves all of Nigeria");
    expect(cardPlace(biz({ serveMode: "come_to_you", city: "Abuja" }))).toBe("We come to you · Abuja");
  });
  it("hide what the owner hides and what the business doesn't have", () => {
    const all = { showPhone: true, showInstagram: true, showPlace: true };
    expect(contactLines(all, biz())).toEqual({ phone: "0803 000 0000", instagram: "@glowstudio.ng", place: "Lekki, Lagos" });
    expect(contactLines({ ...all, showPhone: false, showPlace: false }, biz())).toEqual({ instagram: "@glowstudio.ng" });
    expect(contactLines(all, biz({ actions: [{ kind: "whatsapp", value: "08030000000" }] })).instagram).toBeUndefined();
  });
  it("ask people to book only when bookings are on", () => {
    expect(cardCta(true, "Beauty")).toBe("Scan to book");
    expect(cardCta(true, "Photography")).toBe("Scan to book a shoot");
    expect(cardCta(false, "Beauty")).toBe("Scan to see our work");
  });
  it("head the back with the person, or the business", () => {
    expect(cardHeading({ personName: "Funmi Adeyemi", personRole: "Founder" }, biz())).toEqual({ name: "Funmi Adeyemi", sub: "Founder · Glow Studio" });
    expect(cardHeading({ personName: "Ada" }, biz())).toEqual({ name: "Ada", sub: "Glow Studio" });
    expect(cardHeading({}, biz())).toEqual({ name: "Glow Studio", sub: "Facials · Peels · Brows & lashes" });
  });
});

describe("a person's card", () => {
  it("needs a name for a role, within the limits, without gambling words", () => {
    expect(validatePerson("Funmi Adeyemi", "Founder")).toBeNull();
    expect(validatePerson("", "")).toBeNull();
    expect(validatePerson("", "Founder")).toMatch(/name/);
    expect(validatePerson("x".repeat(41), "")).toMatch(/40/);
    expect(validatePerson("Ada", "Lucky charm")).toMatch(/other words/);
  });
  it("starts from the defaults", () => {
    const c = newContactCard("b1", "AC7KQM", new Date("2026-11-24T10:00:00Z"), { name: " Ada ", role: " Lash artist " });
    expect(c).toMatchObject({ code: "AC7KQM", personName: "Ada", personRole: "Lash artist", rounded: false, showPhone: true, showInstagram: true, showPlace: true, scansMonth: 0 });
    expect(newContactCard("b1", "AC7KQM", new Date(), { role: "Founder" }).personRole).toBeUndefined();
  });
});

describe("layout and colour", () => {
  it("shrinks a long headline to fit, never grows a short one", () => {
    expect(fitMm("Glow Studio", 6.4, 71)).toBe(6.4);
    expect(fitMm("The Very Long Beauty And Wellness Studio Lekki", 6.4, 71)).toBeLessThan(6.4);
    expect(fitMm("", 6.4, 71)).toBe(6.4);
  });
  it("sets Bold on two lines", () => {
    expect(boldLines("Glow Studio")).toEqual(["Glow", "Studio"]);
    expect(boldLines("Mama Put Kitchen")).toEqual(["Mama", "Put Kitchen"]);
    expect(boldLines("Glow")).toEqual(["Glow", ""]);
  });
  it("keeps the QR and small text readable in any brand colour", () => {
    for (const hex of ["#9C3B5C", "#7A5A2E", "#F4D35E", "#FFFFFF", "#2B2B2B"]) {
      const qr = cardQrColors({ brandColor: hex });
      expect(qr.light).toBe("#FFFFFF");
      expect(contrast(qr.dark, qr.light)).toBeGreaterThanOrEqual(10);
      expect(contrast(cardInk({ brandColor: hex }), "#FFFFFF")).toBeGreaterThanOrEqual(7);
    }
  });
});
