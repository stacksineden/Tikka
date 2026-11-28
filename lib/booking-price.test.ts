import { describe, expect, it } from "vitest";
import { choiceLabel, cleanChoice, needsChoice, priceBooking } from "./booking-price";
import type { ServiceItem } from "./types";

const braids: ServiceItem = {
  name: "Knotless braids",
  price: 19000,
  options: [
    { label: "Short", price: 19000, minutes: 240 },
    { label: "Long", price: 26500, minutes: 360 },
  ],
  extras: [{ name: "Add wash", price: 1500 }],
};
const bridal: ServiceItem = {
  name: "Bridal makeup",
  price: 150000,
  eventDay: true,
  perPerson: true,
  options: [
    { label: "Bride", price: 150000, minutes: 180 },
    { label: "Each bridesmaid", price: 25000, minutes: 60 },
  ],
};

describe("priceBooking", () => {
  it("prices a choice, extras and home service with a 30% deposit", () => {
    const p = priceBooking(braids, { option: 1, extras: [0, 0], home: true }, 3000, { mode: "percent", percent: 30, counts: true });
    expect(p.totalNaira).toBe(31000);
    expect(p.depositNaira).toBe(9500);
    expect(p.restNaira).toBe(21500);
    expect(p.minutes).toBe(360);
    expect(p.detail).toBe("Long, add wash");
  });

  it("prices people for an event day with a 50% deposit", () => {
    const p = priceBooking(bridal, { people: [5, 3] }, 10000, { mode: "percent", percent: 30, counts: true });
    expect(p.lines.map((l) => l.label)).toEqual(["Bride", "Each bridesmaid × 3"]);
    expect(p.totalNaira).toBe(225000);
    expect(p.depositNaira).toBe(112500);
    expect(p.depositLabel).toBe("50%");
  });

  it("takes no deposit when the business takes none, and the full price on the day when it doesn't count", () => {
    expect(priceBooking(braids, { option: 0 }, 0, undefined).depositNaira).toBe(0);
    const p = priceBooking(braids, { option: 0 }, 0, { mode: "fixed", fixedKobo: 500_000, counts: false });
    expect(p.depositNaira).toBe(5000);
    expect(p.restNaira).toBe(19000);
  });
});

describe("the owner's choice (Add a booking, New sale)", () => {
  const shoot: ServiceItem = { name: "Photo shoot", price: 4000, priceKind: "fixed", minutes: 30, unit: "item", unitLabel: "photo", unitMin: 1, unitMax: 20, unitMinutes: 15 };
  const facial: ServiceItem = { name: "Facial", price: 10000, priceKind: "fixed", minutes: 60 };

  it("asks for options, per hour, per item and per person, never a plain price", () => {
    expect(needsChoice(shoot)).toBe(true);
    expect(needsChoice(braids)).toBe(true);
    expect(needsChoice(facial)).toBe(false);
    expect(needsChoice({ ...facial, options: [{ label: "Only", price: 10000, minutes: 60 }] })).toBe(false);
    expect(needsChoice({ ...shoot, eventDay: true })).toBe(false);
  });

  it("prices 4 photos at ₦16,000 and names the sale", () => {
    const p = priceBooking(shoot, { qty: 4 }, 0, undefined);
    expect(p.totalNaira).toBe(16000);
    expect(p.minutes).toBe(60);
    expect(choiceLabel(shoot, p)).toBe("Photo shoot · 4 photos");
    expect(choiceLabel(facial, priceBooking(facial, {}, 0, undefined))).toBe("Facial");
  });

  it("keeps a choice from the browser to whole numbers", () => {
    expect(cleanChoice({ option: 1, qty: 4, people: [1, 2] })).toEqual({ option: 1, qty: 4, people: [1, 2] });
    expect(cleanChoice({ option: -1, qty: 4.5, people: [1, "x", 99] })).toEqual({ option: undefined, qty: undefined, people: [1, 0, 0] });
    expect(cleanChoice("nope")).toBeUndefined();
  });
});
