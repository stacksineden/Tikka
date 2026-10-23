import { describe, expect, it } from "vitest";
import { claimExpiry, reminderAt, reminderDue, reminderText, validDaysLabel, validOn, visitOptions, watDate } from "./visit";

// Wed 21 Oct 2026, 22:30 WAT
const now = new Date("2026-10-21T22:30:00+01:00");

describe("expiry", () => {
  it("is the end of the WAT day, validity days after the claim, even past the drop's end", () => {
    expect(claimExpiry(now, 14)).toBe(new Date("2026-11-04T23:59:00+01:00").toISOString());
    // 23:30 UTC is already the next day in Lagos
    expect(claimExpiry(new Date("2026-10-21T23:30:00Z"), 7)).toBe(new Date("2026-10-29T23:59:00+01:00").toISOString());
  });
});

describe("visit plan", () => {
  const expires = claimExpiry(now, 7); // Wed 28 Oct
  it("offers today through the expiry day", () => {
    const o = visitOptions(now, expires, null, 20);
    expect(o[0]).toEqual({ date: "2026-10-21", label: "Today" });
    expect(o[1].label).toBe("Tomorrow");
    expect(o[2].label).toBe("Fri 23 Oct");
    expect(o.at(-1)!.date).toBe("2026-10-28");
    expect(o).toHaveLength(8);
  });
  it("only offers a quiet-day drop's days", () => {
    const o = visitOptions(now, expires, [1, 2, 3], 20);
    expect(o.map((x) => x.date)).toEqual(["2026-10-21", "2026-10-26", "2026-10-27", "2026-10-28"]);
  });
  it("knows which days a code works", () => {
    expect(validOn([1, 2, 3], now)).toBe(true); // Wednesday
    expect(validOn([4, 5], now)).toBe(false);
    expect(validOn(null, now)).toBe(true);
    expect(validDaysLabel([1, 2, 3, 4])).toBe("Valid Mon–Thu only");
    expect(watDate(now)).toBe("2026-10-21");
  });
});

describe("expiry reminder", () => {
  const claim = { claimedAt: now.toISOString(), expiresAt: claimExpiry(now, 14) }; // ends Wed 4 Nov

  it("goes 3 days before expiry at 10:00, or 8:00 on the planned day if that's earlier", () => {
    expect(reminderAt(claim)).toBe(new Date("2026-11-01T10:00:00+01:00").toISOString());
    expect(reminderAt({ ...claim, plannedVisitDate: "2026-10-24" })).toBe(new Date("2026-10-24T08:00:00+01:00").toISOString());
    expect(reminderAt({ ...claim, plannedVisitDate: "2026-11-03" })).toBe(new Date("2026-11-01T10:00:00+01:00").toISOString());
  });

  it("skips times already past when it was claimed", () => {
    const late = new Date("2026-11-03T12:00:00+01:00");
    expect(reminderAt({ claimedAt: late.toISOString(), expiresAt: claimExpiry(now, 14) })).toBeNull();
    // Planning for today at noon: 8:00 has passed, so no reminder that day
    expect(reminderAt({ claimedAt: late.toISOString(), expiresAt: claimExpiry(now, 14), plannedVisitDate: "2026-11-03" })).toBeNull();
  });

  it("is sent once, and never for used, expired or opted-out Tikkas", () => {
    const at = new Date("2026-11-01T10:05:00+01:00");
    expect(reminderDue(claim, at)).toBe(true);
    expect(reminderDue(claim, new Date("2026-11-01T09:00:00+01:00"))).toBe(false);
    expect(reminderDue({ ...claim, reminderSentAt: at.toISOString() }, at)).toBe(false);
    expect(reminderDue({ ...claim, redeemedAt: at.toISOString() }, at)).toBe(false);
    expect(reminderDue({ ...claim, optedOut: true }, at)).toBe(false);
    expect(reminderDue(claim, new Date("2026-11-05T10:00:00+01:00"))).toBe(false);
  });

  it("reads plainly", () => {
    expect(reminderText("20% off any service", "Glow Studio", claim.expiresAt, "usetikka.com/t/x")).toBe(
      "Your 20% off any service at Glow Studio ends Wed 4 Nov. Show this at the counter: usetikka.com/t/x",
    );
  });
});
