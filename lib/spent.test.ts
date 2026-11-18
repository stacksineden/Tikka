import { describe, expect, it } from "vitest";
import { canSetSpent, formatNairaInput, MAX_SPENT_NAIRA, parseNaira, spentProblem } from "./spent";

const now = new Date("2026-11-18T12:00:00+01:00");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();

describe("canSetSpent", () => {
  it("only for a used Tikka", () => {
    expect(canSetSpent(undefined, now)).toBe(false);
  });
  it("within 30 days of the visit", () => {
    expect(canSetSpent(daysAgo(0), now)).toBe(true);
    expect(canSetSpent(daysAgo(30), now)).toBe(true);
    expect(canSetSpent(daysAgo(31), now)).toBe(false);
  });
});

describe("parseNaira", () => {
  it("reads what owners type", () => {
    expect(parseNaira("15,000")).toBe(15000);
    expect(parseNaira("₦25000")).toBe(25000);
    expect(parseNaira(" 8 000 ")).toBe(8000);
  });
  it("empty or zero clears it", () => {
    expect(parseNaira("")).toBe(0);
    expect(parseNaira("0")).toBe(0);
  });
  it("refuses more than ₦10,000,000", () => {
    expect(parseNaira(String(MAX_SPENT_NAIRA))).toBe(MAX_SPENT_NAIRA);
    expect(parseNaira(String(MAX_SPENT_NAIRA + 1))).toBeNull();
    expect(parseNaira("999999999999999999999")).toBeNull();
  });
});

describe("formatNairaInput", () => {
  it("groups digits and stops at 7", () => {
    expect(formatNairaInput("15000")).toBe("15,000");
    expect(formatNairaInput("123456789")).toBe("1,234,567");
    expect(formatNairaInput("abc")).toBe("");
  });
});

describe("spentProblem", () => {
  it("says why in plain words, with ₦ never N", () => {
    for (const k of ["not_used", "too_late", "bad_amount", "unknown"] as const) {
      expect(spentProblem(k)).not.toMatch(/\bNGN\b|\bN\d/);
    }
    expect(spentProblem("too_late")).toContain("30 days");
  });
});
