import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { signClaim, verifyClaim } = await import("./og-sign");

describe("card image signatures", () => {
  const id = "3f42758a-c230-4635-996e-5fb2f24633db";
  it("verifies its own signature", () => {
    expect(verifyClaim(id, signClaim(id, "k1"), "k1")).toBe(true);
  });
  it("refuses another claim, another key or a tampered signature", () => {
    const sig = signClaim(id, "k1");
    expect(verifyClaim("16f1ff8d-e07a-402c-8335-a7cc859e2baf", sig, "k1")).toBe(false);
    expect(verifyClaim(id, sig, "k2")).toBe(false);
    expect(verifyClaim(id, sig.slice(0, -1) + (sig.endsWith("A") ? "B" : "A"), "k1")).toBe(false);
    expect(verifyClaim(id, "", "k1")).toBe(false);
  });
  it("is short and safe in a URL", () => {
    expect(signClaim(id, "k1")).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });
});
