import { describe, expect, it } from "vitest";
import { followupKind, followups, visitPlanLabel, type FollowupLead } from "./followups";
import { blackFriday, seasonalNudge, seasonOn } from "./nudges";
import { dropReport, rewardCost, type ReportClaim } from "./report";
import { dailySummaryParams, dailySummaryText, summaryCounts, worthSending } from "./summary";

// Tue 20 Oct 2026, 11:00 WAT
const now = new Date("2026-10-20T11:00:00+01:00");
const h = (n: number) => new Date(now.getTime() + n * 3_600_000).toISOString();
const lead = (p: Partial<FollowupLead>): FollowupLead => ({
  id: "l",
  name: "Adaeze Okafor",
  phone: "0806 112 9087",
  reward: "20% off any service",
  claimedAt: h(-72),
  expiresAt: h(24 * 10),
  redeemed: false,
  ...p,
});

describe("message today", () => {
  it("sorts people into one bucket each, most urgent first", () => {
    expect(followupKind(lead({ plannedVisitDate: "2026-10-20" }), now)).toBe("today");
    expect(followupKind(lead({ expiresAt: h(30) }), now)).toBe("ending");
    expect(followupKind(lead({ claimedAt: h(-3) }), now)).toBe("just_claimed");
    expect(followupKind(lead({ expiresAt: h(-48) }), now)).toBe("missed");
    expect(followupKind(lead({ expiresAt: h(-24 * 9) }), now)).toBeNull();
    expect(followupKind(lead({ redeemed: true, claimedAt: h(-1) }), now)).toBeNull();
    expect(followupKind(lead({}), now)).toBeNull();
  });

  it("writes the prewritten messages", () => {
    const list = followups(
      [
        lead({ id: "a", claimedAt: h(-2) }),
        lead({ id: "b", plannedVisitDate: "2026-10-20" }),
        lead({ id: "c", expiresAt: new Date("2026-10-22T23:59:00+01:00").toISOString() }),
        lead({ id: "d", expiresAt: h(-30) }),
      ],
      "Glow Studio",
      now,
    );
    expect(list.map((f) => [f.lead.id, f.kind])).toEqual([["b", "today"], ["c", "ending"], ["a", "just_claimed"], ["d", "missed"]]);
    expect(list.map((f) => f.message)).toEqual([
      "Hi Adaeze, see you today! Your 20% off any service is ready at the counter.",
      "Hi Adaeze, your 20% off any service ends Thursday. Shall we book you in?",
      "Hi Adaeze, welcome! Your 20% off any service at Glow Studio is ready. Want to book a slot this week?",
      "Hi Adaeze, we missed you! Our next drop is coming soon.",
    ]);
  });

  it("drops people the owner already messaged today", () => {
    expect(followups([lead({ claimedAt: h(-2), lastFollowupAt: h(-1) })], "Glow", now)).toEqual([]);
  });

  it("reads visit plans plainly", () => {
    expect(visitPlanLabel("2026-10-24", "morning", now)).toBe("Plans to come Sat morning");
    expect(visitPlanLabel("2026-10-21", "evening", now)).toBe("Plans to come tomorrow evening");
    expect(visitPlanLabel("2026-10-20", "afternoon", now)).toBe("Plans to come this afternoon");
    expect(visitPlanLabel(undefined, undefined, now)).toBeNull();
  });
});

