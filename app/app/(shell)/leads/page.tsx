import type { Metadata } from "next";
import { Check, Download, Search, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AutoSubmit, FollowUpButton, LiveRefresh } from "@/components/leads/LeadBits";
import { RarityBadge } from "@/components/tikka/RarityBadge";
import { MessageToday } from "@/components/leads/MessageToday";
import { getBusiness, getDrops, getFollowups, getLeads, leadsNow } from "@/lib/data";
import { visitPlanLabel } from "@/lib/followups";
import { naira, shortDate, timeAgo } from "@/lib/format";
import { filterLeads, followUpLink, LEAD_TABS, parseLeadFilters, SOURCE_LABEL, tabCounts, type LeadFilters } from "@/lib/leads";
import { getOwnerUser } from "@/lib/session";
import type { Source, Tier } from "@/lib/types";

export const metadata: Metadata = { title: "Leads" };

const TIER_OPTIONS: [Tier, string][] = [
  ["legendary", "Legendary"],
  ["rare", "Rare"],
  ["thank_you", "Thank-you"],
];

function href(f: LeadFilters, patch: Partial<LeadFilters>): string {
  const next = { ...f, ...patch };
  const p = new URLSearchParams();
  if (next.tab !== "all") p.set("tab", next.tab);
  if (next.dropId) p.set("drop", next.dropId);
  if (next.source) p.set("source", next.source);
  if (next.tier) p.set("tier", next.tier);
  if (next.q) p.set("q", next.q);
  const s = p.toString();
  return `/app/leads${s ? `?${s}` : ""}`;
}

