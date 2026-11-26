import { describe, expect, it } from "vitest";
import { sheetTheme } from "./sheet-theme";

describe("sheetTheme", () => {
  it("is dark on dark page styles and light on light ones", () => {
    expect(sheetTheme("luxe", undefined, "#B8325E", "#FFFFFF").tone).toBe("dark");
    expect(sheetTheme("film", undefined, "#B8325E", "#FFFFFF").tone).toBe("dark");
    expect(sheetTheme("photography", "dark", "#B8325E", "#FFFFFF").tone).toBe("dark");
    expect(sheetTheme("photography", "light", "#B8325E", "#FFFFFF").tone).toBe("light");
    expect(sheetTheme("soft", undefined, "#B8325E", "#FFFFFF").tone).toBe("light");
    expect(sheetTheme("beauty", undefined, "#B8325E", "#FFFFFF").tone).toBe("light");
  });

  it("uses the brand colour as the accent, never Tikka's gold or indigo", () => {
    const t = sheetTheme("luxe", undefined, "#B8325E", "#FFFFFF");
    expect(t.vars["--bf-acc"]).toBe("#B8325E");
    expect(t.vars["--bf-on-acc"]).toBe("#FFFFFF");
    expect(t.vars["--focus-ring"]).toBe("#B8325E");
    expect(t.vars["--gold-soft"]).toBe(t.vars["--surface-sunken"]);
  });

  it("falls back to the page's text colour when the brand colour would vanish", () => {
    const t = sheetTheme("film", undefined, "#111111", "#FFFFFF");
    expect(t.vars["--bf-acc"]).toBe(t.vars["--ink"]);
    expect(t.vars["--bf-on-acc"]).toBe("#0C0C0C");
  });
});
