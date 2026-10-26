import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  caseStudyProblems,
  filterWork,
  imageAt,
  normaliseQuery,
  parseWorkFilters,
  pieceProblems,
  posterFor,
  studioWhatsApp,
  testimonialShows,
  workHref,
  type CaseStudy,
  type StudioPiece,
  type WorkItem,
} from "./studio-shared";

const ROOT = join(process.cwd(), "content", "studio");
const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const caseFiles = readdirSync(join(ROOT, "work")).filter((f) => f.endsWith(".json"));

describe("Tikka Studio content files", () => {
  it.each(caseFiles)("case study %s passes its checks", (f) => {
    const c = read(join(ROOT, "work", f));
    expect(caseStudyProblems(c)).toEqual([]);
    expect(`${c.slug}.json`).toBe(f);
  });

  it("every piece passes its checks, once each", () => {
    const pieces = read(join(ROOT, "pieces.json")).pieces as Record<string, unknown>[];
    expect(pieces.length).toBeGreaterThan(0);
    for (const p of pieces) expect([p.key, pieceProblems(p)]).toEqual([p.key, []]);
    expect(new Set(pieces.map((p) => p.key)).size).toBe(pieces.length);
    expect(pieces.filter((p) => p.hero === "reel")).toHaveLength(1);
  });

  it("never shows a result that isn't the client's, or a name we can't use", () => {
    for (const f of caseFiles) {
      const c = read(join(ROOT, "work", f));
      for (const r of c.results) expect(r).not.toMatch(/\b(about|around|estimated|up to)\b/i);
    }
    const quote = { id: "x", quote: "RetenaAI helped us", name: "A", role: null, business: "B", permission_confirmed: true, published: true };
    expect(testimonialShows(quote)).toBe(false);
    expect(testimonialShows({ ...quote, quote: "Tikka Studio helped us" })).toBe(true);
    expect(testimonialShows({ ...quote, quote: "Tikka Studio helped us", permission_confirmed: false })).toBe(false);
  });
});

const caseItem = (over: Partial<CaseStudy>): WorkItem => ({
  kind: "case",
  item: {
    title: "An online store", slug: "store", client: "IzzyCrafts", city: null, categories: ["websites"], industry: "fashion",
    services: ["Online store"], cover: null, media: [], challenge: null, what_we_did: "A store for handmade footwear", results: [],
    quote: null, live_url: null, featured: true, order: 1, published: true, ...over,
  },
});
const piece = (over: Partial<StudioPiece>): WorkItem => ({
  kind: "piece",
  item: { key: "k", src: "https://res.cloudinary.com/x/image/upload/v1/a.png", type: "image", title: "Face serum campaign", categories: ["ads"], industry: "skincare", client: null, featured: false, hero: null, published: true, ...over },
});

describe("searching and filtering work", () => {
  const items = [caseItem({}), piece({ key: "serum" }), piece({ key: "sauce", title: "Chilli sauce campaign", industry: "food", featured: true })];

  it("understands what people type", () => {
    expect(normaliseQuery("Skin care")).toEqual(["skincare"]);
    const find = (q: string) => filterWork(items, { search: q }).map((w) => (w.kind === "case" ? w.item.slug : w.item.key));
    expect(find("skin care")).toEqual(["serum"]);
    expect(find("restaurant")).toEqual(["sauce"]);
    expect(find("website")).toEqual(["store"]);
    expect(find("shoes")).toEqual(["store"]);
  });

  it("filters by service and industry, case studies first then featured", () => {
    expect(filterWork(items, { category: "ads" }).map((w) => (w.item as StudioPiece).key)).toEqual(["sauce", "serum"]);
    expect(filterWork(items, { industry: "fashion" })).toHaveLength(1);
    expect(filterWork(items, {})[0].kind).toBe("case");
  });

  it("keeps filters in a shareable address and ignores unknown ones", () => {
    expect(parseWorkFilters({ category: "ads", industry: "nope", search: " skin " })).toEqual({ category: "ads", industry: undefined, search: "skin" });
    expect(workHref({ category: "ads" }, { search: "skin care" })).toBe("/studio/work?category=ads&search=skin+care");
    expect(workHref({})).toBe("/studio/work");
  });
});

describe("links and media", () => {
  it("opens the Studio team's WhatsApp with the right message", () => {
    expect(studioWhatsApp(undefined, "+2348022211241")).toBe("https://wa.me/2348022211241?text=Hi%20Tikka%20Studio%2C%20I'd%20like%20help%20with%20my%20business.");
    expect(decodeURIComponent(studioWhatsApp("Macbite", "+2348022211241").split("text=")[1])).toBe(
      "Hi Tikka Studio, I saw your work for Macbite and I'd like something similar.",
    );
  });

  it("asks Cloudinary for the right size and a still for videos", () => {
    expect(imageAt("https://res.cloudinary.com/a/image/upload/v1/x.png", 480)).toBe("https://res.cloudinary.com/a/image/upload/w_480,c_limit,f_auto,q_auto/v1/x.png");
    expect(posterFor("https://res.cloudinary.com/a/video/upload/v1/x.mov", 720)).toBe("https://res.cloudinary.com/a/video/upload/so_2,w_720,c_limit,f_jpg,q_auto/v1/x.jpg");
    expect(imageAt("/studio/work/macbite.jpg", 480)).toBe("/studio/work/macbite.jpg");
  });
});
