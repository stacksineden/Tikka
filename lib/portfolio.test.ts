import { describe, expect, it } from "vitest";
import { collectionBookingLink, collectionLine, collectionNameProblem, collectionSlug, planMessage, portfolioPlan, portfolioView, PORTFOLIO_FREE, PORTFOLIO_OPEN } from "./portfolio";
import type { Business, PortfolioPhoto } from "./types";

const now = new Date("2026-12-10T10:00:00+01:00");
const drop = (id: string, endsAt: string, paidWith?: "voucher" | "payment", status = "ended") => ({ id, status: status as "ended", endsAt, paidWith });
const voucher = (source: "signup" | "pack" | "paid" | "admin" | "guarantee", usedByDropId?: string, expiresAt?: string) => ({ id: `v_${source}`, source, usedByDropId, expiresAt });

describe("portfolioPlan", () => {
  it("is the free page with no paid drop", () => {
    expect(portfolioPlan({ founding: false, vouchers: [], drops: [], now })).toEqual({ open: false, ...PORTFOLIO_FREE });
  });
  it("isn't opened by the free first drop", () => {
    const plan = portfolioPlan({ founding: false, vouchers: [voucher("signup", "d1")], drops: [drop("d1", "2026-12-20T00:00:00+01:00", "voucher", "live")], now });
    expect(plan.open).toBe(false);
  });
  it("is opened by a paid drop until 7 days after it ends", () => {
    const d = drop("d2", "2026-12-08T10:00:00+01:00", "payment");
    const plan = portfolioPlan({ founding: false, vouchers: [], drops: [d], now });
    expect(plan).toMatchObject({ open: true, reason: "drop", ...PORTFOLIO_OPEN });
    expect(new Date(plan.until!).toISOString()).toBe(new Date("2026-12-15T10:00:00+01:00").toISOString());
    expect(portfolioPlan({ founding: false, vouchers: [], drops: [d], now: new Date("2026-12-15T10:00:01+01:00") }).open).toBe(false);
  });
  it("counts the latest paid drop, and never a draft", () => {
    const drops = [drop("old", "2026-10-01T00:00:00+01:00", "payment"), drop("new", "2026-12-30T00:00:00+01:00", "payment", "scheduled"), drop("draft", "2027-03-01T00:00:00+01:00", "payment", "draft")];
    expect(portfolioPlan({ founding: false, vouchers: [], drops, now }).until).toBe(new Date("2027-01-06T00:00:00+01:00").toISOString());
  });
  it("is opened by drops from a season pack, the guarantee and Tikka's gifts", () => {
    for (const source of ["pack", "guarantee", "admin"] as const) {
      expect(portfolioPlan({ founding: false, vouchers: [voucher(source, "d3")], drops: [drop("d3", "2026-12-09T00:00:00+01:00", "voucher")], now }).open).toBe(true);
    }
  });
  it("stays open all season while a pack has drops left", () => {
    expect(portfolioPlan({ founding: false, vouchers: [voucher("pack", undefined, "2027-06-01T00:00:00+01:00")], drops: [], now })).toMatchObject({ open: true, reason: "pack", until: undefined });
    expect(portfolioPlan({ founding: false, vouchers: [voucher("pack", undefined, "2026-12-01T00:00:00+01:00")], drops: [], now }).open).toBe(false);
    expect(portfolioPlan({ founding: false, vouchers: [voucher("admin")], drops: [], now }).open).toBe(false);
  });
  it("is always open for founding members", () => {
    expect(portfolioPlan({ founding: true, vouchers: [], drops: [], now })).toMatchObject({ open: true, reason: "founding" });
  });
});

describe("collections", () => {
  const photo = (id: string, collectionId?: string): PortfolioPhoto => ({ id, url: `/${id}.webp`, thumbUrl: `/${id}-t.webp`, collectionId });
  const b = {
    name: "Maril Kay",
    actions: [{ kind: "whatsapp" as const, value: "0803 123 4567" }],
    services: [{ name: "Bridal makeup", price: 150000, priceKind: "from" as const }],
    collections: [
      { id: "c1", name: "Bridal", slug: "bridal", serviceName: "bridal makeup", coverId: "p2" },
      { id: "c2", name: "Gele", slug: "gele" },
      { id: "c3", name: "Empty", slug: "empty" },
    ],
    portfolio: [photo("p1", "c1"), photo("p2", "c1"), photo("p3", "c2"), photo("p4"), photo("p5", "gone")],
  } satisfies Pick<Business, "name" | "actions" | "services" | "collections" | "portfolio">;

  it("makes links from names, never clashing", () => {
    expect(collectionSlug("Bridal & Gele")).toBe("bridal-gele");
    expect(collectionSlug("  Owambe!! ")).toBe("owambe");
    expect(collectionSlug("Gele", ["gele", "gele-2"])).toBe("gele-3");
    expect(collectionSlug("★★★")).toBe("collection");
    expect(collectionSlug("a".repeat(40)).length).toBeLessThanOrEqual(30);
  });
  it("checks names in plain words (rule 8 too)", () => {
    expect(collectionNameProblem(" ")).toMatch(/Give it a name/);
    expect(collectionNameProblem("Lucky dip")).toMatch(/Avoid words/);
    expect(collectionNameProblem("bridal", ["Bridal"])).toMatch(/already have/);
    expect(collectionNameProblem("Winter looks")).toBeNull();
  });
  it("shows collections that hold something, with their cover, and the rest as More work", () => {
    const view = portfolioView(b);
    expect(view.collections.map((c) => [c.name, c.photos.length, c.cover.id])).toEqual([
      ["Bridal", 2, "p2"],
      ["Gele", 1, "p3"],
    ]);
    expect(view.rest.map((p) => p.id)).toEqual(["p4", "p5"]);
    expect(view.collections[0].service?.name).toBe("Bridal makeup");
    expect(collectionLine(view.collections[0])).toBe("2 photos · from ₦150,000");
    expect(collectionLine(view.collections[1])).toBe("1 photo");
    expect(portfolioView({ ...b, collections: undefined }).rest).toHaveLength(5);
  });
  it("books the collection's service on WhatsApp", () => {
    const [bridal, gele] = portfolioView(b).collections;
    expect(decodeURIComponent(collectionBookingLink(b, bridal)!)).toBe("https://wa.me/2348031234567?text=Hi Maril Kay, I saw your Bridal work on Tikka and I'd like to book Bridal makeup (From ₦150,000).");
    expect(decodeURIComponent(collectionBookingLink(b, gele)!)).toMatch(/your Gele work on Tikka and I'd like to book an appointment\.$/);
    expect(collectionBookingLink({ ...b, actions: [] }, gele)).toBeNull();
  });
  it("tells the owner where they stand", () => {
    const free = { open: false, ...PORTFOLIO_FREE };
    expect(planMessage(free, { items: 5, collections: 0 }).tone).toBe("free");
    expect(planMessage(free, { items: 5, collections: 2 }).tone).toBe("locked");
    expect(planMessage(free, { items: 34, collections: 0 }).tone).toBe("locked");
    expect(planMessage({ open: true, reason: "drop", until: "2027-01-07T10:00:00+01:00", ...PORTFOLIO_OPEN }, { items: 5, collections: 0 }).title).toBe("Collections are open till Thu 7 Jan");
    expect(planMessage({ open: true, reason: "pack", ...PORTFOLIO_OPEN }, { items: 0, collections: 0 }).title).toMatch(/all season/);
  });
});
