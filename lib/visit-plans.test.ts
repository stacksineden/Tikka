import { describe, expect, it } from "vitest";
import { comingIn, visitWhen, type ComingInLead } from "./followups";
import { checkFrom } from "./claim-map";
import { checkClaim, type ClaimRecord } from "./redeem";
import { visitDayWords, visitReminderText } from "./visit";
import { compose } from "./wa-text";

// Tue 20 Oct 2026, 11:00 WAT
const now = new Date("2026-10-20T11:00:00+01:00");
const SITE = "https://usetikka.com";
const lead = (p: Partial<ComingInLead>): ComingInLead => ({
  id: "l",
  name: "Ada",
  reward: "20% off",
  status: "claimed",
  expiresAt: "2026-10-30T22:59:00Z",
  ...p,
});

describe("coming in", () => {
  it("groups the week by day, then morning, afternoon, evening", () => {
    const days = comingIn(
      [
        lead({ id: "a", name: "Tolu", plannedVisitDate: "2026-10-20", plannedVisitPart: "evening" }),
        lead({ id: "b", name: "Ada", plannedVisitDate: "2026-10-20", plannedVisitPart: "morning" }),
        lead({ id: "c", name: "Bisi", plannedVisitDate: "2026-10-21", plannedVisitPart: "afternoon" }),
        lead({ id: "d", name: "Chi", plannedVisitDate: "2026-10-24" }),
      ],
      now,
    );
    expect(days.map((d) => [d.label, d.count])).toEqual([["Today", 2], ["Tomorrow", 1], ["Sat 24 Oct", 1]]);
    expect(days[0].parts.map((g) => [g.part, g.leads.map((l) => l.name)])).toEqual([["morning", ["Ada"]], ["evening", ["Tolu"]]]);
    expect(days[2].parts[0].part).toBeNull();
  });

  it("leaves out used, expired, past and far-off plans", () => {
    const days = comingIn(
      [
        lead({ id: "a", status: "redeemed", plannedVisitDate: "2026-10-20" }),
        lead({ id: "b", expiresAt: "2026-10-20T09:00:00Z", plannedVisitDate: "2026-10-20" }),
        lead({ id: "c", plannedVisitDate: "2026-10-19" }),
        lead({ id: "d", plannedVisitDate: "2026-10-27" }),
        lead({ id: "e" }),
      ],
      now,
    );
    expect(days).toEqual([]);
    expect(comingIn([lead({ plannedVisitDate: "2026-10-22" })], now, 2)).toEqual([]);
  });

  it("reads plainly", () => {
    expect(visitWhen("2026-10-20", "afternoon", now)).toBe("this afternoon");
    expect(visitWhen("2026-10-21", "morning", now)).toBe("tomorrow morning");
    expect(visitWhen("2026-10-19", "evening", now)).toBe("Mon evening");
  });
});

describe("the counter sees the plan", () => {
  const claim: ClaimRecord = {
    token: "t",
    dropId: "d",
    ownerId: "o",
    card: { code: "GS-ABCDE", claimer: "Ada", reward: "20% off", tier: "rare", expiresAt: "2026-10-30T22:59:00Z" } as ClaimRecord["card"],
    claimedAt: "2026-10-18T10:00:00Z",
    plannedVisitDate: "2026-10-20",
    plannedVisitPart: "afternoon",
  };
  it("from the demo store and the database", () => {
    expect(checkClaim(claim, "o", "GS-ABCDE", now)).toMatchObject({ kind: "valid", plannedVisitDate: "2026-10-20", plannedVisitPart: "afternoon" });
    const db = { kind: "valid", code: "GS-ABCDE", name: "Ada", reward: "20% off", tier: "rare", expires_at: "2026-10-30T22:59:00Z" };
    expect(checkFrom({ ...db, planned_visit_date: "2026-10-20", planned_visit_part: "evening" })).toMatchObject({ plannedVisitDate: "2026-10-20", plannedVisitPart: "evening" });
    expect(checkFrom({ ...db, planned_visit_date: null, planned_visit_part: "nonsense" })).toMatchObject({ plannedVisitDate: undefined, plannedVisitPart: undefined });
  });
});

describe("the reminder on the planned day", () => {
  const p = { reward: "20% off any service", business_name: "Glow Studio", expires_at: "2026-12-15T22:59:00Z", view_token: "abc", visit_part: "afternoon" };
  it("says see you this afternoon, as tikka_visit_reminder", () => {
    expect(compose("expiry_reminder", p, SITE, "tikka_visit_reminder")).toEqual({
      text: "See you this afternoon at Glow Studio! Your 20% off any service is ready and ends Tue 15 Dec. Show this at the counter: https://usetikka.com/t/abc",
      params: ["this afternoon", "Glow Studio", "20% off any service", "Tue 15 Dec", "https://usetikka.com/t/abc"],
    });
  });
  it("falls back to the plain reminder until Meta approves the template", () => {
    expect(compose("expiry_reminder", p, SITE, "tikka_expiry_reminder").params).toHaveLength(4);
  });
  it("in the demo store too", () => {
    expect(visitDayWords("today")).toBe("today");
    expect(visitReminderText("morning", "Free brow tint", "Glow Studio", "2026-10-30T22:59:00Z", "x")).toBe(
      "See you this morning at Glow Studio! Your free brow tint is ready and ends Fri 30 Oct. Show this at the counter: x",
    );
  });
});
