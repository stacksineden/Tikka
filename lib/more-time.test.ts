import { describe, expect, it } from "vitest";
import { moreTimeMessage, moreTimeUntil } from "./more-time";

const NOW = new Date("2026-12-10T12:00:00Z");
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();

describe("moreTimeUntil", () => {
  it("gives a live 7-day Tikka one more week", () => {
    expect(moreTimeUntil({ claimedAt: days(-2), expiresAt: days(5) }, NOW)).toBe(days(12));
  });

  it("brings back an expired Tikka when the new date is still ahead", () => {
    expect(moreTimeUntil({ claimedAt: days(-10), expiresAt: days(-3) }, NOW)).toBe(days(4));
  });

  it("refuses one that expired so long ago a week more is still past", () => {
    expect(moreTimeUntil({ claimedAt: days(-16), expiresAt: days(-9) }, NOW)).toBeNull();
    expect(moreTimeUntil({ claimedAt: days(-14), expiresAt: days(-7) }, NOW)).toBeNull();
  });

  it("never goes past 30 days from the claim", () => {
    // A 14-day Tikka gets a week more; one claimed 25 days ago only reaches day 30.
    expect(moreTimeUntil({ claimedAt: days(-2), expiresAt: days(12) }, NOW)).toBe(days(19));
    expect(moreTimeUntil({ claimedAt: days(-25), expiresAt: days(1) }, NOW)).toBe(days(5));
    // A 30-day Tikka already has the longest time.
    expect(moreTimeUntil({ claimedAt: days(-1), expiresAt: days(29) }, NOW)).toBeNull();
  });

  it("refuses a used Tikka, and gives more time only once", () => {
    expect(moreTimeUntil({ claimedAt: days(-2), expiresAt: days(5), redeemedAt: days(-1) }, NOW)).toBeNull();
    expect(moreTimeUntil({ claimedAt: days(-2), expiresAt: days(12), extendedAt: days(-1) }, NOW)).toBeNull();
  });
});

describe("moreTimeMessage", () => {
  it("is the owner's own words, with no gambling words", () => {
    const m = moreTimeMessage("Adaeze", "Glow Studio", "Tue 2 Dec");
    expect(m).toBe("Hi Adaeze, I've kept your Glow Studio Tikka for you until Tue 2 Dec. See you then!");
    expect(m).not.toMatch(/\b(win|winner|luck|lucky|jackpot|odds|bet|stake|lottery|raffle)\b/i);
  });
});
