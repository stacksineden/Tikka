import { describe, expect, it } from "vitest";
import { priceBooking } from "./booking-price";
import { priceText } from "./page";
import type { ServiceItem } from "./types";
import { clampQty, countText, unitRange, unitWord } from "./units";

const shoot: ServiceItem = {
  name: "Studio shoot",
  price: 15000,
  priceKind: "fixed",
  minutes: 60,
  unit: "hour",
  unitMin: 1,
  unitMax: 6,
  options: [
    { label: "Studio only", price: 15000, minutes: 60 },
    { label: "With makeup artist", price: 25000, minutes: 60 },
  ],
};
const photos: ServiceItem = { name: "Edited photos", price: 5000, priceKind: "fixed", minutes: 30, unit: "item", unitLabel: "photo", unitMin: 2, unitMax: 20, unitMinutes: 15 };

describe("units", () => {
  it("names how many, like the database", () => {
    expect(unitWord("photo", 3)).toBe("photos");
    expect(unitWord("Dress", 2)).toBe("dresses");
    expect(unitWord("look", 1)).toBe("look");
    expect(countText(shoot, 1)).toBe("1 hour");
    expect(countText(shoot, 3)).toBe("3 hours");
    expect(countText(photos, 5)).toBe("5 photos");
  });

  it("keeps how many within the owner's range, hours at most 10", () => {
    expect(clampQty(shoot, 40)).toBe(6);
    expect(clampQty(photos, undefined)).toBe(2);
    expect(unitRange({ unit: "hour", unitMax: 30 })).toEqual({ min: 1, max: 10 });
    expect(unitRange({})).toBeNull();
  });

  it("shows the price for one on the page", () => {
    expect(priceText(shoot)).toBe("₦15,000 – ₦25,000 per hour");
    expect(priceText(photos)).toBe("₦5,000 per photo");
  });
});

describe("pricing per hour and per item", () => {
  it("multiplies the price for one, and the hours set the time", () => {
    const p = priceBooking(shoot, { qty: 3 }, 0, undefined);
    expect(p.totalNaira).toBe(45000);
    expect(p.minutes).toBe(180);
    expect(p.detail).toBe("Studio only, 3 hours");
    expect(p.lines[0].label).toBe("Studio shoot, studio only · 3 hours × ₦15,000");
  });

  it("lets an option set the price per hour", () => {
    expect(priceBooking(shoot, { qty: 2, option: 1 }, 0, undefined).totalNaira).toBe(50000);
  });

  it("uses each item's own time, and at least the least", () => {
    expect(priceBooking(photos, {}, 0, undefined).totalNaira).toBe(10000);
    const p = priceBooking(photos, { qty: 5 }, 0, undefined);
    expect(p.totalNaira).toBe(25000);
    expect(p.minutes).toBe(75);
    expect(p.detail).toBe("5 photos");
  });

  it("works the deposit out on the whole total", () => {
    expect(priceBooking(shoot, { qty: 3 }, 0, { mode: "percent", percent: 30, counts: true }).depositNaira).toBe(13500);
  });
});
