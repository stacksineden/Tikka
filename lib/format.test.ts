import { describe, expect, it } from "vitest";
import { left, naira, nairaShort, percent, place, shortDate, timeAgo, timeLeft } from "./format";

describe("format", () => {
  it("writes naira with ₦ and grouping", () => {
    expect(naira(25000)).toBe("₦25,000");
    expect(naira(0)).toBe("₦0");
  });

  it("shortens big naira amounts for summaries", () => {
    expect(nairaShort(1_940_000)).toBe("₦1.9M");
    expect(nairaShort(2_000_000)).toBe("₦2M");
    expect(nairaShort(250_000)).toBe("₦250K");
    expect(nairaShort(9_500)).toBe("₦9,500");
  });

  it("reads counts remaining first", () => {
    expect(left(23, 600)).toBe("23 of 600 left");
    expect(left(1200, 2000)).toBe("1,200 of 2,000 left");
  });

  it("handles percentages", () => {
    expect(percent(10, 600, 1)).toBe("1.7%");
    expect(percent(540, 600)).toBe("90%");
    expect(percent(1, 0)).toBe("0%");
  });

  it("always names the city with the area", () => {
    expect(place("Lekki", "Lagos")).toBe("Lekki, Lagos");
    expect(place("Wuse 2", "Abuja")).toBe("Wuse 2, Abuja");
    expect(place("", "Ibadan")).toBe("Ibadan");
  });

  it("formats dates in West Africa Time", () => {
    expect(shortDate("2026-10-31T21:00:00+01:00")).toBe("Sat 31 Oct");
  });

  it("describes relative time", () => {
    const now = new Date("2026-10-20T11:00:00+01:00");
    expect(timeAgo("2026-10-20T10:59:30+01:00", now)).toBe("just now");
    expect(timeAgo("2026-10-20T10:58:00+01:00", now)).toBe("2 min ago");
    expect(timeAgo("2026-10-19T09:00:00+01:00", now)).toBe("yesterday");
    expect(timeLeft("2026-10-31T21:00:00+01:00", now)).toBe("11 days left");
    expect(timeLeft("2026-10-20T20:00:00+01:00", now)).toBe("9 hr left");
  });
});
