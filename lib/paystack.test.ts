import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("Paystack webhook signature", async () => {
  const { verifySignature } = await import("./paystack");
  const key = "sk_test_example";
  const body = JSON.stringify({ event: "charge.success", data: { reference: "tk_1", amount: 1000000 } });
  const sig = createHmac("sha512", key).update(body).digest("hex");

  it("accepts Paystack's signature over the raw body", () => {
    expect(verifySignature(body, sig, key)).toBe(true);
  });

  it("rejects a changed body, a wrong key or no signature", () => {
    expect(verifySignature(body.replace("1000000", "100"), sig, key)).toBe(false);
    expect(verifySignature(body, sig, "sk_test_other")).toBe(false);
    expect(verifySignature(body, null, key)).toBe(false);
    expect(verifySignature(body, sig, undefined)).toBe(false);
  });
});
