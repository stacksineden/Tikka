import { describe, expect, it } from "vitest";
import { filterLeads, followUpLink, leadsCsv, parseLeadFilters, tabCounts } from "./leads";
import type { Lead } from "./types";

const base: Lead = {
  id: "l1",
  name: "Tunde Adebayo",
  phone: "0803 774 4521",
  status: "claimed",
  isNew: true,
  fromMarketplace: false,
  source: "ig",
  tier: "rare",
  reward: "20% off any service",
  dropId: "drop_oct",
  claimedAt: "2026-10-20T10:31:00+01:00",
};
const leads: Lead[] = [
  base,
  { ...base, id: "l2", name: "Adaeze Okafor", status: "redeemed", spent: 25000, isNew: false, source: "wa", tier: "legendary" },
  { ...base, id: "l3", name: "=HYPERLINK(\"x\")", dropId: "drop_sep", source: "market", fromMarketplace: true },
];

describe("follow-up link", () => {
  it("opens WhatsApp from the owner's phone with a prefilled follow-up", () => {
    const link = followUpLink({ ...base, expiresAt: "2026-11-01T23:59:00+01:00" }, "Glow Studio", new Date("2026-10-20T11:00:00+01:00"));
    expect(link).toBe(`https://wa.me/2348037744521?text=${encodeURIComponent("Hi Tunde, your 20% off any service at Glow Studio is still waiting. It ends Sunday.")}`);
    expect(followUpLink({ name: "X", phone: "123", reward: "", status: "claimed" }, "G")).toBeNull();
  });
});

describe("filters", () => {
  it("parses only known values", () => {
    expect(parseLeadFilters({ tab: "waiting", tier: "rare", source: "nope", q: "  tun " })).toEqual({ tab: "waiting", tier: "rare", source: undefined, q: "tun", dropId: undefined });
    expect(parseLeadFilters({ tab: "x" }).tab).toBe("all");
  });

  it("filters by tab, drop, source, tier and name", () => {
    expect(filterLeads(leads, { tab: "redeemed" }).map((l) => l.id)).toEqual(["l2"]);
    expect(filterLeads(leads, { tab: "waiting" }).map((l) => l.id)).toEqual(["l1", "l3"]);
    expect(filterLeads(leads, { tab: "new" }).map((l) => l.id)).toEqual(["l1", "l3"]);
    expect(filterLeads(leads, { tab: "all", dropId: "drop_sep" }).map((l) => l.id)).toEqual(["l3"]);
    expect(filterLeads(leads, { tab: "all", source: "wa" }).map((l) => l.id)).toEqual(["l2"]);
    expect(filterLeads(leads, { tab: "all", tier: "legendary" }).map((l) => l.id)).toEqual(["l2"]);
    expect(filterLeads(leads, { tab: "all", q: "ADAEZE" }).map((l) => l.id)).toEqual(["l2"]);
    expect(tabCounts(leads, {})).toEqual({ all: 3, new: 2, redeemed: 1, waiting: 2 });
  });
});

describe("CSV export", () => {
  it("has every lead in full, quoted, with formulas defused", () => {
    const csv = leadsCsv(leads, { drop_oct: "October Glow", drop_sep: "September Reset" });
    const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain('"WhatsApp"');
    expect(lines[2]).toContain('"Adaeze Okafor","0803 774 4521","October Glow","Legendary"');
    expect(lines[2]).toContain('"Redeemed"');
    expect(lines[2]).toContain('"25000"');
    expect(lines[3]).toContain(`"'=HYPERLINK(""x"")"`);
  });
});
