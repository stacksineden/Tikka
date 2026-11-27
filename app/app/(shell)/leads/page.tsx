import type { Metadata } from "next";
import { Check, ChevronRight, Download, Layers, Search, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AutoSubmit, FollowUpButton, LiveRefresh } from "@/components/leads/LeadBits";
import { RarityBadge } from "@/components/tikka/RarityBadge";
import { ComingIn } from "@/components/leads/ComingIn";
import { MessageToday } from "@/components/leads/MessageToday";
import { MoreTime } from "@/components/leads/MoreTime";
import { SpentEdit } from "@/components/leads/SpentEdit";
import { BookHerIn } from "@/components/leads/BookHerIn";
import { SendPayLink } from "@/components/payments/SendPayLink";
import { paystackMode } from "@/lib/paystack";
import { dbPayoutState, payReady } from "@/lib/payouts-db";
import { ActionIcon } from "@/components/tikka/ActionIcon";
import { whatsappLink } from "@/lib/booking";
import { whenLabel, type BookingRules } from "@/lib/bookings";
import { ClientList } from "@/components/clients/ClientList";
import { getClients } from "@/lib/clients-data";
import { getBookingLeads, getBookings, getBookingSetup, serviceLengths, type BookingLead } from "@/lib/bookings-data";
import { isDbId } from "@/lib/data";
import { getBusiness, getDrops, getFollowups, getLeads, getReviewAsks, leadsNow } from "@/lib/data";
import { comingIn, visitPlanLabel } from "@/lib/followups";
import { naira, shortDate, timeAgo } from "@/lib/format";
import { filterLeads, followUpLink, reviewAskLink, LEAD_TABS, parseLeadFilters, SOURCE_LABEL, tabCounts, waLink, type LeadFilters } from "@/lib/leads";
import { moreTimeUntil } from "@/lib/more-time";
import { canSetSpent } from "@/lib/spent";
import { getOwnerUser } from "@/lib/session";
import { siteUrl } from "@/lib/supabase/env";
import type { Source, Tier } from "@/lib/types";
import { newExperience } from "@/lib/experience";

export const metadata: Metadata = { title: "Customers" };

const TIER_OPTIONS: [Tier, string][] = [
  ["legendary", "Legendary"],
  ["rare", "Rare"],
  ["thank_you", "Thank-you"],
];

type From = "all" | "drops" | "bookings";
const FROM: [From, string][] = [
  ["all", "All"],
  ["drops", "From drops"],
  ["bookings", "From bookings"],
];
const BOOKED_FROM: Record<string, string> = { page: "Booked on your page", owner: "Booked by you", tikka: "Booked with a Tikka" };

