import { describe, expect, it } from "vitest";
import { dayRange, freeLabel, matchPlaces, openLabel, parseSearch, searchHref, whenLabel, whenPhrase } from "./search";

// Thursday 26 November 2026, 13:00 WAT.
const now = new Date("2026-11-26T12:00:00Z");

describe("the search in the address", () => {
  it("round-trips", () => {
    const s = parseSearch({ q: "braids", trade: "hair", where: "Bodija, Ibadan", when: "date", date: "2026-12-05", tod: "evening", home: "1" });
    expect(s).toMatchObject({ q: "braids", trade: "hair", where: "Bodija, Ibadan", when: "date", date: "2026-12-05", tod: "evening", home: true, nodep: false });
    expect(parseSearch(Object.fromEntries(new URL(`https://x${searchHref(s)}`).searchParams))).toEqual(s);
  });
  it("drops what it doesn't know", () => {
    expect(parseSearch({ trade: "plumbing", when: "someday", tod: "night", date: "soon" })).toEqual({ q: undefined, trade: undefined, where: undefined, when: "any", date: undefined, tod: undefined, home: false, nodep: false });
    expect(parseSearch({ when: "date" }).when).toBe("any");
    expect(searchHref({ when: "any" })).toBe("/search");
  });
});

describe("the days a search covers", () => {
  it("today, tomorrow, a date and any time", () => {
    expect(dayRange({ when: "today" }, now)).toEqual({ from: "2026-11-26", to: "2026-11-26" });
    expect(dayRange({ when: "tomorrow" }, now)).toEqual({ from: "2026-11-27", to: "2026-11-27" });
    expect(dayRange({ when: "date", date: "2026-12-05" }, now)).toEqual({ from: "2026-12-05", to: "2026-12-05" });
    expect(dayRange({ when: "any" }, now)).toEqual({});
  });
  it("this weekend: Saturday and Sunday, or what's left of it", () => {
    expect(dayRange({ when: "weekend" }, now)).toEqual({ from: "2026-11-28", to: "2026-11-29" });
    expect(dayRange({ when: "weekend" }, new Date("2026-11-28T10:00:00Z"))).toEqual({ from: "2026-11-28", to: "2026-11-29" });
    expect(dayRange({ when: "weekend" }, new Date("2026-11-29T10:00:00Z"))).toEqual({ from: "2026-11-29", to: "2026-11-29" });
  });
  it("reads as words", () => {
    expect(whenLabel({ when: "any" })).toBe("Any time");
    expect(whenLabel({ when: "tomorrow", tod: "morning" })).toBe("Tomorrow, morning");
    expect(whenLabel({ when: "date", date: "2026-12-05" })).toBe("Sat 5 Dec");
    expect(whenLabel({ when: "any", tod: "evening" })).toBe("Any day, evening");
  });
});

describe("the next free time on a card", () => {
  it("says the day plainly, in WAT", () => {
    expect(freeLabel("2026-11-26T15:30:00Z", now)).toBe("Free today, 4:30pm");
    expect(freeLabel("2026-11-27T09:00:00Z", now)).toBe("Free tomorrow, 10am");
    expect(freeLabel("2026-11-28T08:00:00Z", now)).toBe("Free Sat, 9am");
    expect(freeLabel("2026-12-05T08:00:00Z", now)).toBe("Free 5 Dec, 9am");
  });
});

describe("places", () => {
  it("matches what someone types, starting letters first", () => {
    const m = matchPlaces("iba");
    expect(m[0]).toEqual({ label: "Ibadan", hint: "Oyo" });
    expect(matchPlaces("lagos").map((p) => p.label)).toContain("Lagos");
    expect(matchPlaces("")).toEqual([]);
  });
});


describe("open now", () => {
  const hours = { weekdays: { open: true, from: "09:00", to: "19:00" }, saturday: { open: true, from: "10:00", to: "16:30" }, sunday: { open: false, from: "09:00", to: "18:00" } };
  it("says until when, or when it opens", () => {
    expect(openLabel(hours, now)).toEqual({ open: true, text: "Open until 7pm" }); // Thursday 13:00
    expect(openLabel(hours, new Date("2026-11-26T06:00:00Z"))).toEqual({ open: false, text: "Opens 9am" }); // 07:00
    expect(openLabel(hours, new Date("2026-11-26T19:30:00Z"))).toEqual({ open: false, text: "Opens tomorrow at 9am" }); // 20:30
    expect(openLabel(hours, new Date("2026-11-28T17:00:00Z"))).toEqual({ open: false, text: "Opens Monday at 9am" }); // Saturday 18:00
    expect(openLabel(hours, new Date("2026-11-28T12:00:00Z"))).toEqual({ open: true, text: "Open until 4:30pm" });
    expect(openLabel(undefined, now)).toBeNull();
  });
});

describe("when, in a sentence", () => {
  it("reads naturally", () => {
    expect(whenPhrase({ when: "date", date: "2026-11-26" })).toBe("on Thu 26 Nov");
    expect(whenPhrase({ when: "today", tod: "morning" })).toBe("today in the morning");
    expect(whenPhrase({ when: "any", tod: "evening" })).toBe("in the evening");
    expect(whenPhrase({ when: "weekend" })).toBe("this weekend");
  });
});
