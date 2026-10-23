import { describe, expect, it } from "vitest";
import { abandonStale, assertCanReadLeads, completePayment, type Payment } from "./payments";

const NOW = new Date("2026-10-20T12:00:00+01:00");

function payment(p: Partial<Payment> = {}): Payment {
  return {
    id: "pay_1",
    businessId: "biz_1",
    dropId: "drop_1",
    kind: "drop",
    toTier: "medium",
    amountKobo: 1_000_000,
    reference: "ref_1",
    status: "pending",
    createdAt: "2026-10-20T11:50:00+01:00",
    ...p,
  };
}

describe("completePayment", () => {
  it("marks a matching payment paid and says to publish", () => {
    const { payments, result } = completePayment([payment()], "ref_1", 1_000_000, NOW);
    expect(result.effect).toBe("drop");
    expect(payments[0]).toMatchObject({ status: "paid", paidAt: NOW.toISOString() });
  });

  it("does nothing the second time (repeated webhook)", () => {
    const once = completePayment([payment()], "ref_1", 1_000_000, NOW);
    const twice = completePayment(once.payments, "ref_1", 1_000_000, NOW);
    expect(twice.result).toEqual({ effect: "none", reason: "already_paid" });
    expect(twice.payments).toBe(once.payments);
  });

  it("publishes nothing when the amount doesn't match", () => {
    const { payments, result } = completePayment([payment()], "ref_1", 500_000, NOW);
    expect(result.effect).toBe("failed");
    expect(payments[0].status).toBe("failed");
  });

  it("ignores unknown references and settled payments", () => {
    expect(completePayment([payment()], "nope", 1_000_000, NOW).result).toEqual({ effect: "none", reason: "unknown" });
    expect(completePayment([payment({ status: "abandoned" })], "ref_1", 1_000_000, NOW).result).toEqual({ effect: "none", reason: "not_pending" });
  });

  it("says to append Tikkas for an upgrade", () => {
    expect(completePayment([payment({ kind: "upgrade", fromTier: "medium", toTier: "large" })], "ref_1", 1_000_000, NOW).result.effect).toBe("upgrade");
  });
});

describe("abandonStale", () => {
  it("abandons pending payments older than an hour and leaves the rest", () => {
    const old = payment({ id: "a", createdAt: "2026-10-20T10:30:00+01:00" });
    const fresh = payment({ id: "b", reference: "ref_2" });
    const paid = payment({ id: "c", reference: "ref_3", status: "paid", createdAt: "2026-10-19T10:00:00+01:00" });
    expect(abandonStale([old, fresh, paid], NOW).map((p) => p.status)).toEqual(["abandoned", "pending", "paid"]);
  });
});

describe("leads", () => {
  it("only reach owners", () => {
    expect(() => assertCanReadLeads("owner")).not.toThrow();
    expect(() => assertCanReadLeads("staff")).toThrow();
    expect(() => assertCanReadLeads(null)).toThrow();
  });
});

it("says what a paid season pack should do", () => {
  const p = payment({ kind: "pack", dropId: undefined, packId: "small3", amountKobo: 1_200_000, reference: "ref_pack" });
  expect(completePayment([p], "ref_pack", 1_200_000, NOW).result).toMatchObject({ effect: "pack", payment: { status: "paid" } });
  expect(completePayment([p], "ref_pack", 1_000_000, NOW).result).toMatchObject({ effect: "failed" });
});