function href(f: LeadFilters, patch: Partial<LeadFilters>, from: From = "all"): string {
  const next = { ...f, ...patch };
  const p = new URLSearchParams();
  if (from !== "all") p.set("from", from);
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
  const [b, all, drops, today, sp, planNow, asks] = await Promise.all([getBusiness(user), getLeads(user), getDrops(user), getFollowups(user), searchParams, leadsNow(user), getReviewAsks(user)]);
  if (!b) redirect("/app/setup");
  // NEW DIRECTION: the client book for businesses from the new setup (demo only for now).
  if (newExperience(b) && sp.view !== "drops") {
    await connection();
    return (
      <>
        <div>
          <h1 className="text-heading">Customers</h1>
          <p className="text-body mt-1 text-ink-muted">Everyone who booked, bought or claimed a Tikka, one row each. Tap someone to see every visit.</p>
        </div>
        {drops.length > 0 && (
          // The drop leads tools (Message today, follow-ups, the CSV export, review asks), above the list so owners see them.
          <Link href="/app/leads?view=drops" className={`flex items-center gap-3 rounded-card border-2 px-4 py-3.5 ${today.length || asks.size ? "border-gold bg-gold-soft" : "border-line bg-surface-raised"}`}>
            <span className="grid size-10 shrink-0 place-items-center rounded-pill bg-ink text-surface">
              <Layers size={20} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <b className="block text-[17px]">Drop leads and follow-ups</b>
              <span className="text-caption text-ink-muted">
                {[today.length ? `${today.length} to message today` : "", asks.size ? `${asks.size} to ask for a review` : ""].filter(Boolean).join(" · ") ||
                  "Everyone who claimed a Tikka: follow-ups, review asks and the CSV export."}
              </span>
            </span>
            <ChevronRight size={20} className="shrink-0 text-ink-muted" aria-hidden="true" />
          </Link>
        )}
        <ClientList clients={await getClients(user)} now={new Date().toISOString()} />
      </>
    );
  }

  const f = parseLeadFilters(sp);
  const rows = filterLeads(all, f);
  const counts = tabCounts(all, { dropId: f.dropId, source: f.source, tier: f.tier, q: f.q });
  const published = drops.filter((d) => d.status !== "draft");
  const dropById = new Map(published.map((d) => [d.id, d]));
  const sources = [...new Set(all.map((l) => l.source))] as Source[];
  const live = published.some((d) => d.status === "live");
  const now = new Date();
  const exportHref = `/api/leads/export${f.dropId ? `?drop=${encodeURIComponent(f.dropId)}` : ""}`;

  // Bookings (docs/BOOKINGS.md journey 13): who booked, where they came from, and "Book her in".
  const from: From = sp.from === "drops" || sp.from === "bookings" ? sp.from : "all";
  const [booked, setup, payState] = await Promise.all([getBookingLeads(user), getBookingSetup(user), isDbId(b.id) ? dbPayoutState(b.id) : null]);
  // "Send a pay link" on a Tikka (REVENUE_PLAN 5.3): only once payments are ready for this business.
  const pay = payReady(payState, paystackMode());
  const byPhone = new Map(booked.map((x) => [x.phone, x]));
  const claimPhones = new Set(all.map((l) => l.phone));
  const bookingOnly = booked.filter((x) => !claimPhones.has(x.phone));
  const q = f.q?.toLowerCase();
  const bookingRows = (from === "bookings" ? booked : bookingOnly).filter((x) => !q || x.name.toLowerCase().includes(q));
  let bookIn: { rules: BookingRules; services: { id: string; name: string; minutes: number }[] } | null = null;
  if (setup?.setUp) {
    const upcoming = await getBookings(user, now, new Date(now.getTime() + (setup.aheadDays + 1) * 86_400_000));
    const lengths = serviceLengths(isDbId(b.id) ? b.id : user.id, b);
    bookIn = {
      rules: {
        capacity: setup.capacity,
        noticeMinutes: setup.noticeMinutes,
        aheadDays: setup.aheadDays,
        hours: b.hours ?? null,
        busy: upcoming.filter((x) => x.status !== "cancelled").map((x) => [x.startsAt, x.endsAt]),
        blocked: setup.blocks.map((k) => [k.startsAt, k.endsAt]),
      },
      services: b.services.filter((x) => x.id).map((x) => ({ id: x.id!, name: x.name, minutes: lengths[x.id!] ?? 60 })),
    };
  }

  return (
    <>
      {live && <LiveRefresh />}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-heading">Customers</h1>
          <p className="text-body mt-1 text-ink-muted">Everyone who booked with you or claimed a Tikka. They&apos;re yours to follow up.</p>
        </div>
        <a href={exportHref} className="btn btn-secondary" download>
          <Download />
          Export CSV{f.dropId ? "" : " (all drops)"}
        </a>
      </div>

      {today.length > 0 && <MessageToday items={today} />}
      <ComingIn days={comingIn(all, planNow)} />

      {booked.length > 0 && (
        <nav aria-label="Where they came from">
          <ul className="grid grid-cols-3 gap-1 rounded-md bg-surface-sunken p-1 sm:inline-grid">
            {FROM.map(([id, label]) => (
              <li key={id}>
                <Link
                  href={href({ ...f, tab: "all" }, {}, id)}
                  aria-current={from === id ? "page" : undefined}
                  className={`text-label flex min-h-11 items-center justify-center whitespace-nowrap rounded-md px-3 ${from === id ? "bg-surface-raised text-ink shadow-raised" : "text-ink-muted"}`}
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {from !== "bookings" && (
      <>
      <nav aria-label="Lead groups" className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
        <ul className="flex gap-1 rounded-md bg-surface-sunken p-1 sm:inline-flex">
          {LEAD_TABS.map((t) => (
            <li key={t.id}>
              <Link
                href={href(f, { tab: t.id }, from)}
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
        {from !== "all" && <input type="hidden" name="from" value={from} />}
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
              // Tikka can't send the thank-you to a typed-in number, so the owner asks for the review.
              const ask = asks.get(l.id);
              const wa = ask ? reviewAskLink(l, b.name, `${siteUrl()}/t/${ask}/review`) : followUpLink(l, b.name, planNow);
              const plan = l.status === "claimed" ? visitPlanLabel(l.plannedVisitDate, l.plannedVisitPart, planNow) : null;
              // "Give more time": owner only (this page), once, never past 30 days from the claim.
              const expired = l.status === "claimed" && !!l.expiresAt && new Date(l.expiresAt) <= planNow;
              const moreUntil = l.status === "claimed" && l.expiresAt ? moreTimeUntil({ claimedAt: l.claimedAt, expiresAt: l.expiresAt, extendedAt: l.extendedAt }, planNow) : null;
              const waTo = moreUntil || l.extendedAt ? (waLink(l.phone, "")?.split("?")[0] ?? null) : null;
              return (
                <li key={l.id} className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.4fr)_minmax(0,1fr)_auto] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-body font-semibold">{l.name}</span>
                      {l.isNew && <span className="tag tag--new">New</span>}
                      {l.fromMarketplace && <span className="tag bg-brand-soft text-brand">From marketplace</span>}
                      {l.marketingOptIn && <span className="tag bg-surface-sunken text-ink-muted">Wants future drops</span>}
                      {/* Typed-in numbers: Verified once they pass the WhatsApp check at the counter. */}
                      {l.phoneConfirmed === false &&
                        (l.counterChecked ? (
                          <span className="tag bg-success-soft text-success">Verified</span>
                        ) : (
                          <span className="tag bg-surface-sunken text-ink-muted">Unverified</span>
                        ))}
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
                    {byPhone.get(l.phone)?.next ? (
                      <span className="font-semibold text-ink">
                        Booked {whenLabel(byPhone.get(l.phone)!.next!.startsAt)} · {byPhone.get(l.phone)!.next!.service}
                      </span>
                    ) : (
                      plan && <span className="font-semibold text-ink">{plan}</span>
                    )}
                    {l.status === "claimed" && l.expiresAt && (
                      <span className={expired ? "font-semibold text-danger" : undefined}>
                        {expired ? "Expired" : "Use by"} {shortDate(l.expiresAt)}
                        {l.extendedAt ? " · given more time" : ""}
                      </span>
                    )}
                    <span>
                      {drop?.name ?? "Drop"} · {SOURCE_LABEL[l.source]} · {shortDate(l.claimedAt)}
                    </span>
                    {l.lastFollowupAt && <span className="text-success">Messaged {timeAgo(l.lastFollowupAt, now)}</span>}
                  </div>
                  {wa && <FollowUpButton href={wa} leadId={l.id} name={l.name} review={!!ask} />}
                  {l.status === "claimed" && (moreUntil || l.extendedAt) && (
                    <MoreTime key={`more-${l.id}`} claimId={l.id} name={l.name} businessName={b.name} until={moreUntil} waTo={waTo} />
                  )}
                  {/* "Book her in": the time they said on WhatsApp, connected to their Tikka. */}
                  {bookIn && l.status === "claimed" && !expired && !byPhone.get(l.phone)?.next && (
                    <BookHerIn claimId={l.id} name={l.name} phone={l.phone} businessName={b.name} services={bookIn.services} rules={bookIn.rules} />
                  )}
                  {pay.ready && l.status === "claimed" && !expired && (
                    <SendPayLink businessName={b.name} maxKobo={pay.maxKobo} claim={{ id: l.id, name: l.name, phone: l.phone, reward: l.reward }} variant="btn btn-secondary" />
                  )}
                  {/* Skipped "What did they spend?" at the counter, or typed it wrong: owner only (this page), 30 days. */}
                  {l.status === "redeemed" && canSetSpent(l.redeemedAt ?? l.claimedAt, planNow) && (
                    <SpentEdit key={`spent-${l.id}`} target={{ claimId: l.id }} name={l.name} spent={l.spent} />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      </>
      )}

      {from !== "drops" && (from === "bookings" || bookingRows.length > 0) && (
        <BookingLeads rows={bookingRows} title={from === "bookings" ? undefined : "Booked, no Tikka yet"} businessName={b.name} />
      )}

      <p className="text-caption flex items-start gap-2 text-ink-muted">
        <ShieldCheck size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
        Only you see these numbers. Staff accounts can&apos;t open leads.
      </p>
    </>
  );
}

/** People who booked (docs/BOOKINGS.md journey 13): one row each, where they came from, their next booking. */
function BookingLeads({ rows, title, businessName }: { rows: BookingLead[]; title?: string; businessName: string }) {
  return (
    <section aria-label={title ?? "People who booked"} className="overflow-hidden rounded-card border border-line bg-surface-raised">
      <p className="text-caption border-b border-line px-4 py-2.5 text-ink-muted">
        {title ? `${title} · ` : ""}
        {rows.length} {rows.length === 1 ? "person" : "people"}
      </p>
      {rows.length === 0 ? (
        <p className="text-body p-4 text-ink-muted">Nobody has booked yet. Share your page link so customers can book.</p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((x) => (
            <li key={x.leadId} className="grid gap-2 px-4 py-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.4fr)_auto] lg:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-body font-semibold">{x.name}</span>
                  {x.optIn && <span className="tag bg-surface-sunken text-ink-muted">Wants offers</span>}
                  {!x.phoneConfirmed && <span className="tag bg-surface-sunken text-ink-muted">Unverified</span>}
                </div>
                <a href={`tel:${x.phone}`} className="text-body mt-0.5 inline-block font-mono tracking-[0.02em] text-ink">
                  {x.phone}
                </a>
              </div>
              <div className="text-caption grid gap-1 text-ink-muted">
                {x.next ? (
                  <span className="font-semibold text-ink">
                    Booked {whenLabel(x.next.startsAt)} · {x.next.service}
                  </span>
                ) : (
                  <span>No booking coming up</span>
                )}
                <span>
                  {x.sources.map((s) => BOOKED_FROM[s] ?? s).join(" · ")}
                  {x.claims > 0 ? " · Claimed a Tikka" : ""}
                </span>
                <span>
                  {x.bookings ? `${x.bookings} ${x.bookings === 1 ? "booking" : "bookings"}` : "Booking cancelled"}
                  {x.came ? ` · came in ${x.came} ${x.came === 1 ? "time" : "times"}` : ""}
                </span>
              </div>
              <a className="btn btn-secondary min-h-11 justify-self-start" target="_blank" rel="noopener noreferrer" href={whatsappLink(x.phone, `Hi ${x.name}, this is ${businessName}. `)}>
                <ActionIcon kind="whatsapp" />
                WhatsApp
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
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
