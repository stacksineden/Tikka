import { describe, expect, it } from "vitest";
import { requestPhone } from "./privacy";

describe("the number in a privacy request", () => {
  it("takes Nigerian numbers however they're written", () => {
    for (const n of ["0803 123 4567", "08031234567", "2348031234567", "+234 803 123 4567", "+234 (803) 123-4567"]) expect(requestPhone(n)).toBe("+2348031234567");
  });
  it("takes other countries with their +", () => {
    expect(requestPhone("+44 7700 900123")).toBe("+447700900123");
  });
  it("refuses anything else", () => {
    for (const n of ["", "12345", "0803", "447700900123", "+0123456789", "call me"]) expect(requestPhone(n)).toBeNull();
  });
});
