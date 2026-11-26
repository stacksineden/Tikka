import { describe, expect, it } from "vitest";
import { dropReturn, showsCardNudge } from "./drop";

describe("first drop card nudge", () => {
  it("shows only before any drop is out, on a plain-colour card", () => {
    expect(showsCardNudge([], { type: "color" })).toBe(true);
    expect(showsCardNudge([{ status: "draft" }], { type: "color" })).toBe(true);
    expect(showsCardNudge([{ status: "ended" }], { type: "color" })).toBe(false);
    expect(showsCardNudge([], { type: "pattern" })).toBe(false);
    expect(showsCardNudge([], { type: "photo" })).toBe(false);
  });

  it("only goes back to a saved draft in the builder", () => {
    expect(dropReturn("/app/drops/new?draft=d_123")).toBe("/app/drops/new?draft=d_123");
    expect(dropReturn("/app/drops/new?draft=d_123&step=review")).toBe("/app/drops/new?draft=d_123&step=review");
    expect(dropReturn("https://evil.example")).toBeNull();
    expect(dropReturn("//evil.example/app/drops/new?draft=1")).toBeNull();
    expect(dropReturn("/app/drops/new?draft=1&x=2")).toBeNull();
    expect(dropReturn(undefined)).toBeNull();
    expect(dropReturn(["/app/drops/new?draft=1"])).toBeNull();
  });
});
