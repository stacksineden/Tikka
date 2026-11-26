import { describe, expect, it } from "vitest";
import { alertDue, eveningAlertText, weeklyAlertText } from "./money-alert";

describe("money alerts", () => {
  it("asks about spending in the evening and mentions who isn't marked paid", () => {
    const a = eveningAlertText({ businessName: "Kemi Hair", inKobo: 4_250_000, unpaid: 2 });
    expect(a.title).toBe("Anything you spent today? · Kemi Hair");
    expect(a.body).toBe("₦42,500 came in today. 2 customers aren't marked paid yet. Tap to add what you spent.");
    expect(a.url).toBe("/app");
    expect(eveningAlertText({ businessName: "K", inKobo: 0, unpaid: 0 }).body).toBe("Nothing recorded today yet. Tap to add what you spent.");
  });

  it("sums up the week on Sunday", () => {
    const a = weeklyAlertText({ businessName: "Kemi Hair", inKobo: 18_400_000, spentKobo: 5_200_000, keptKobo: 13_200_000, best: "Knotless braids" });
    expect(a.body).toBe("₦184,000 in, ₦52,000 spent, you kept ₦132,000. Best seller: Knotless braids.");
  });

  it("knows when each is due, in WAT", () => {
    expect(alertDue(new Date("2026-11-25T19:00:00Z"))).toBe("evening"); // Wed 20:00 WAT
    expect(alertDue(new Date("2026-11-29T18:00:00Z"))).toBe("weekly"); // Sun 19:00 WAT
    expect(alertDue(new Date("2026-11-29T19:00:00Z"))).toBe("evening"); // Sun 20:00 WAT
    expect(alertDue(new Date("2026-11-25T12:00:00Z"))).toBeNull();
  });
});