describe("drop report", () => {
  const pct = (bill: number, status?: "new" | "returning"): ReportClaim => ({ kind: "drop", redeemed: true, billKobo: bill * 100, customerStatus: status, reward: { type: "percent_off", value: 20 } });
  const claims: ReportClaim[] = [
    pct(20_000, "new"),
    pct(30_000, "new"),
    pct(10_000, "returning"),
    { kind: "drop", redeemed: true, reward: { type: "free_item", value: null } },
    { kind: "drop", redeemed: false, reward: { type: "naira_off", value: 2000 } },
    { kind: "bounce_back", redeemed: true, billKobo: 5_000_00, reward: { type: "percent_off", value: 10 } },
  ];

  it("counts customers, sales, estimated costs and cost per new customer", () => {
    const r = dropReport({ goal: "new_customers" }, claims, { kind: "paid", amountKobo: 10_000_00 });
    expect(r).toMatchObject({
      customers: 4,
      newCustomers: 3,
      returningCustomers: 1,
      recordedSalesKobo: 60_000_00,
      estimatedRewardCostKobo: 12_000_00,
      freeItemsWithoutCost: 1,
      feeKobo: 10_000_00,
      feeLabel: "₦10,000",
      costPerCustomerKobo: Math.round(22_000_00 / 3),
      costPerLabel: "per new customer",
      spentBeyondReward: 3,
      cameBack: 1,
    });
    expect(r.headline).toBe("3 new customers · ₦60,000 recorded");
  });

  it("leads with the goal", () => {
    expect(dropReport({ goal: "bring_back" }, claims, { kind: "free" }).headline).toBe("4 customers came back · ₦60,000 recorded");
    expect(dropReport({ goal: "quiet_days", validWeekdays: [1, 2, 3, 4] }, claims, { kind: "pack" })).toMatchObject({
      headline: "4 customers on Mon–Thu · ₦60,000 recorded",
      feeLabel: "Season pack",
      costPerLabel: "per customer",
    });
  });

  it("estimates reward costs", () => {
    expect(rewardCost({ type: "naira_off", value: 3000 })).toEqual({ kobo: 300_000, known: true });
    expect(rewardCost({ type: "free_item", value: null, costKobo: 150_000 })).toEqual({ kobo: 150_000, known: true });
    expect(rewardCost({ type: "perk", value: null })).toEqual({ kobo: 0, known: true });
  });

  it("has no cost per customer before anyone comes in", () => {
    expect(dropReport({ goal: "new_customers" }, [], { kind: "free" }).costPerCustomerKobo).toBeNull();
  });
});

describe("seasonal nudges", () => {
  it("knows when Black Friday is", () => {
    expect(blackFriday(2026)).toBe("2026-11-27");
    expect(blackFriday(2027)).toBe("2027-11-26");
  });
  it("shows in the three windows only", () => {
    const at = (d: string) => new Date(`${d}T09:00:00+01:00`);
    expect(seasonOn(at("2026-11-12"))).toBeNull();
    expect(seasonOn(at("2026-11-13"))).toBe("black_friday");
    expect(seasonOn(at("2026-11-27"))).toBe("black_friday");
    expect(seasonOn(at("2026-12-01"))).toBe("december");
    expect(seasonOn(at("2026-12-25"))).toBeNull();
    expect(seasonOn(at("2027-02-14"))).toBe("valentines");
    expect(seasonOn(at("2027-03-01"))).toBeNull();
  });
  it("reads plainly and needs a past drop", () => {
    const at = new Date("2026-12-03T09:00:00+01:00");
    expect(seasonalNudge(at, { id: "d1", name: "October Glow", customers: 30 })?.text).toBe("December is here. Your last drop brought 30 customers. Run it again?");
    expect(seasonalNudge(at, null)).toBeNull();
    expect(seasonalNudge(now, { id: "d1", name: "x", customers: 3 })).toBeNull();
  });
});

describe("daily summary", () => {
  it("counts new claims, tomorrow's visits and Tikkas ending in 3 days", () => {
    const c = summaryCounts(
      [
        { claimedAt: h(-2), expiresAt: h(24 * 13), redeemed: false, plannedVisitDate: "2026-10-21" },
        { claimedAt: h(-30), expiresAt: h(48), redeemed: false },
        { claimedAt: h(-30), expiresAt: h(48), redeemed: true, plannedVisitDate: "2026-10-21" },
      ],
      now,
    );
    expect(c).toEqual({ newClaims: 1, planningTomorrow: 1, expiringSoon: 1 });
    expect(dailySummaryText("Glow Studio", c, "usetikka.com/app/leads")).toBe(
      "Glow Studio today: 1 new claim, 1 planning to come tomorrow, 1 Tikka expiring soon. Open your list: usetikka.com/app/leads",
    );
    expect(dailySummaryText("Glow Studio", { newClaims: 12, planningTomorrow: 3, expiringSoon: 5 }, "usetikka.com/app/leads", "December is coming. Run it again?")).toBe(
      "Glow Studio today: 12 new claims, 3 planning to come tomorrow, 5 Tikkas expiring soon. December is coming. Run it again? Open your list: usetikka.com/app/leads",
    );
    expect(dailySummaryParams("Glow Studio", c, "usetikka.com/app/leads")).toEqual(["Glow Studio", "1 new claim", "1", "1 Tikka", "", "usetikka.com/app/leads"]);
    expect(worthSending({ newClaims: 0, planningTomorrow: 0, expiringSoon: 0 })).toBe(false);
    expect(worthSending({ newClaims: 0, planningTomorrow: 0, expiringSoon: 0 }, "December is here.")).toBe(true);
  });
});
