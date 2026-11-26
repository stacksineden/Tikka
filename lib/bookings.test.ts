import { describe, expect, it } from "vitest";
import { canMark, byDay, freeDays, gapAfter, gapLabel, isFull, lengthLabel, needsMarking, nextFree, watInstant, watParts, whenLabel, type Booking, type BookingRules } from "./bookings";

const ALL_WEEK = {
  weekdays: { open: true, from: "09:00", to: "18:00" },
  saturday: { open: true, from: "09:00", to: "18:00" },
  sunday: { open: false, from: "09:00", to: "18:00" },
};
// Thu 12 Nov 2026, 8:00am WAT. Sat 14 Nov is the day we book on.
const NOW = new Date("2026-11-12T08:00:00+01:00");
const SAT = "2026-11-14";
const at = (min: number, day = SAT) => new Date(watInstant(day, min)).toISOString();
const span = (from: number, mins: number): [string, string] => [at(from), at(from + mins)];

function rules(patch: Partial<BookingRules> = {}): BookingRules {
  return { capacity: 2, noticeMinutes: 120, aheadDays: 92, hours: ALL_WEEK, busy: [], blocked: [], ...patch };
}
const slotsOn = (r: BookingRules, mins: number, day = SAT) => freeDays(r, mins, NOW).find((d) => d.key === day)!.slots;

describe("free times", () => {
  it("counts overlapping bookings against capacity, like the database", () => {
    // Ada braids 10:00–13:00, Bisi facial 11:00–12:00: both chairs busy 11:00–12:00.
    const r = rules({ busy: [span(600, 180), span(660, 60)] });
    const s = slotsOn(r, 60);
    expect(s).toContain(600); // 10:00–11:00: one chair free
    expect(s).not.toContain(630); // 10:30 runs into the full 11:00
    expect(s).not.toContain(660);
    expect(s).not.toContain(690);
    expect(s).toContain(720); // noon
  });

  it("only offers times that end by closing, on the half hour, from opening", () => {
    const s = slotsOn(rules(), 60);
    expect(s[0]).toBe(540);
    expect(s.at(-1)).toBe(1020); // 5:00pm, ends 6:00pm
    expect(s.every((t) => t % 30 === 0)).toBe(true);
    expect(slotsOn(rules(), 180).at(-1)).toBe(900); // a 3-hour service starts by 3:00pm
  });

  it("closed days have no times; blocked times are full whatever the capacity", () => {
    expect(slotsOn(rules(), 60, "2026-11-15")).toEqual([]); // Sunday
    const s = slotsOn(rules({ capacity: 5, blocked: [span(780, 120)] }), 60);
    expect(s).not.toContain(780);
    expect(s).not.toContain(750); // 12:30–1:30 runs into the block
    expect(s).toContain(900);
  });

  it("keeps the notice and the reach", () => {
    const today = freeDays(rules(), 60, NOW)[0];
    expect(today.slots[0]).toBe(600); // 8:00am now + 2 hours
    const near = freeDays(rules({ aheadDays: 7 }), 60, NOW);
    expect(near.at(-1)!.key <= "2026-11-19").toBe(true);
    const tikka = freeDays(rules(), 60, NOW, "2026-11-14");
    expect(tikka.at(-1)!.key).toBe("2026-11-14");
  });

  it("finds the next day with a free time", () => {
    const full = rules({ capacity: 1, blocked: [[at(0), at(24 * 60)]] });
    const days = freeDays(full, 60, NOW);
    expect(days.find((d) => d.key === SAT)!.slots).toEqual([]);
    expect(nextFree(days, SAT)!.key).toBe("2026-11-16"); // Sunday closed, Monday free
  });

  it("isFull treats end times as free", () => {
    const busy: [number, number][] = [[0, 60]];
    expect(isFull(60, 120, busy, [], 1)).toBe(false);
    expect(isFull(30, 90, busy, [], 1)).toBe(true);
  });
});

describe("labels and marking", () => {
  it("writes lengths and times plainly", () => {
    expect(lengthLabel(45)).toBe("45 min");
    expect(lengthLabel(60)).toBe("1 hr");
    expect(lengthLabel(90)).toBe("1½ hrs");
    expect(lengthLabel(180)).toBe("3 hrs");
    expect(whenLabel(at(840))).toBe("Sat 14 Nov, 2:00pm");
    expect(watParts(at(840))).toEqual({ day: SAT, minute: 840 });
  });

  const b = (start: number, patch: Partial<Booking> = {}): Booking => ({
    id: String(start), service: "Facial", minutes: 60, startsAt: at(start), endsAt: at(start + 60), firstName: "Ada",
    source: "page", status: "booked", code: "BK-AAAAAA", moved: false, createdAt: NOW.toISOString(), ...patch,
  });

  it("marks arrived from an hour before, no-show once started", () => {
    const now = new Date(watInstant(SAT, 600));
    expect(canMark(b(660), "arrived", now)).toBe(true);
    expect(canMark(b(690), "arrived", now)).toBe(false);
    expect(canMark(b(660), "no_show", now)).toBe(false);
    expect(canMark(b(600), "no_show", now)).toBe(true);
    expect(needsMarking(b(480), now)).toBe(true);
    expect(needsMarking(b(480, { status: "arrived" }), now)).toBe(false);
  });

  it("groups by day in time order", () => {
    const g = byDay([b(840), b(600), b(600 + 24 * 60 * 2)]);
    expect(g.map((x) => x.label)).toEqual(["Sat 14 Nov", "Mon 16 Nov"]);
    expect(g[0].items.map((x) => x.id)).toEqual(["600", "840"]);
  });
});

describe("gap time", () => {
  it("takes the service's own gap, else the business's, plus travel after a home visit", () => {
    const biz = { gapMinutes: 15, homeGapMinutes: 45 };
    expect(gapAfter(biz)).toBe(15);
    expect(gapAfter(biz, { gapMinutes: 30 })).toBe(30);
    expect(gapAfter(biz, { gapMinutes: 0 })).toBe(0); // a wash needs none
    expect(gapAfter(biz, null, true)).toBe(60);
    expect(gapAfter({})).toBe(0);
    expect(gapAfter({ gapMinutes: 500 })).toBe(180);
    expect(gapLabel(30)).toBe("30 min");
    expect(gapLabel(75)).toBe("1 hr 15 min");
  });

  it("keeps the gap after a booking free, and leaves room for the new booking's own gap", () => {
    // One chair. Ada 10:00–12:00 plus 30 minutes' clean-up: the next free start is 12:30.
    const one = rules({ capacity: 1, busy: [[at(600), at(750)]] });
    const s = slotsOn(one, 60);
    expect(s).not.toContain(720);
    expect(s).toContain(750);
    // A 1-hour booking with a 30-minute gap can't start at 9:00 before a 10:30 booking...
    const next = rules({ capacity: 1, busy: [span(630, 60)] });
    const withGap = freeDays(next, 60, NOW, undefined, 30).find((d) => d.key === SAT)!.slots;
    expect(withGap).not.toContain(570);
    expect(withGap).toContain(540);
    // ...and the last booking of the day still ends by closing; its gap may run past it.
    expect(withGap.at(-1)).toBe(1020);
  });
});
