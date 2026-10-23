import { describe, expect, it } from "vitest";
import { actionInstruction, cardAt, dealtCounts, firstName, parseSource, publicStatus, serialLabel, toPublicDrop } from "./claim";
import type { Drop, Reward } from "./types";

const rewards: Reward[] = [
  { tier: "legendary", type: "free_item", label: "Free facial", count: 2 },
  { tier: "rare", type: "action", label: "Free brow tint", action: "Follow @glowstudio on Instagram", count: 8 },
  { tier: "thank_you", type: "perk", label: "Priority booking", count: 90 },
];

const drop: Drop = {
  id: "drop_x",
  slug: "x",
  name: "X",
  status: "live",
  total: 100,
  claimed: 40,
  redeemed: 0,
  revenue: 0,
  startsAt: "2026-10-01T09:00:00+01:00",
  endsAt: "2026-10-31T21:00:00+01:00",
  finish: "foil",
  rewards,
};
const now = new Date("2026-10-20T12:00:00+01:00");

describe("claim helpers", () => {
  it("reads the source from ?c=", () => {
    expect(parseSource("ig")).toBe("ig");
    expect(parseSource(["qr", "wa"])).toBe("qr");
    expect(parseSource("tiktok")).toBe("direct");
    expect(parseSource(undefined)).toBe("direct");
  });

  it("works out status from the clock and what's left", () => {
    expect(publicStatus(drop, 5, now)).toBe("live");
    expect(publicStatus(drop, 0, now)).toBe("sold_out");
    expect(publicStatus({ ...drop, startsAt: "2026-11-01T09:00:00+01:00" }, 100, now)).toBe("scheduled");
    expect(publicStatus({ ...drop, endsAt: "2026-10-19T21:00:00+01:00" }, 5, now)).toBe("ended");
  });

  it("shapes the public drop without the deck", () => {
    const p = toPublicDrop(drop, 3, false, now);
    expect(p.left).toBe(57);
    expect(p.contents).toEqual({ legendary: 2, rare: 8, thankYou: 90 });
    expect(p.items.map((i) => i.tier)).toEqual(["legendary", "rare", "thank_you"]);
    expect(Object.keys(p)).not.toContain("rewards");
  });

  it("hands out every card exactly once, in a stable order", () => {
    const seen = { legendary: 0, rare: 0, thank_you: 0 };
    const serials = new Set<number>();
    for (let i = 0; i < 100; i++) {
      const c = cardAt("drop_x", rewards, i)!;
      seen[c.reward.tier]++;
      serials.add(c.serial);
      expect(cardAt("drop_x", rewards, i)).toEqual(c);
    }
    expect(seen).toEqual({ legendary: 2, rare: 8, thank_you: 90 });
    expect(serials.size).toBe(100);
    expect(cardAt("drop_x", rewards, 100)).toBeNull();
  });

  it("appends added Tikkas to the end without moving cards already dealt", () => {
    const before = Array.from({ length: 100 }, (_, i) => cardAt("drop_x", rewards, i));
    const batch = [1, 4, 45];
    const after = Array.from({ length: 150 }, (_, i) => cardAt("drop_x", rewards, i, [batch]));
    expect(after.slice(0, 100)).toEqual(before);
    const added = after.slice(100).map((c) => c!.reward.tier);
    expect(added.filter((t) => t === "legendary")).toHaveLength(1);
    expect(added.filter((t) => t === "rare")).toHaveLength(4);
    expect(new Set(after.map((c) => c!.serial)).size).toBe(150);
    expect(Math.max(...after.map((c) => c!.serial))).toBe(150);
    expect(cardAt("drop_x", rewards, 150, [batch])).toBeNull();
  });

  it("counts what the first claims took, matching the cards dealt", () => {
    const dealt = dealtCounts("drop_x", rewards, 120, [[1, 4, 45]]);
    const byHand = rewards.map(() => 0);
    for (let i = 0; i < 120; i++) byHand[rewards.indexOf(cardAt("drop_x", rewards, i, [[1, 4, 45]])!.reward)]++;
    expect(dealt).toEqual(byHand);
  });

  it("formats the small bits", () => {
    expect(actionInstruction(rewards[1])).toBe("Follow @glowstudio on Instagram and show it at the counter");
    expect(actionInstruction(rewards[0])).toBeUndefined();
    expect(serialLabel(7, 600)).toBe("0007");
    expect(serialLabel(412, 12000)).toBe("00412");
    expect(firstName("  adaeze okafor ")).toBe("Adaeze");
  });
});
