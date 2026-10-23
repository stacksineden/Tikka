import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TOKENS } from "./tokens";

describe("TOKENS", () => {
  it("matches design/tokens.css", () => {
    const css = readFileSync(join(__dirname, "../design/tokens.css"), "utf8");
    const light = css.slice(0, css.indexOf("}"));
    for (const [key, value] of Object.entries(TOKENS)) {
      const name = "--" + key.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
      expect(light, name).toMatch(new RegExp(`${name}:\\s*${value};`, "i"));
    }
  });
});
