import { describe, expect, it } from "vitest";
import { moneyBetween, owedList, reminderText, regularDates, waLink, weekStart, type Ledger } from "./ledger";

// Wednesday 25 Nov 2026, 10:00 WAT
const now = new Date("2026-11-25T09:00:00Z");

describe("ledger", () => {
  it("starts the week on Monday in WAT", () => {
    expect(weekStart(now).toISOString()).toBe("2026-11-22T23:00:00.000Z");
  });

  it("counts regular costs on the days they fall", () => {
    const from = weekStart(now);
    const to = new Date(from.getTime() + 7 * 86_400_000);
    expect(regularDates({ id: "r", kind: "Helper", kobo: 1, every: "week", from: "2026-11-07T10:00:00Z" }, from, to)).toHaveLength(1);
    expect(regularDates({ id: "r", kind: "Rent", kobo: 1, every: "month", from: "2026-10-01T10:00:00Z" }, from, to)).toHaveLength(0);
    expect(regularDates({ id: "r", kind: "Rent", kobo: 1, every: "month", from: "2026-10-24T10:00:00Z" }, from, to)).toHaveLength(1);
  });

  it("adds up money in, spent and kept, with where each came from", () => {
    const ledger: Ledger = {
      sales: [
        { id: "a", at: "2026-11-24T10:00:00Z", name: "Ada", item: "Knotless braids", totalKobo: 2_000_000, payments: [{ at: "2026-11-24T10:00:00Z", kobo: 2_000_000, method: "cash" }] },
        { id: "b", at: "2026-11-25T08:00:00Z", name: "Bisi", item: "Cornrows", totalKobo: 800_000, payments: [{ at: "2026-11-25T08:00:00Z", kobo: 500_000, method: "transfer" }] },
        { id: "c", at: "2026-11-10T08:00:00Z", name: "Old", item: "Cornrows", totalKobo: 100_000, payments: [{ at: "2026-11-10T08:00:00Z", kobo: 100_000, method: "cash" }] },
      ],
      expenses: [{ id: "e", at: "2026-11-24T12:00:00Z", kind: "Products", kobo: 300_000 }],
      regular: [{ id: "r", kind: "Helper", kobo: 500_000, every: "week", from: "2026-11-21T10:00:00Z" }],
    };
    const from = weekStart(now);
    const m = moneyBetween(ledger, [{ at: "2026-11-23T09:00:00Z", kobo: 800_000, name: "Ada", item: "Knotless braids" }], from, new Date(from.getTime() + 7 * 86_400_000));
    expect(m.inKobo).toBe(3_300_000);
    expect(m.came.find((l) => l.source === "auto")?.kobo).toBe(800_000);
    expect(m.spentKobo).toBe(800_000);
    expect(m.keptKobo).toBe(2_500_000);
    expect(m.best?.service).toBe("Knotless braids");
    expect(m.topCustomer?.name).toBe("Ada");
    expect(owedList(ledger)).toEqual([{ sale: ledger.sales[1], owedKobo: 300_000 }]);
  });

  it("writes reminders and WhatsApp links", () => {
    expect(reminderText("balance", { first: "Bisi", business: "Ada's", dueKobo: 300_000 })).toContain("₦3,000 balance");
    expect(waLink("0803 123 4567", "Hi")).toBe("https://wa.me/2348031234567?text=Hi");
    expect(waLink(undefined, "Hi")).toBeNull();
  });
});
