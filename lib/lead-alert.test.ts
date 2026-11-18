import { describe, expect, it } from "vitest";
import { bookingAlertText, leadAlertText, testAlertText } from "./lead-alert";

const GAMBLING = /\b(win|winner|luck|lucky|jackpot|odds|bet|stake|lottery|raffle)\b/i;

describe("leadAlertText", () => {
  it("names the person, the tier and the reward", () => {
    expect(leadAlertText({ businessName: "Glow Studio", firstName: "Adaeze", tier: "rare", reward: "20% off any service", recent: 1 })).toEqual({
      title: "New lead · Glow Studio",
      body: "Adaeze just claimed a Rare Tikka: 20% off any service. Tap to message them.",
    });
  });

  it("calls the common tier Thank-you", () => {
    expect(leadAlertText({ businessName: "Glow Studio", firstName: "Tunde", tier: "common", reward: "Free hair wash", recent: 1 }).body).toMatch(/a Thank-you Tikka/);
  });

  it("folds a burst into one notification", () => {
    const t = leadAlertText({ businessName: "Glow Studio", firstName: "Kemi", tier: "legendary", reward: "Free facial", recent: 4 });
    expect(t.title).toBe("4 new leads · Glow Studio");
    expect(t.body).toBe("Latest: Kemi claimed a Legendary Tikka (Free facial). Tap to see them all.");
  });

  it("never carries a phone number or a gambling word", () => {
    for (const recent of [1, 3]) {
      const t = leadAlertText({ businessName: "Glow Studio", firstName: "Ada", tier: "rare", reward: "20% off", recent });
      expect(`${t.title} ${t.body}`).not.toMatch(/\+?\d{7,}/);
      expect(`${t.title} ${t.body}`).not.toMatch(GAMBLING);
    }
    expect(`${testAlertText("Glow Studio").title} ${testAlertText("Glow Studio").body}`).not.toMatch(GAMBLING);
  });
});

describe("bookingAlertText", () => {
  it("says who booked what and when, never a number", () => {
    const t = bookingAlertText({ businessName: "Glow Studio", firstName: "Adaeze", service: "Braids", when: "Sat 15 Nov, 2:00pm" });
    expect(t.title).toBe("New booking · Glow Studio");
    expect(t.body).toBe("Adaeze booked Braids for Sat 15 Nov, 2:00pm. Tap to see your bookings.");
    expect(t.body).not.toMatch(/\d{6,}/);
  });
});
