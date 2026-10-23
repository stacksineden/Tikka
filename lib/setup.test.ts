import { describe, expect, it } from "vitest";
import { checkBrandColor, contrast, ON_INK, ON_WHITE, SWATCHES } from "./color";
import { formatNgPhone, formatTime, initialsFrom, normalizeNgPhone, prefixAlternatives, suggestPrefix, validateCard, type CardDraft } from "./setup";

describe("brand colour check", () => {
  it("picks white on dark colours and ink on light ones", () => {
    expect(checkBrandColor("#9C3B5C")).toMatchObject({ on: ON_WHITE, ok: true });
    expect(checkBrandColor("#F4E04D")).toMatchObject({ on: ON_INK, ok: true });
  });

  it("suggests a darker shade when neither text colour reaches 4.5:1", () => {
    const c = checkBrandColor("#C4567E");
    expect(c.ok).toBe(false);
    expect(c.suggestion).toBeDefined();
    expect(contrast(c.suggestion!, ON_WHITE)).toBeGreaterThanOrEqual(4.5);
  });

  it("only suggests swatches that work with white text", () => {
    for (const s of SWATCHES) expect(checkBrandColor(s.hex)).toMatchObject({ on: ON_WHITE, ok: true });
  });
});

describe("names and prefixes", () => {
  it("makes initials", () => {
    expect(initialsFrom("Glow Studio")).toBe("GS");
    expect(initialsFrom("Kemzy")).toBe("KE");
    expect(initialsFrom("  ")).toBe("");
  });

  it("suggests a two-letter code prefix", () => {
    expect(suggestPrefix("Glow Studio")).toBe("GS");
    expect(suggestPrefix("Mama Put's Deluxe")).toBe("MP");
    expect(suggestPrefix("Q")).toBe("QX");
  });

  it("offers alternatives that aren't taken", () => {
    expect(prefixAlternatives("Glow Studio", new Set(["GS", "GL"]))).toEqual(["GO", "GW", "GT"]);
  });
});

describe("Nigerian phone numbers", () => {
  it("normalises the usual ways people type them", () => {
    for (const v of ["0803 000 0000", "8030000000", "+234 803 000 0000", "234-803-000-0000"]) {
      expect(normalizeNgPhone(v)).toBe("+2348030000000");
    }
  });

  it("rejects what isn't a mobile number", () => {
    expect(normalizeNgPhone("0803 000")).toBeNull();
    expect(normalizeNgPhone("01 234 5678")).toBeNull();
  });

  it("formats for display", () => {
    expect(formatNgPhone("+2348030000000")).toBe("0803 000 0000");
  });
});

describe("validateCard", () => {
  const good: CardDraft = {
    name: "Glow Studio",
    category: "Beauty",
    state: "Lagos",
    city: "Lagos",
    area: "Lekki",
    brandColor: "#9c3b5c",
    logoUrl: "data:image/webp;base64,AAAA",
    background: { type: "pattern", pattern: "dots" },
    actions: [{ kind: "whatsapp", value: "0803 000 0000" }],
    codePrefix: "gs",
  };

  it("accepts a complete card and normalises it", () => {
    const r = validateCard(good);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.card).toMatchObject({ brandColor: "#9C3B5C", onBrandColor: ON_WHITE, codePrefix: "GS", initials: "GS" });
      expect(r.card.actions[0].value).toBe("+2348030000000");
    }
  });

  it("names every missing required field", () => {
    const r = validateCard({ ...good, name: "", logoUrl: undefined, actions: [], state: "Atlantis", codePrefix: "G" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["actions", "codePrefix", "logo", "name", "state"]);
  });

  it("lets the Services button through only when there are services", () => {
    const withButton = { ...good, actions: [{ kind: "services" as const, value: "" }] };
    const none = validateCard(withButton);
    expect(none.ok).toBe(false);
    if (!none.ok) expect(Object.keys(none.errors)).toEqual(["action-0"]);
    const some = validateCard({ ...withButton, services: [{ name: "Amala and gbegiri", price: 3500 }] });
    expect(some.ok).toBe(true);
    if (some.ok) expect(some.card.actions).toEqual([{ kind: "services", value: "services" }]);
  });

  it("rejects an unreadable brand colour and a bad number", () => {
    const r = validateCard({ ...good, brandColor: "#C4567E", actions: [{ kind: "call", value: "123" }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["action-0", "brandColor"]);
  });
});

it("formats opening times", () => {
  expect(formatTime("09:00")).toBe("9am");
  expect(formatTime("19:30")).toBe("7:30pm");
  expect(formatTime("12:00")).toBe("12pm");
});
