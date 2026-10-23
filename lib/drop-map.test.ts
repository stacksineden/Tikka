import { describe, expect, it } from "vitest";
import { blankDraft, newReward, type DropDraft } from "./drop";
import { draftFrom, draftTo, dropFrom, dropSlug, rewardTo, statusOf, type DropRow } from "./drop-map";

const now = new Date("2026-10-23T10:00:00+01:00");

function draft(p: Partial<DropDraft> = {}): DropDraft {
  return {
    ...blankDraft(now),
    name: "Glow week",
    total: 300,
    rewards: [
      newReward("legendary", { type: "free_item", value: null, what: "Free wash & style", count: 3 }),
      newReward("rare", { type: "naira_off", value: 3000, what: "any service", minSpend: 10000, count: 30, requiresPurchase: true }),
      newReward("thank_you", { type: "action", value: null, what: "a free drink", action: "Follow @glow on Instagram", count: 267 }),
    ],
    ...p,
  };
}

describe("rewards", () => {
  it("map tiers, kinds and money to the database's terms", () => {
    const [legendary, rare, thanks] = draft().rewards.map(rewardTo);
    expect(legendary).toMatchObject({ tier: "legendary", kind: "free_item", value: null, quantity: 3 });
    expect(rare).toMatchObject({ tier: "rare", kind: "amount_off", value: 300_000, min_spend_kobo: 1_000_000, requires_purchase: true, quantity: 30 });
    expect(rare.title).toMatch(/₦3,000 off any service over ₦10,000/);
    expect(thanks).toMatchObject({ tier: "common", kind: "action", action_text: "Follow @glow on Instagram", quantity: 267 });
  });

  it("never send an action card without an action, or an empty title", () => {
    const r = rewardTo(newReward("thank_you", { type: "action", value: null, what: "", action: " ", count: 1 }));
    expect(r.action_text).toBeTruthy();
    expect(r.title.length).toBeGreaterThan(0);
  });
});

describe("a draft for save_drop_draft()", () => {
  it("carries the builder's own copy", () => {
    const d = draft();
    const row = draftTo(d, now, "glow-week");
    expect(row.builder).toBe(d);
    expect(row).toMatchObject({ slug: "glow-week", title: "Glow week", total_cards: 300 });
    expect(row.rewards).toHaveLength(3);
  });

  it("keeps half-finished values in range for the columns", () => {
    const row = draftTo(draft({ name: "  ", total: 4, startMode: "later", startsAt: "2026-10-25T09:00", endsAt: "2026-10-24T09:00" }), now, "draft-x");
    expect(row.title).toBe("Untitled drop");
    expect(row.total_cards).toBe(10);
    expect(Date.parse(row.ends_at)).toBeGreaterThan(Date.parse(row.starts_at));
    expect(Date.parse(row.ends_at) - Date.parse(row.starts_at)).toBeLessThanOrEqual(30 * 86_400_000);
  });

  it("starts now when the builder says so", () => {
    expect(draftTo(draft({ startMode: "now" }), now, "x").starts_at).toBe(now.toISOString());
  });

  it("stores the next-visit Tikka the way redemption reads it", () => {
    const bb = draftTo(draft(), now, "x").bounce_back;
    expect(bb).toMatchObject({ title: "10% off your next visit", kind: "percent_off", value: 10, validity_days: 30 });
    expect(draftTo(draft({ bounceBack: { ...draft().bounceBack, on: false } }), now, "x").bounce_back).toBeNull();
  });
});

describe("a drop from the database", () => {
  const row = (p: Partial<DropRow> = {}): DropRow => ({
    id: "d1",
    slug: "glow-week",
    title: "Glow week",
    goal: "new_customers",
    template_id: null,
    total_cards: 300,
    finish: "foil",
    starts_at: "2026-10-22T09:00:00Z",
    ends_at: "2026-10-30T09:00:00Z",
    validity_days: 14,
    valid_weekdays: null,
    bounce_back: { title: "10% off your next visit", validity_days: 30 },
    ignored_warnings: [],
    status: "published",
    published_at: "2026-10-22T09:00:00Z",
    show_in_marketplace: true,
    tier_id: "small",
    tier_max_cards: 300,
    paid_with: "payment",
    payment_status: "paid",
    builder: null,
    rewards: draft().rewards.map(rewardTo),
    ...p,
  });

  it("reads back as the dashboards show it", () => {
    const d = dropFrom(row(), { claimed: 40, redeemed: 12, revenue: 96_000 }, now);
    expect(d).toMatchObject({ status: "live", total: 300, claimed: 40, redeemed: 12, revenue: 96_000, tierId: "small", bounceBack: { reward: "10% off your next visit", validityDays: 30 } });
    expect(d.rewards.map((r) => r.tier)).toEqual(["legendary", "rare", "thank_you"]);
    expect(d.rewards[1].type).toBe("naira_off");
  });

  it("gets its status from the dates and the deck", () => {
    expect(statusOf(row({ status: "draft" }), 0, now)).toBe("draft");
    expect(statusOf(row({ starts_at: "2026-11-01T09:00:00Z", ends_at: "2026-11-05T09:00:00Z" }), 0, now)).toBe("scheduled");
    expect(statusOf(row({ ends_at: "2026-10-23T08:00:00Z" }), 0, now)).toBe("ended");
    expect(statusOf(row({ status: "ended_early" }), 0, now)).toBe("ended");
    expect(statusOf(row(), 300, now)).toBe("sold_out");
  });

  it("only shows a pending payment while one is pending", () => {
    expect(dropFrom(row({ status: "draft", payment_status: "pending" }), { claimed: 0, redeemed: 0, revenue: 0 }, now, "p1").pendingPaymentId).toBe("p1");
    expect(dropFrom(row(), { claimed: 0, redeemed: 0, revenue: 0 }, now, "p1").pendingPaymentId).toBeUndefined();
  });

  it("reopens the builder's copy under the database's id", () => {
    const d = draft({ id: "old" });
    expect(draftFrom(row({ builder: d }), () => draft()).id).toBe("d1");
    expect(draftFrom(row({ builder: d }), () => draft()).name).toBe("Glow week");
  });
});

describe("drop addresses", () => {
  it("come from the name and never repeat within a business", () => {
    expect(dropSlug("Glow Week & Spa!", new Set())).toBe("glow-week-and-spa");
    expect(dropSlug("Glow week", new Set(["glow-week", "glow-week-2"]))).toBe("glow-week-3");
    expect(dropSlug("!!!", new Set())).toBe("drop");
    expect(dropSlug("a".repeat(60), new Set()).length).toBeLessThanOrEqual(40);
  });
});
