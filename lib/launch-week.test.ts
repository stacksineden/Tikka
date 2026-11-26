import { describe, expect, it } from "vitest";
import { lastDay, nudgeLink, nudgeText, stepsLeft, type LaunchRow } from "./launch-week";

const row = (over: Partial<LaunchRow> = {}): LaunchRow => ({
  id: "b1", name: "Maril kay", slug: "marilkay", city: "Ogbomoso", suspended: false, ownerWhatsapp: "+2348031234567",
  setupDone: false, listed: true, graceUntil: "2026-12-09T23:00:00Z", spacePhotos: 0, services: 10,
  bookingsOn: true, depositsOn: false, hasBank: true, paymentsOn: true, kycGraceUntil: "2026-12-07T23:00:00Z",
  bookings7d: 2, fromSearch7d: 0, ...over,
});
const now = new Date("2026-11-27T10:00:00Z");

describe("launch week", () => {
  it("lists what's left, most urgent first", () => {
    expect(stepsLeft(row(), now)).toEqual(["setup", "listing", "id", "deposits"]);
    expect(stepsLeft(row({ setupDone: true, termsAt: "2026-11-27", kycStatus: "approved", depositsOn: true }), now)).toEqual([]);
    expect(stepsLeft(row({ bookingsOn: false, paymentsOn: false, hasBank: false, kycGraceUntil: undefined }), now)).toEqual(["setup", "listing", "bookings"]);
  });

  it("names the last full day of a grace period", () => {
    expect(lastDay("2026-12-09T23:00:00Z")).toBe("9 December");
    expect(lastDay("2026-12-07T23:00:00Z")).toBe("7 December");
  });

  it("writes the nudge with each step and the dates, signed by the founder", () => {
    const t = nudgeText(row(), stepsLeft(row(), now));
    expect(t).toContain("1. tap “Finish setting up” on Today");
    expect(t).toContain("before the end of 9 December");
    expect(t).toContain("before the end of 7 December, so deposits keep working");
    expect(t).toMatch(/Samuel Adebisi, Founder, Tikka$/);
    expect(t).not.toMatch(/\b(win|luck|odds|bet)\b/i);
  });

  it("links to the owner's WhatsApp, or nothing without a number", () => {
    expect(nudgeLink(row())).toMatch(/^https:\/\/wa\.me\/2348031234567\?text=/);
    expect(nudgeLink(row({ ownerWhatsapp: undefined }))).toBeNull();
  });
});
