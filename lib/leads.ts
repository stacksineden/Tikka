// Leads (PRD B8, TECH_PLAN §10). Every claimer is the owner's to follow up: a normal WhatsApp
// chat from the owner's own phone (no API involved). Filtering and export are pure so the
// rules are tested; get_leads / export_leads apply the same filters in SQL.

import { WAT } from "./format";
import { normalizeNgPhone } from "./setup";
import type { Lead, Source, Tier } from "./types";

/** Verified: claimed through WhatsApp, or typed in and passed the check at the counter. */
export function leadVerified(l: Pick<Lead, "phoneConfirmed" | "counterChecked">): boolean {
  return l.phoneConfirmed !== false || l.counterChecked === true;
}

/** wa.me link with any message, from the owner's own phone. */
export function waLink(phone: string, text: string): string | null {
  const e164 = normalizeNgPhone(phone);
  return e164 ? `https://wa.me/${e164.slice(1)}?text=${encodeURIComponent(text)}` : null;
}

/** wa.me link with a prefilled follow-up, e.g. "Hi Tunde, your 20% off at Glow Studio is still waiting. It ends Sunday." */
export function followUpLink(
  lead: { name: string; phone: string; reward: string; status: "claimed" | "redeemed"; expiresAt?: string },
  businessName: string,
  now: Date = new Date(),
): string | null {
  const e164 = normalizeNgPhone(lead.phone);
  if (!e164) return null;
  const first = lead.name.trim().split(/\s+/)[0] ?? "";
  // When their own Tikka runs out (not the drop: Tikkas outlast it).
  const live = lead.expiresAt && new Date(lead.expiresAt) > now;
  const ends = live ? ` It ends ${new Date(lead.expiresAt!).toLocaleDateString("en-GB", { weekday: "long", timeZone: WAT })}.` : "";
  const text =
    lead.status === "redeemed"
      ? `Hi ${first}, thanks for coming to ${businessName}. We'd love to see you again soon.`
      : `Hi ${first}, your ${lead.reward.charAt(0).toLowerCase()}${lead.reward.slice(1)} at ${businessName} is still waiting.${ends}`;
  return `https://wa.me/${e164.slice(1)}?text=${encodeURIComponent(text)}`;
}

/** "Ask for a review": the owner's own WhatsApp message with this customer's review link (page-claim mode). */
export function reviewAskLink(lead: { name: string; phone: string }, businessName: string, reviewUrl: string): string | null {
  const first = lead.name.trim().split(/\s+/)[0] ?? "";
  return waLink(lead.phone, `Hi ${first}, thanks for coming to ${businessName}! How was it? Tap to rate us: ${reviewUrl}`);
}

export const LEAD_TABS = [
  { id: "all", label: "All" },
  { id: "new", label: "New" },
  { id: "redeemed", label: "Redeemed" },
  { id: "waiting", label: "Not yet redeemed" },
] as const;
export type LeadTab = (typeof LEAD_TABS)[number]["id"];

export interface LeadFilters {
  tab: LeadTab;
  dropId?: string;
  source?: Source;
  tier?: Tier;
  q?: string;
}

const TIERS: Tier[] = ["legendary", "rare", "thank_you"];
const SOURCES: Source[] = ["wa", "ig", "qr", "web", "ads", "market", "direct"];

/** Filters from the page's query string; anything unexpected is ignored. */
export function parseLeadFilters(sp: Record<string, string | string[] | undefined>): LeadFilters {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const tab = LEAD_TABS.find((t) => t.id === one("tab"))?.id ?? "all";
  const tier = TIERS.find((t) => t === one("tier"));
  const source = SOURCES.find((s) => s === one("source"));
  const q = one("q")?.trim().slice(0, 60) || undefined;
  return { tab, dropId: one("drop") || undefined, source, tier, q };
}

/** "New" is a first-time customer of this business; "Not yet redeemed" is a claim still waiting. */
export function filterLeads(leads: Lead[], f: LeadFilters): Lead[] {
  const q = f.q?.toLowerCase();
  return leads.filter(
    (l) =>
      (f.tab === "all" || (f.tab === "new" && l.isNew) || (f.tab === "redeemed" && l.status === "redeemed") || (f.tab === "waiting" && l.status === "claimed")) &&
      (!f.dropId || l.dropId === f.dropId) &&
      (!f.source || l.source === f.source) &&
      (!f.tier || l.tier === f.tier) &&
      (!q || l.name.toLowerCase().includes(q)),
  );
}

export function tabCounts(leads: Lead[], f: Omit<LeadFilters, "tab">): Record<LeadTab, number> {
  return Object.fromEntries(LEAD_TABS.map((t) => [t.id, filterLeads(leads, { ...f, tab: t.id }).length])) as Record<LeadTab, number>;
}

export const SOURCE_LABEL: Record<Source, string> = {
  wa: "WhatsApp",
  ig: "Instagram",
  qr: "QR code",
  web: "Web",
  ads: "Ads",
  market: "Marketplace",
  direct: "Direct",
};

const TIER_NAME: Record<Tier, string> = { legendary: "Legendary", rare: "Rare", thank_you: "Thank-you" };

/** One CSV cell: quoted, and a leading = + - @ can't run as a spreadsheet formula. */
function cell(v: string | number | undefined): string {
  let s = v === undefined ? "" : String(v);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** export_leads: every lead for the chosen drop or all drops. Owners only (the route checks). */
export function leadsCsv(leads: Lead[], dropNames: Record<string, string>): string {
  const head = ["Name", "WhatsApp", "Drop", "Tier", "Reward", "Status", "Source", "New customer", "Claimed (WAT)", "Spent (₦)", "Last followed up (WAT)", "Future drops"];
  const when = (iso?: string) =>
    iso ? new Date(iso).toLocaleString("en-GB", { timeZone: WAT, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
  const rows = leads.map((l) =>
    [
      l.name,
      l.phone,
      dropNames[l.dropId] ?? "",
      TIER_NAME[l.tier],
      l.reward,
      l.status === "redeemed" ? "Redeemed" : "Claimed",
      SOURCE_LABEL[l.source],
      l.isNew ? "Yes" : "No",
      when(l.claimedAt),
      l.spent ?? "",
      when(l.lastFollowupAt),
      l.marketingOptIn ? "Yes" : "No",
    ]
      .map(cell)
      .join(","),
  );
  // BOM so Excel on Windows reads ₦ and names with accents correctly.
  return "﻿" + [head.map(cell).join(","), ...rows].join("\r\n") + "\r\n";
}
