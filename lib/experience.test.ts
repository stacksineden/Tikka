import { describe, expect, it } from "vitest";
import { finishSetupMissing, newExperience } from "./experience";

const real = "3a9adaca-5f14-4543-b341-f51a59d456d1";

describe("who gets the new experience", () => {
  it("every real business, set up the old way or the new", () => {
    expect(newExperience({ id: real })).toBe(true);
    expect(newExperience({ id: real, trades: ["hair"] })).toBe(true);
  });
  it("demo businesses only when made with the new setup", () => {
    expect(newExperience({ id: "biz_user_demo" })).toBe(false);
    expect(newExperience({ id: "biz_user_demo_new_1", trades: ["makeup"] })).toBe(true);
    expect(newExperience(null)).toBe(false);
  });
});

describe("finish setting up", () => {
  it("asks a business set up the old way for its trade, place and rules", () => {
    expect(finishSetupMissing({ id: real })).toEqual(["trade", "place", "rules"]);
  });
  it("is done once they're there", () => {
    expect(finishSetupMissing({ id: real, trades: ["hair"], workPlace: "shop", bookingRules: ["Be on time"] })).toEqual([]);
    expect(finishSetupMissing({ id: real, trades: ["hair"], workPlace: "both" })).toEqual(["rules"]);
  });
  it("never asks the demo", () => {
    expect(finishSetupMissing({ id: "biz_user_demo" })).toEqual([]);
  });
});
