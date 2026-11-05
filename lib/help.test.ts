import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bySection, guideProblems, nextGuide, paragraphs, type HelpGuide } from "./help-shared";

const ROOT = join(process.cwd(), "content", "help");
const files = readdirSync(ROOT).filter((f) => f.endsWith(".json"));
const guides = files.map((f) => JSON.parse(readFileSync(join(ROOT, f), "utf8")) as HelpGuide);

const guide = (over: Partial<HelpGuide> = {}): HelpGuide => ({
  slug: "a-guide",
  title: "A guide",
  summary: "What it's for.",
  section: "start",
  order: 1,
  minutes: 2,
  steps: [
    { title: "One", body: "First." },
    { title: "Two", body: "Second." },
  ],
  published: true,
  ...over,
});

describe("Help guide files", () => {
  it.each(files)("%s passes its checks", (f) => {
    const g = JSON.parse(readFileSync(join(ROOT, f), "utf8"));
    expect(guideProblems(g)).toEqual([]);
    expect(`${g.slug}.json`).toBe(f);
  });

  it("have unique slugs and orders inside each section", () => {
    expect(new Set(guides.map((g) => g.slug)).size).toBe(guides.length);
    for (const s of bySection(guides)) expect(new Set(s.guides.map((g) => g.order)).size).toBe(s.guides.length);
  });

  it("only link to dashboard pages that exist", () => {
    for (const g of guides.filter((x) => x.app)) {
      const path = g.app!.href.replace(/^\/app/, "").replace(/^\//, "");
      const pages = [join(process.cwd(), "app", "app", "(shell)", path, "page.tsx"), join(process.cwd(), "app", "app", path, "page.tsx")];
      expect(pages.some((p) => { try { return readFileSync(p).length > 0; } catch { return false; } }), g.app!.href).toBe(true);
    }
  });
});

describe("guideProblems", () => {
  it("passes a good guide", () => expect(guideProblems(guide() as unknown as Record<string, unknown>)).toEqual([]));

  it("refuses gambling words and the wrong naira sign", () => {
    expect(guideProblems(guide({ summary: "Try your luck" }) as unknown as Record<string, unknown>).join()).toMatch(/gambling/);
    expect(guideProblems(guide({ summary: "You might win" }) as unknown as Record<string, unknown>).join()).toMatch(/gambling/);
    expect(guideProblems(guide({ summary: "Pay N5,000" }) as unknown as Record<string, unknown>).join()).toMatch(/₦/);
    expect(guideProblems(guide({ summary: "Pay 5000 NGN" }) as unknown as Record<string, unknown>).join()).toMatch(/₦/);
    expect(guideProblems(guide({ summary: "Pay ₦5,000. Every Tikka holds something." }) as unknown as Record<string, unknown>)).toEqual([]);
  });

  it("needs a known section, 2–10 steps and a dashboard link inside /app", () => {
    expect(guideProblems({ ...guide(), section: "other" }).join()).toMatch(/section/);
    expect(guideProblems(guide({ steps: [{ title: "Only", body: "One." }] }) as unknown as Record<string, unknown>).join()).toMatch(/steps/);
    expect(guideProblems(guide({ app: { href: "https://example.com", label: "Out" } }) as unknown as Record<string, unknown>).join()).toMatch(/app.href/);
  });
});

describe("reading order", () => {
  const list = [guide({ slug: "b", section: "drops", order: 1 }), guide({ slug: "a", section: "start", order: 2 }), guide({ slug: "c", section: "start", order: 1 })];

  it("groups by section, in section order, then by order", () => {
    expect(bySection(list).map((s) => [s.id, s.guides.map((g) => g.slug)])).toEqual([
      ["start", ["c", "a"]],
      ["drops", ["b"]],
    ]);
  });

  it("points each guide to the next one, and the last to none", () => {
    expect(nextGuide(list, "c")?.slug).toBe("a");
    expect(nextGuide(list, "a")?.slug).toBe("b");
    expect(nextGuide(list, "b")).toBeNull();
  });

  it("splits a step into paragraphs on blank lines", () => {
    expect(paragraphs("One.\n\nTwo.\n  \nThree.")).toEqual(["One.", "Two.", "Three."]);
  });
});
