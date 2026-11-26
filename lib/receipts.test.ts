import { describe, expect, it } from "vitest";
import type { Booking } from "./bookings";
import type { Sale } from "./ledger";
import { buildReceipt, receiptMessage, receiptNumber } from "./receipts";

const booking: Booking = {
  id: "b1", service: "Knotless braids", minutes: 360, startsAt: "2026-11-25T09:00:00Z", endsAt: "2026-11-25T15:00:00Z", firstName: "Ada", phone: "+2348031110011",
  source: "page", status: "arrived", code: "BK-X", moved: false, createdAt: "2026-11-20T10:00:00Z", depositPaidKobo: 800_000, priceKobo: 2_650_000, detail: "Long, add wash",
};

describe("receipts", () => {
  it("shows the deposit paid online, then what was paid at the visit, and what's left", () => {
    // ₦26,500 with an ₦8,000 deposit: ₦18,500 due at the visit, ₦10,000 paid in cash.
    const sale: Sale = { id: "s1", at: "2026-11-25T15:00:00Z", name: "Ada", item: "Knotless braids", totalKobo: 1_850_000, payments: [{ at: "2026-11-25T15:00:00Z", kobo: 1_000_000, method: "cash" }], bookingId: "b1" };
    const r = buildReceipt(sale, booking, 7);
    expect(r.number).toBe("R-0007");
    expect(r.detail).toBe("Long, add wash");
    expect(r.totalKobo).toBe(2_650_000);
    expect(r.payments.map((p) => [p.label, p.kobo])).toEqual([["Deposit, paid online", 800_000], ["Cash", 1_000_000]]);
    expect(r.paidKobo).toBe(1_800_000);
    expect(r.owedKobo).toBe(850_000);
    // The balance paid later by pay link shows on the same receipt.
    sale.payments.push({ at: "2026-11-26T10:00:00Z", kobo: 850_000, method: "pay_link" });
    const later = buildReceipt(sale, booking, 7);
    expect(later.owedKobo).toBe(0);
    expect(later.payments.at(-1)?.label).toBe("Pay link");
  });

  it("a deposit on top of the bill isn't part of the total; a walk-in has no booking", () => {
    const sale: Sale = { id: "s2", at: "2026-11-25T15:00:00Z", name: "Ada", item: "Knotless braids", totalKobo: 2_650_000, payments: [{ at: "2026-11-25T15:00:00Z", kobo: 2_650_000, method: "transfer" }], bookingId: "b1" };
    expect(buildReceipt(sale, { ...booking, depositCounts: false }, 1).totalKobo).toBe(2_650_000);
    const walkIn: Sale = { id: "s3", at: "2026-11-25T12:00:00Z", name: "Ngozi", item: "Silk press", totalKobo: 900_000, payments: [{ at: "2026-11-25T12:00:00Z", kobo: 900_000, method: "cash" }] };
    const r = buildReceipt(walkIn, null, 12);
    expect([r.customer, r.item, r.totalKobo, r.paidKobo, r.owedKobo, r.number]).toEqual(["Ngozi", "Silk press", 900_000, 900_000, 0, "R-0012"]);
    expect(receiptNumber(0)).toBe("R-0001");
    expect(receiptMessage("Ngozi", "Glow Studio", "Silk press", "https://x/r/1")).toBe("Hi Ngozi, here's your receipt from Glow Studio for Silk press: https://x/r/1");
  });
});
