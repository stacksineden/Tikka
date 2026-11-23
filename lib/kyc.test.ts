import { describe, expect, it } from "vitest";
import { cacNumber, kycStanding, limitFromInput, suggestLimitKobo } from "./kyc";

describe("suggestLimitKobo", () => {
  it("covers the biggest deposit with some room", () => {
    expect(suggestLimitKobo({ topDepositKobo: 8_000_000 })).toBe(10_000_000); // ₦80,000 → ₦100,000
    expect(suggestLimitKobo({ topDepositKobo: 15_000_000 })).toBe(19_000_000); // ₦150,000 → ₦190,000
    expect(suggestLimitKobo({ topDepositKobo: 1_500_000 })).toBe(2_000_000); // ₦15,000 → ₦20,000
  });
  it("uses half the priciest service when no deposits are set", () => {
    expect(suggestLimitKobo({ topPriceKobo: 15_000_000 })).toBe(10_000_000); // ₦150,000 → ₦100,000
  });
  it("stays between ₦20,000 and ₦1,000,000", () => {
    expect(suggestLimitKobo({})).toBe(2_000_000);
    expect(suggestLimitKobo({ topDepositKobo: 500_000_000 })).toBe(100_000_000);
  });
});

describe("limitFromInput", () => {
  it("reads naira and keeps it within Tikka's limits", () => {
    expect(limitFromInput("100,000")).toBe(10_000_000);
    expect(limitFromInput("₦1,000")).toBe(100_000);
    expect(limitFromInput("500")).toBeNull();
    expect(limitFromInput("2,000,000")).toBeNull();
    expect(limitFromInput("")).toBeNull();
  });
});

describe("cacNumber", () => {
  it("accepts the number with or without its letters", () => {
    expect(cacNumber("rc", "rc 1234567")).toBe("RC 1234567");
    expect(cacNumber("bn", "3456789")).toBe("BN 3456789");
    expect(cacNumber("bn", "RC 3456789")).toBeNull();
    expect(cacNumber("rc", "12")).toBeNull();
  });
});

describe("kycStanding", () => {
  const now = new Date("2026-12-01T12:00:00+01:00");
  it("reads where a business stands", () => {
    expect(kycStanding({ kyc: { status: "approved" }, enabled: true }, now)).toBe("verified");
    expect(kycStanding({ kyc: { status: "submitted" }, enabled: false }, now)).toBe("waiting");
    expect(kycStanding({ kyc: { status: "again" }, enabled: false }, now)).toBe("asked_again");
    expect(kycStanding({ enabled: true, graceUntil: "2026-12-08T00:00:00+01:00" }, now)).toBe("id_missing");
    expect(kycStanding({ enabled: true, graceUntil: "2026-11-30T00:00:00+01:00" }, now)).toBe("paused");
  });
});

describe("graceDay", () => {
  it("names the last day before the midnight deadline, in WAT", async () => {
    const { graceDay } = await import("./kyc");
    expect(graceDay("2026-12-08T00:00:00+01:00")).toBe("7 December");
  });
});
