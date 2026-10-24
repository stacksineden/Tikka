import { describe, expect, it } from "vitest";
import { compose } from "./wa-text";

const SITE = "https://usetikka.com";
const GAMBLING = /\b(win|wins|winner|winning|luck|lucky|jackpot|odds|bet|stake|lottery|raffle|prize draw)\b/i;
const card = { business_name: "Glow Studio", reward: "20% off any service", tier: "rare", code: "GS-7X4QP", expires_at: "2026-12-15T22:59:00Z", view_token: "abc" };

describe("WhatsApp messages", () => {
  it("send the card with its code, date and link", () => {
    expect(compose("card", card, SITE).text).toBe(
      "🎟 You got a Tikka from Glow Studio! 20% off any service · Rare · Code GS-7X4QP · use by Tue 15 Dec. Show this at the counter: https://usetikka.com/t/abc",
    );
    expect(compose("resend", card, SITE).text).toMatch(/^Here's your Tikka from Glow Studio again\. 🎟 You got a Tikka/);
  });

  it("explain why a claim didn't go through", () => {
    const ctx = { business_name: "Glow Studio", business_slug: "glowstudio", drop_slug: "october-glow" };
    expect(compose("reply", { ...ctx, reply: "blocked_new_only" }, SITE).text).toBe(
      "This drop is for new customers. You're already on Glow Studio's list, so watch out for their next drop.",
    );
    expect(compose("reply", { ...ctx, reply: "expired" }, SITE).text).toContain("https://usetikka.com/d/glowstudio/october-glow");
    expect(compose("reply", { reply: "invalid" }, SITE).text).toBe("Tap Claim on the Tikka page again and send the message as it is.");
    expect(compose("reply", { ...ctx, reply: "stopped" }, SITE).text).toBe("You won't get Tikka messages about Glow Studio again.");
    expect(compose("reply", { reply: "something new" }, SITE).text).toMatch(/Reply STOP/);
  });

  it("confirm Notify me", () => {
    expect(compose("notify_confirm", { business_name: "Glow Studio", scope: "drop", starts_at: "2026-12-14T08:00:00Z" }, SITE).text).toBe(
      "Done. We'll message you when Glow Studio's drop opens on Mon 14 Dec, 9am.",
    );
    expect(compose("notify_confirm", { business_name: "Glow Studio", scope: "business" }, SITE).text).toBe("Done. We'll message you when Glow Studio drops again.");
  });

  it("thank them, with the next-visit Tikka and the review link, and the template's values", () => {
    const m = compose("thanks", { business_name: "Glow Studio", first_name: "Adaeze", view_token: "t1", bounce_back: { reward: "10% off your next visit", expires_at: "2027-01-20T22:59:00Z", view_token: "t2" } }, SITE);
    expect(m.text).toBe(
      "Thanks for coming to Glow Studio, Adaeze. Here's 10% off your next visit, valid till Wed 20 Jan: https://usetikka.com/t/t2 How was it? Tap to rate: https://usetikka.com/t/t1/review",
    );
    expect(m.params).toEqual(["Glow Studio", "Adaeze", "Here's 10% off your next visit, valid till Wed 20 Jan: https://usetikka.com/t/t2", "https://usetikka.com/t/t1/review"]);
    expect(compose("thanks", { business_name: "Glow Studio", first_name: "Bola", view_token: "t3", bounce_back: null }, SITE).params?.[2]).toBe("");
  });

  it("remind and announce, as templates", () => {
    expect(compose("expiry_reminder", { reward: "20% off any service", business_name: "Glow Studio", expires_at: "2026-12-15T22:59:00Z", view_token: "abc" }, SITE).params).toEqual([
      "20% off any service",
      "Glow Studio",
      "Tue 15 Dec",
      "https://usetikka.com/t/abc",
    ]);
    expect(compose("drop_live", { business_name: "Glow Studio", business_slug: "glowstudio", drop_slug: "december", total: 600, legendary: 10 }, SITE).text).toBe(
      "Glow Studio's drop is live. 600 Tikkas, 10 legendary. Claim yours: https://usetikka.com/d/glowstudio/december",
    );
  });

  it("never use gambling words", () => {
    const replies = ["sold_out", "market_sold_out", "blocked_new_only", "blocked_period", "expired", "invalid", "help", "stopped", "stopped_all", "notify_live", "notify_invalid"];
    for (const reply of replies) expect(compose("reply", { reply, business_name: "Glow" }, SITE).text).not.toMatch(GAMBLING);
    expect(compose("card", card, SITE).text).not.toMatch(GAMBLING);
  });
});