async function Leads({ searchParams }: { searchParams: PageProps<"/app/leads">["searchParams"] }) {
  // Owners only (rule 4). Staff never reach this page, and get_leads refuses them anyway.
  const user = await getOwnerUser();
  if (!user) redirect("/app/redeem");
  const [b, all, drops, today, sp, planNow] = await Promise.all([getBusiness(user), getLeads(user), getDrops(user), getFollowups(user), searchParams, leadsNow(user)]);
  if (!b) redirect("/app/setup");

  const f = parseLeadFilters(sp);
  const rows = filterLeads(all, f);
  const counts = tabCounts(all, { dropId: f.dropId, source: f.source, tier: f.tier, q: f.q });
  const published = drops.filter((d) => d.status !== "draft");
  const dropById = new Map(published.map((d) => [d.id, d]));
  const sources = [...new Set(all.map((l) => l.source))] as Source[];
  const live = published.some((d) => d.status === "live");
  const now = new Date();
  const exportHref = `/api/leads/export${f.dropId ? `?drop=${encodeURIComponent(f.dropId)}` : ""}`;

  return (
    <>
      {live && <LiveRefresh />}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-heading">Leads</h1>
          <p className="text-body mt-1 text-ink-muted">Everyone who claimed. They&apos;re yours to follow up.</p>
        </div>
        <a href={exportHref} className="btn btn-secondary" download>
          <Download />
          Export CSV{f.dropId ? "" : " (all drops)"}
        </a>
      </div>

      {today.length > 0 && <MessageToday items={today} />}

      <nav aria-label="Lead groups" className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
        <ul className="flex gap-1 rounded-md bg-surface-sunken p-1 sm:inline-flex">
          {LEAD_TABS.map((t) => (
            <li key={t.id}>
              <Link
                href={href(f, { tab: t.id })}
                aria-current={f.tab === t.id ? "page" : undefined}
                className={`text-label flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-md px-3 ${f.tab === t.id ? "bg-surface-raised text-ink shadow-raised" : "text-ink-muted"}`}
              >
                {t.label}
                <span className="font-mono text-[12px] tabular-nums opacity-70">{counts[t.id]}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <AutoSubmit className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {f.tab !== "all" && <input type="hidden" name="tab" value={f.tab} />}
        <label className="col-span-2 flex min-h-11 items-center gap-2 rounded-md border border-line-strong bg-surface-raised px-3 sm:min-w-56 sm:flex-1">
          <Search size={18} className="shrink-0 text-ink-muted" aria-hidden="true" />
          <span className="sr-only">Search by name</span>
          <input name="q" defaultValue={f.q} placeholder="Search by name" enterKeyHint="search" className="h-11 min-w-0 flex-1 bg-transparent text-[16px] outline-none" />
        </label>
        <label className="sr-only" htmlFor="f-drop">
          Drop
        </label>
        <select id="f-drop" name="drop" defaultValue={f.dropId ?? ""} className="input col-span-2 sm:w-auto">
          <option value="">All drops</option>
          {published.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="f-source">
          Source
        </label>
        <select id="f-source" name="source" defaultValue={f.source ?? ""} className="input sm:w-auto">
          <option value="">Any source</option>
          {sources.map((s) => (
            <option key={s} value={s}>
              {SOURCE_LABEL[s]}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="f-tier">
          Tier
        </label>
        <select id="f-tier" name="tier" defaultValue={f.tier ?? ""} className="input sm:w-auto">
          <option value="">Any tier</option>
          {TIER_OPTIONS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <noscript>
          <button type="submit" className="btn btn-secondary">
            Apply
          </button>
        </noscript>
      </AutoSubmit>

      {rows.length === 0 ? (
        <div className="rounded-card border border-dashed border-line-strong bg-surface-raised p-6">
          <p className="text-body-lg text-ink-muted">
            {all.length === 0 ? "No claims yet. Everyone who claims shows up here the moment they do, so share your drop link." : "No leads match these filters."}
          </p>
          {all.length > 0 && (
            <Link href="/app/leads" className="btn btn-secondary mt-4">
              Clear filters
            </Link>
          )}
        </div>
      ) : (
        <section aria-label={`${rows.length} leads`} className="overflow-hidden rounded-card border border-line bg-surface-raised">
          <p className="text-caption border-b border-line px-4 py-2.5 text-ink-muted">
            {rows.length} {rows.length === 1 ? "person" : "people"}
          </p>
          <ul className="divide-y divide-line">
            {rows.map((l) => {
              const drop = dropById.get(l.dropId);
              const wa = followUpLink(l, b.name, planNow);
              const plan = l.status === "claimed" ? visitPlanLabel(l.plannedVisitDate, l.plannedVisitPart, planNow) : null;
              return (
                <li key={l.id} className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.4fr)_minmax(0,1fr)_auto] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-body font-semibold">{l.name}</span>
                      {l.isNew && <span className="tag tag--new">New</span>}
                      {l.fromMarketplace && <span className="tag bg-brand-soft text-brand">From marketplace</span>}
                      {l.marketingOptIn && <span className="tag bg-surface-sunken text-ink-muted">Wants future drops</span>}
                      {l.phoneConfirmed === false && <span className="tag bg-surface-sunken text-ink-muted">Number not confirmed</span>}
                    </div>
                    <a href={`tel:${l.phone.replace(/\s/g, "")}`} className="text-body mt-0.5 inline-block font-mono tracking-[0.02em] text-ink">
                      {l.phone}
                    </a>
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <RarityBadge tier={l.tier} />
                    <span className="text-body min-w-0">{l.reward}</span>
                  </div>
                  <div className="text-caption grid gap-1 text-ink-muted">
                    {l.status === "redeemed" ? (
                      <span className="tag tag--redeemed justify-self-start">
                        <Check strokeWidth={2.4} />
                        Redeemed{l.spent ? ` · ${naira(l.spent)}` : ""}
                      </span>
                    ) : (
                      <span className="tag justify-self-start bg-surface-sunken text-ink-muted">Claimed</span>
                    )}
                    {plan && <span className="font-semibold text-ink">{plan}</span>}
                    <span>
                      {drop?.name ?? "Drop"} · {SOURCE_LABEL[l.source]} · {shortDate(l.claimedAt)}
                    </span>
                    {l.lastFollowupAt && <span className="text-success">Messaged {timeAgo(l.lastFollowupAt, now)}</span>}
                  </div>
                  {wa && <FollowUpButton href={wa} leadId={l.id} name={l.name} />}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <p className="text-caption flex items-start gap-2 text-ink-muted">
        <ShieldCheck size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
        Only you see these numbers. Staff accounts can&apos;t open leads.
      </p>
    </>
  );
}

export default function Page(props: PageProps<"/app/leads">) {
  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 px-4 pb-10 pt-6 sm:px-6 lg:px-8 lg:pt-8">
      <Suspense fallback={<div className="h-96 rounded-card bg-surface-sunken" />}>
        <Leads searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}
