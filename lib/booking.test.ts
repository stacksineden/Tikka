import { describe, expect, it } from "vitest";
import { bookingDays, bookingMessage, daySlots, slotLabel, whatsappLink } from "./booking";
import type { OpeningHours } from "./types";

const hours: OpeningHours = {
  weekdays: { open: true, from: "09:00", to: "17:00" },
  saturday: { open: true, from: "10:00", to: "14:00" },
  sunday: { open: false, from: "10:00", to: "14:00" },
};
// Tue 10 Nov 2026, 3:10pm WAT (2:10pm UTC).
const now = new Date("2026-11-10T14:10:00Z");

describe("booking sheet days and times (PRD A5 acceptance)", () => {
  const days = bookingDays(now, hours);

  it("lists 14 days from today, in WAT", () => {
    expect(days).toHaveLength(14);
    expect(days[0]).toMatchObject({ key: "2026-11-10", short: "Today", date: 10, label: "Tue 10 Nov" });
    expect(days[1].short).toBe("Wed");
  });

  it("shows no Sunday times", () => {
    const sunday = days.find((d) => d.label.startsWith("Sun"))!;
    expect(sunday.slots).toEqual([]);
  });

  it("gives Saturday 10:00am to 1:30pm and weekdays up to 4:30pm", () => {
    const sat = days.find((d) => d.label.startsWith("Sat"))!;
    expect(slotLabel(sat.slots[0])).toBe("10:00am");
    expect(slotLabel(sat.slots.at(-1)!)).toBe("1:30pm");
    const wed = days[1];
    expect(slotLabel(wed.slots[0])).toBe("9:00am");
    expect(slotLabel(wed.slots.at(-1)!)).toBe("4:30pm");
    expect(wed.slots).toHaveLength(16);
  });

  it("starts today at least 30 minutes from now: 3:10pm → 4:00pm", () => {
    expect(days[0].slots.map(slotLabel)).toEqual(["4:00pm", "4:30pm"]);
  });

  it("rolls the date over at midnight WAT, not UTC", () => {
    // 11:30pm UTC on the 10th is 12:30am WAT on the 11th.
    expect(bookingDays(new Date("2026-11-10T23:30:00Z"), hours)[0].key).toBe("2026-11-11");
  });

  it("uses 9am–6pm, Monday to Saturday, with no hours set", () => {
    const d = bookingDays(now, undefined);
    expect(d.find((x) => x.label.startsWith("Sun"))!.slots).toEqual([]);
    expect(slotLabel(d[1].slots.at(-1)!)).toBe("5:30pm");
  });

  it("treats a broken or closed day as closed", () => {
    expect(daySlots({ open: true, from: "18:00", to: "09:00" })).toEqual([]);
    expect(daySlots({ open: false, from: "09:00", to: "17:00" })).toEqual([]);
  });
});

describe("booking message", () => {
  it("names the service, the day and up to two times", () => {
    expect(bookingMessage("Glow Studio", "Signature facial (₦25,000)", "Sat 15 Nov", 840, 960)).toBe(
      "Hi Glow Studio, I'd like to book Signature facial (₦25,000) on Sat 15 Nov at 2:00pm. If that's taken, I can also do 4:00pm. Is it free?",
    );
    expect(bookingMessage("Glow Studio", "", "Sat 15 Nov", 600)).toBe("Hi Glow Studio, I'd like to book an appointment on Sat 15 Nov at 10:00am. Is it free?");
  });

  it("builds a wa.me link", () => {
    expect(whatsappLink("+2348012345678", "Hi & hello")).toBe("https://wa.me/2348012345678?text=Hi%20%26%20hello");
    expect(slotLabel(0)).toBe("12:00am");
    expect(slotLabel(720)).toBe("12:00pm");
  });
});
