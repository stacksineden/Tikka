import type { Metadata } from "next";
import { ChevronLeft, Search, Star } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import {
  adminDecideAction,
  adminGrantDropAction,
  adminPinDropAction,
  adminSaveTierAction,
  adminSavePackAction,
  adminSetBusinessAction,
  adminSetPaymentsAction,
  adminSetDropShownAction,
  adminEnquiryStatusAction,
  adminDomainStatusAction,
  adminSavePlusPriceAction,
  adminBioLinkAction,
} from "@/app/app/actions";
import { dbAdminActive } from "@/lib/pilot-db";
import { dbAdminPlus, dbPlusPrice } from "@/lib/plus-db";
import { PrivacyRequests } from "@/components/admin/PrivacyRequests";
import { SaveButton } from "@/components/admin/SaveButton";
import { ActionForm } from "@/components/admin/ActionForm";
import { Logo } from "@/components/site/Logo";
import { adminPrivacyLog, adminView, getAllDropPacks, getDropTiers } from "@/lib/data";
import { count, naira, place, shortDate } from "@/lib/format";
import { koboToNaira } from "@/lib/pricing";
import { getSessionUser } from "@/lib/session";
import { isDbId } from "@/lib/business-db";
import { dbAdminEarlyAccess, dbAdminEnquiries } from "@/lib/studio-db";
import { dbAdminCounterChecks, dbAdminLaunchWeek } from "@/lib/admin-db";
import { LaunchWeek } from "@/components/admin/LaunchWeek";
import { collectionLimitKobo, dbAdminMoney, dbAdminPaymentSettings, dbKycQueue } from "@/lib/payouts-db";
import { KycReview } from "@/components/admin/KycReview";
import { counterCheckTotals } from "@/lib/counter-checks";
import { STUDIO_CATEGORIES } from "@/lib/studio-shared";
import { LoadingGrid } from "@/components/ui/Loading";

export const metadata: Metadata = { title: "Admin" };

const money = (kobo: number) => naira(koboToNaira(kobo));
const field = "min-h-11 w-full rounded-md border border-line-strong/50 bg-surface-raised px-3 text-body";
const card = "rounded-card border border-line bg-surface-raised p-4";

function Section({ id, title, children, note }: { id: string; title: string; children: React.ReactNode; note?: string }) {
  return (
    <section aria-labelledby={id} className="grid gap-3">
      <h2 id={id} className="text-title text-[17px]">
        {title}
      </h2>
      {note && <p className="text-caption text-ink-muted">{note}</p>}
      {children}
    </section>
  );
}

async function Admin({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?next=/admin");
  // is_admin only (TECH_PLAN §16). Everyone else gets a plain 404; the database checks again.
  if (!user.isAdmin) notFound();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const real = isDbId(user.id);
  const [{ overview: o, businesses, payments, reports, drops }, tiers, packs, privacyLog, enquiries, early, checks, earlyPay, paySettings, cash, kycRows, launch] = await Promise.all([
    adminView(user, q),
    getDropTiers(),
    getAllDropPacks(),
    adminPrivacyLog(user),
    real ? dbAdminEnquiries() : Promise.resolve([]),
    real ? dbAdminEarlyAccess() : Promise.resolve({ count: 0, list: [] }),
    real ? dbAdminCounterChecks().catch(() => []) : Promise.resolve([]),
    real ? dbAdminEarlyAccess("payments") : Promise.resolve({ count: 0, list: [] }),
    real ? dbAdminPaymentSettings() : Promise.resolve({} as Awaited<ReturnType<typeof dbAdminPaymentSettings>>),
    real ? dbAdminMoney() : Promise.resolve(null),
    real ? dbKycQueue() : Promise.resolve([]),
    real ? dbAdminLaunchWeek() : Promise.resolve([]),
  ]);
  const [plus, plusPrice, activeRows] = real
    ? await Promise.all([dbAdminPlus(), dbPlusPrice().catch(() => null), dbAdminActive()])
    : [{ businesses: [], requests: [] }, null, []];
  const activeCount = activeRows.filter((x) => x.active).length;
  const plusNow = plus.businesses.filter((x) => x.active);
  const kycWaiting = kycRows.filter((r) => r.kyc?.status === "submitted").length;
  // The Paystack Starter limit (REVENUE_PLAN 5.6): everything collected, live, counts.
  const limit = collectionLimitKobo();
  const collected = cash ? cash.dropPaymentsKobo + cash.payLinksKobo + cash.depositsKobo : 0;
  const share = limit ? collected / limit : 0;
  const ct = counterCheckTotals(checks);
  const newEnquiries = enquiries.filter((e) => e.status === "new").length;
  // Flat pricing: one paid level on sale ("Drop"), and the packs that are on sale.
  const paidTiers = tiers.filter((t) => t.priceKobo > 0 && t.active !== false);
  const grantable = tiers.filter((t) => t.active !== false && t.id !== "free");
  const salePacks = packs.filter((p) => p.active);

  return (
    <div className="grid gap-8">
      {launch.length > 0 && (
        <Section id="launch-h" title="Launch week" note="Where each business is with the new version. Most to do first; Nudge opens your WhatsApp with a message for what's left.">
          <LaunchWeek rows={launch} />
        </Section>
      )}

      {real && (
        <Section
          id="active-h"
          title={`Active businesses · ${count(activeCount)} of 200`}
          note="Active = 3+ photos and a price, bookings on, their Tikka link in their bio (tick it after you've looked), and a real customer booking in the last 14 days."
        >
          {activeRows.length === 0 ? (
            <p className="text-body text-ink-muted">No businesses yet.</p>
          ) : (
            <ul className="grid gap-2">
              {activeRows.map((x) => (
                <li key={x.id} className={`${card} grid gap-2`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Link href={`/${x.slug}`} className="text-body font-semibold text-brand underline">
                      {x.name}
                    </Link>
                    <span className={`rounded-pill px-2.5 py-0.5 text-[12px] font-semibold ${x.active ? "bg-success-soft text-success" : "bg-surface-sunken text-ink-muted"}`}>
                      {x.active ? "Active" : "Not yet"}
                    </span>
                  </div>
                  <ul className="flex flex-wrap gap-1.5 text-[12px]">
                    {(
                      [
                        [x.page, "Photos and prices"],
                        [x.bookings, "Bookings on"],
                        [x.bio, "Link in bio"],
                        [x.booked, x.lastBooking ? `Last booking ${shortDate(x.lastBooking)}` : "No booking yet"],
                      ] as [boolean, string][]
                    ).map(([ok, label]) => (
                      <li key={label} className={`rounded-pill px-2.5 py-1 ${ok ? "bg-success-soft text-success" : "bg-gold-soft text-gold-text"}`}>
                        {ok ? "✓" : "✗"} {label}
                      </li>
                    ))}
                  </ul>
                  <form action={adminBioLinkAction.bind(null, x.id, !x.bio)}>
                    <SaveButton className="btn btn-secondary min-h-11 px-4 text-label">{x.bio ? "Untick link in bio" : "Link is in their bio"}</SaveButton>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      <Section id="num-h" title="Today">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Businesses", count(o.businesses)],
            ["Live drops", count(o.liveDrops)],
            ["Claims today", count(o.claimsToday)],
            ["Redeemed today", count(o.redemptionsToday)],
            ["WhatsApp sent (30 days)", count(o.waSent30d)],
            ["WhatsApp cost (30 days)", `US$${o.waCost30dUsd.toFixed(2)}`],
            ["Total paid", money(o.revenue.total)],
            ["Season packs", money(o.revenue.pack)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-card border border-line bg-surface-raised p-3">
              <dt className="text-caption text-ink-muted">{k}</dt>
              <dd className="text-title tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="text-caption text-ink-muted">
          Single drops {money(o.revenue.drop)} · upgrades {money(o.revenue.upgrade)} · {count(o.guaranteeVouchers.length)} free drop
          {o.guaranteeVouchers.length === 1 ? "" : "s"} given through the guarantee
          {o.guaranteeVouchers.length ? `: ${o.guaranteeVouchers.map((v) => `${v.businessName} (${v.tierId}, ${shortDate(v.createdAt)})`).join(", ")}` : ""}.
        </p>
      </Section>

      {checks.length > 0 && (
        <Section
          id="check-h"
          title="WhatsApp check at the counter"
          note="Tikkas claimed by typing a number, checked at the counter. Came but couldn't redeem: the number didn't match and the Tikka expired. Businesses don't see these numbers."
        >
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Came but couldn't redeem", count(ct.cameNotRedeemed)],
              ["Share of Tikkas that came in", ct.cheatRate === null ? "–" : `${Math.round(ct.cheatRate * 100)}%`],
              ["Failed, then passed", count(ct.failedThenPassed)],
              ["Passed first time", count(ct.passedFirst)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-card border border-line bg-surface-raised p-3">
                <dt className="text-caption text-ink-muted">{k}</dt>
                <dd className="text-title tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="text-caption text-ink-muted">
            Stopped as a second Tikka from the same WhatsApp {count(ct.usedByThisWhatsapp)} · still waiting after a failed check {count(ct.failedWaiting)} · never came to the
            counter {count(ct.neverCame)} · not checked yet {count(ct.notYet)}.
          </p>
          <ul className="grid gap-2">
            {checks.map((r) => (
              <li key={r.businessId} className={`${card} grid gap-1`}>
                <span className="text-body font-semibold">{r.businessName}</span>
                <span className="text-caption tabular-nums text-ink-muted">
                  Couldn&apos;t redeem {count(r.cameNotRedeemed)} · failed then passed {count(r.failedThenPassed)} · passed first time {count(r.passedFirst)} · waiting{" "}
                  {count(r.failedWaiting)} · never came {count(r.neverCame)} · second from same WhatsApp {count(r.usedByThisWhatsapp)}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {cash && (
        <Section
          id="money-h"
          title="Customer payments (pilot)"
          note="Everything Tikka's Paystack account has collected in live mode: owners' drop payments, pay links and booking deposits. Paystack pays businesses directly; Tikka keeps 1%."
        >
          {limit > 0 && (
            <div className={`${card} grid gap-2`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-body font-semibold">
                  {cash ? `${naira(collected / 100)} of ${naira(limit / 100)}` : ""} · Paystack Starter limit
                </p>
                <p className="font-mono text-[15px] tabular-nums">{Math.floor(share * 100)}%</p>
              </div>
              <div className="h-3 overflow-hidden rounded-pill bg-surface-sunken" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.floor(share * 100))} aria-label="Of the Starter limit">
                <div className={`h-full rounded-pill ${share >= 0.9 ? "bg-danger" : share >= 0.75 ? "bg-gold" : "bg-brand"}`} style={{ width: `${Math.min(100, Math.max(1, share * 100))}%` }} />
              </div>
              {share >= 0.75 && (
                <p className={`text-body rounded-md px-3 py-2 ${share >= 0.9 ? "bg-danger-soft text-danger" : "bg-gold-soft"}`}>
                  {share >= 0.9
                    ? "Almost at the limit: Paystack will switch payments off when it's reached. Upgrade to a Registered Business now (Compliance → Profile → Business type)."
                    : "Three quarters of the Starter limit is used. Start the upgrade to a Registered Business (it needs the CAC documents)."}
                </p>
              )}
              <p className="text-caption text-ink-muted">After upgrading, set PAYSTACK_COLLECTION_LIMIT_NAIRA=0 in Vercel and this bar goes away.</p>
            </div>
          )}
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Drop payments", naira(cash.dropPaymentsKobo / 100)],
              ["Pay links", naira(cash.payLinksKobo / 100)],
              ["Deposits", naira(cash.depositsKobo / 100)],
              ["Tikka's 1%", naira(cash.tikkaKobo / 100)],
            ].map(([label, value]) => (
              <div key={label} className={card}>
                <dt className="text-caption text-ink-muted">{label}</dt>
                <dd className="mt-1 font-mono text-[18px] font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          {cash.testKobo > 0 && <p className="text-caption text-ink-muted">Test-mode payments (not counted): {naira(cash.testKobo / 100)}</p>}
          {cash.businesses.length === 0 ? (
            <p className="text-body text-ink-muted">No business has payments on yet. Switch them on below, under Businesses.</p>
          ) : (
            <ul className="grid gap-2">
              {cash.businesses.map((b) => (
                <li key={b.id} className={`${card} grid gap-1`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-body font-semibold">
                      {b.name}
                      {!b.enabled && <span className="tag ml-2 bg-surface-sunken text-ink-muted">Payments off</span>}
                      {!b.verified && <span className="tag ml-2 bg-gold-soft">Not verified</span>}
                    </p>
                    <p className="text-[16px] font-bold tabular-nums">{naira(b.liveKobo / 100)}</p>
                  </div>
                  <p className="text-caption text-ink-muted">
                    {b.last4 ? `${b.bank} ••••${b.last4}${b.mode === "test" ? " (test mode: ask them to add it again)" : ""}` : "No bank account yet"} · up to {naira(b.maxKobo / 100)} a payment ·{" "}
                    {b.depositsOn ? "deposits on" : "deposits off"} · {count(b.linksPaid)} pay link{b.linksPaid === 1 ? "" : "s"} and {count(b.depositsPaid)} deposit
                    {b.depositsPaid === 1 ? "" : "s"} paid{b.lastPaidAt ? ` · last ${shortDate(b.lastPaidAt)}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      <Section id="mod-h" title={`Reported${reports.length ? ` · ${count(reports.length)}` : ""}`} note="Hide takes a drop off the marketplace (its link still works) or takes a review off the business's pages. Keep closes the report.">
        {reports.length === 0 ? (
          <p className="text-body text-ink-muted">Nothing reported.</p>
        ) : (
          <ul className="grid gap-3">
            {reports.map((r) => (
              <li key={`${r.targetType}-${r.targetId}`} className={`${card} grid gap-2`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="tag bg-surface-sunken text-ink-muted">{r.targetType === "drop" ? "Drop" : "Review"}</span>
                  <span className="text-body font-semibold">{r.businessName}</span>
                  {r.reports > 1 && <span className="text-caption text-ink-muted">{count(r.reports)} reports</span>}
                </div>
                {r.targetType === "drop" ? (
                  <Link href={`/d/${r.businessSlug}/${r.dropSlug}`} target="_blank" className="text-body text-brand underline">
                    {r.title}
                  </Link>
                ) : (
                  <div className="text-body">
                    <span className="inline-flex items-center gap-1 font-semibold">
                      {r.displayName} · {r.rating}
                      <Star size={14} className="fill-gold text-gold" aria-label="stars" />
                    </span>
                    {r.body && <p className="mt-1">&ldquo;{r.body}&rdquo;</p>}
                  </div>
                )}
                <p className="text-caption text-ink-muted">Why: {r.reasons.join(" · ")}</p>
                <div className="grid grid-cols-2 gap-2 sm:flex">
                  <form action={adminDecideAction.bind(null, r.targetType, r.targetId, true)}>
                    <SaveButton className="btn min-h-11 w-full px-4 text-label" done="Hidden">
                      Hide
                    </SaveButton>
                  </form>
                  <form action={adminDecideAction.bind(null, r.targetType, r.targetId, false)}>
                    <SaveButton className="btn btn-secondary min-h-11 w-full px-4 text-label" done="Kept">
                      Keep
                    </SaveButton>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="studio-h" title={`Studio enquiries${newEnquiries ? ` · ${count(newEnquiries)} new` : ""}`} note="From /studio/contact. Message them on WhatsApp, then move each one along.">
        {enquiries.length === 0 ? (
          <p className="text-body text-ink-muted">No enquiries yet.</p>
        ) : (
          <ul className="grid gap-3">
            {enquiries.map((e) => (
              <li key={e.id} className={`${card} grid gap-2`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-body font-semibold">
                    {e.name} · {e.businessName}
                  </p>
                  <span className="text-caption text-ink-muted">{shortDate(e.createdAt)}</span>
                </div>
                <p className="text-body">
                  <a href={`https://wa.me/${e.phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="font-mono text-brand underline">
                    {e.phone}
                  </a>
                </p>
                <p className="text-caption text-ink-muted">
                  Needs: {e.services.map((sv) => STUDIO_CATEGORIES.find((c) => c.id === sv)?.label ?? sv).join(", ") || "not said"}
                  {e.budgetRange ? ` · Budget ${e.budgetRange}` : ""}
                  {e.sourceCaseStudy ? ` · From the ${e.sourceCaseStudy} case study` : ""}
                  {e.tikkaBusiness ? ` · On Tikka as ${e.tikkaBusiness}` : ""}
                </p>
                {e.note && <p className="text-body rounded-md bg-surface-sunken p-3">{e.note}</p>}
                <form action={adminEnquiryStatusAction.bind(null, e.id)} className="flex flex-wrap items-center gap-2">
                  <label className="sr-only" htmlFor={`status-${e.id}`}>
                    Status
                  </label>
                  <select id={`status-${e.id}`} name="status" defaultValue={e.status} className={`${field} w-auto`}>
                    <option value="new">New</option>
                    <option value="contacted">Contacted</option>
                    <option value="converted">Converted</option>
                    <option value="closed">Closed</option>
                  </select>
                  <SaveButton className="btn btn-secondary min-h-11 px-4 text-label">Save</SaveButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        id="plus-h"
        title={`Tikka Plus · ${count(plusNow.length)} now`}
        note="Businesses with Plus (and anyone whose month ended in the last 30 days), and owners asking for their own web address. Message them on WhatsApp, then move each request along."
      >
        {plus.businesses.length === 0 ? (
          <p className="text-body text-ink-muted">No one has Plus yet.</p>
        ) : (
          <ul className="grid gap-2">
            {plus.businesses.map((x) => (
              <li key={x.id} className={`${card} flex flex-wrap items-baseline justify-between gap-2`}>
                <Link href={`/${x.slug}`} className="text-body font-semibold text-brand underline">
                  {x.name}
                </Link>
                <span className="text-caption text-ink-muted">
                  {x.active ? "Until" : "Ended"} {shortDate(x.until)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <h3 className="text-label mt-2">Own web address requests</h3>
        {plus.requests.length === 0 ? (
          <p className="text-body text-ink-muted">No requests yet.</p>
        ) : (
          <ul className="grid gap-3">
            {plus.requests.map((r) => (
              <li key={r.id} className={`${card} grid gap-2`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-body font-semibold">
                    {r.business} · <span className="font-mono">{r.domain || "no address yet"}</span>
                  </p>
                  <span className="text-caption text-ink-muted">{shortDate(r.at)}</span>
                </div>
                {r.note && <p className="text-body rounded-md bg-surface-sunken p-3">{r.note}</p>}
                <form action={adminDomainStatusAction.bind(null, r.id)} className="flex flex-wrap items-center gap-2">
                  <label className="sr-only" htmlFor={`domain-${r.id}`}>
                    Status
                  </label>
                  <select id={`domain-${r.id}`} name="status" defaultValue={r.status} className={`${field} w-auto`}>
                    <option value="new">New</option>
                    <option value="contacted">Contacted</option>
                    <option value="done">Done</option>
                    <option value="declined">Declined</option>
                  </select>
                  <SaveButton className="btn btn-secondary min-h-11 px-4 text-label">Save</SaveButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        id="pay-early-h"
        title={`Payments and deposits early access · ${count(earlyPay.count)}`}
        note="Payments aren't built yet; these businesses asked to hear first. Call them first when deposits are ready."
      >
        {earlyPay.list.length === 0 ? (
          <p className="text-body text-ink-muted">Nobody has signed up yet.</p>
        ) : (
          <ul className="grid gap-2">
            {earlyPay.list.map((r, i) => (
              <li key={i} className={`${card} flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1`}>
                <span className="text-body font-semibold">{r.businessName ?? r.contact}</span>
                <span className="text-caption text-ink-muted">
                  {r.businessSlug ? `usetikka.com/${r.businessSlug} · ` : ""}
                  {shortDate(r.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="spark-h" title={`Spark early access · ${count(early.count)}`} note="Spark isn't built yet; these people asked to hear first.">
        {early.list.length === 0 ? (
          <p className="text-body text-ink-muted">Nobody has signed up yet.</p>
        ) : (
          <details className="rounded-card border border-line bg-surface-raised p-4">
            <summary className="text-label min-h-11 cursor-pointer content-center">See the list</summary>
            <ul className="text-caption mt-2 grid gap-1 text-ink-muted">
              {early.list.map((r, i) => (
                <li key={i}>
                  {shortDate(r.createdAt)} · {r.businessName ? `${r.businessName} (business)` : r.contact}
                </li>
              ))}
            </ul>
          </details>
        )}
      </Section>

      <Section
        id="privacy-h"
        title="Privacy requests"
        note="When someone asks what Tikka holds about them, or asks to be deleted (our privacy policy promises both), find them by their WhatsApp number here."
      >
        <PrivacyRequests />
        {privacyLog.length > 0 && (
          <details className="rounded-card border border-line bg-surface-raised p-4">
            <summary className="text-label min-h-11 cursor-pointer content-center">Recent requests ({count(privacyLog.length)})</summary>
            <ul className="text-caption mt-2 grid gap-1 text-ink-muted">
              {privacyLog.map((r, i) => (
                <li key={i}>
                  {shortDate(r.createdAt)} · {r.kind === "deleted" ? "Deleted" : "Looked up"} {r.phoneHint}
                  {r.kind === "deleted" ? ` (${r.counts.claims ?? 0} Tikkas)` : ""}
                  {r.doneBy ? ` · by ${r.doneBy}` : ""}
                </li>
              ))}
            </ul>
          </details>
        )}
      </Section>

      <Section id="mkt-h" title="Marketplace" note="Drops open now or soon. Pinned drops lead the featured carousel; leave the headline empty to unpin.">
        {drops.length === 0 ? (
          <p className="text-body text-ink-muted">No drops open or coming up.</p>
        ) : (
          <ul className="grid gap-3">
            {drops.map((d) => (
              <li key={d.id} className={`${card} grid gap-3`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/d/${d.businessSlug}/${d.slug}`} target="_blank" className="text-body font-semibold text-ink underline">
                      {d.businessName} · {d.title}
                    </Link>
                    <p className="text-caption text-ink-muted">
                      {d.status === "live" ? `Live · ends ${shortDate(d.endsAt)}` : `Opens ${shortDate(d.startsAt)}`}
                      {d.shown ? "" : " · hidden from the marketplace"}
                      {d.pin ? " · pinned" : ""}
                    </p>
                  </div>
                  <form action={adminSetDropShownAction.bind(null, d.id, !d.shown)}>
                    <SaveButton className={`btn min-h-11 px-3 text-label ${d.shown ? "btn-secondary" : ""}`} done="Done">
                      {d.shown ? "Hide from marketplace" : "Show on marketplace"}
                    </SaveButton>
                  </form>
                </div>
                {d.shown && (
                  <form action={adminPinDropAction.bind(null, d.id)} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                    <label className="grid gap-1">
                      <span className="text-caption text-ink-muted">Featured headline</span>
                      <input name="headline" maxLength={60} defaultValue={d.pin?.headline ?? ""} placeholder="Port Harcourt's best suya" className={field} />
                    </label>
                    <label className="grid gap-1">
                      <span className="text-caption text-ink-muted">Line under it (optional)</span>
                      <input name="blurb" maxLength={140} defaultValue={d.pin?.blurb ?? ""} className={field} />
                    </label>
                    <SaveButton className="btn btn-secondary min-h-11 px-4 text-label">
                      {d.pin ? "Update pin" : "Pin"}
                    </SaveButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {real && (
        <Section
          id="kyc-h"
          title={`ID checks${kycWaiting ? ` · ${count(kycWaiting)} to review` : ""}`}
          note="Before payments go on: a clear, valid ID; the name matches the bank account (the owner's or the business's); the business is real (its page and socials); a registered number matches on the CAC search; it sells allowed, in-person services. Set the limit from its own prices."
        >
          <KycReview rows={kycRows} now={new Date()} />
        </Section>
      )}

      <Section id="biz-h" title="Businesses">
        <form className="flex gap-2" role="search">
          <label className="flex min-h-11 flex-1 items-center gap-2 rounded-md border border-line-strong/50 bg-surface-raised px-3">
            <Search size={18} className="shrink-0 text-ink-muted" aria-hidden="true" />
            <span className="sr-only">Search businesses</span>
            <input name="q" defaultValue={q} placeholder="Name, page address or city" enterKeyHint="search" className="h-11 min-w-0 flex-1 bg-transparent text-[16px] outline-none" />
          </label>
          <button type="submit" className="btn btn-secondary min-h-11 px-4 text-label">
            Search
          </button>
        </form>
        {businesses.length === 0 && <p className="text-body text-ink-muted">No businesses match.</p>}
        <ul className="grid gap-3">
          {businesses.map((b) => (
            <li key={b.id} className={`${card} grid gap-3`}>
              <div className="min-w-0">
                <p className="text-body font-semibold">
                  {b.name}
                  {b.suspended && <span className="tag ml-2 bg-danger-soft text-danger">Suspended</span>}
                  {b.isDemo && <span className="tag ml-2 bg-surface-sunken text-ink-muted">Demo</span>}
                </p>
                <p className="text-caption text-ink-muted">
                  {place(b.area, b.city)} · {b.category} · {count(b.drops)} drop{b.drops === 1 ? "" : "s"} · {count(b.dropsReady)} free drop
                  {b.dropsReady === 1 ? "" : "s"} ready · paid {money(b.paidKobo)}
                  {b.guaranteeUsed ? " · guarantee used" : ""}
                </p>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
                <form action={adminSetBusinessAction.bind(null, b.id, { verified: !b.verified })}>
                  <SaveButton className={`btn min-h-11 w-full px-3 text-label ${b.verified ? "" : "btn-secondary"}`} pressed={b.verified}>
                    {b.verified ? "Verified" : "Give Verified badge"}
                  </SaveButton>
                </form>
                <form action={adminSetBusinessAction.bind(null, b.id, { foundingMember: !b.foundingMember })}>
                  <SaveButton className={`btn min-h-11 w-full px-3 text-label ${b.foundingMember ? "" : "btn-secondary"}`} pressed={b.foundingMember}>
                    {b.foundingMember ? "Founding member" : "Make founding member"}
                  </SaveButton>
                </form>
                {!b.isDemo && (
                  <form action={adminSetBusinessAction.bind(null, b.id, { suspended: !b.suspended })}>
                    <SaveButton className="btn btn-secondary min-h-11 w-full px-3 text-label text-danger" pressed={b.suspended}>
                      {b.suspended ? "Lift suspension" : "Suspend"}
                    </SaveButton>
                  </form>
                )}
              </div>
              {/* Payments (REVENUE_PLAN 5.7): the pilot switch, the maximum per payment, and the account. */}
              {isDbId(b.id) && !b.isDemo && (
                <form action={adminSetPaymentsAction.bind(null, b.id)} className="grid gap-2 rounded-md bg-surface-sunken p-3 sm:grid-cols-[auto_1fr_auto] sm:items-end">
                  <label className="flex min-h-11 items-center gap-2">
                    <input type="checkbox" name="enabled" defaultChecked={paySettings[b.id]?.enabled ?? false} className="size-5" />
                    <span className="text-label">Payments on</span>
                  </label>
                  <label className="grid gap-1">
                    <span className="text-caption text-ink-muted">Most per payment (₦)</span>
                    <input name="max" inputMode="numeric" defaultValue={String((paySettings[b.id]?.maxKobo ?? 2_000_000) / 100)} className={field} />
                  </label>
                  <SaveButton className="btn btn-secondary min-h-11 px-4 text-label">
                    Save
                  </SaveButton>
                  <p className="text-caption text-ink-muted sm:col-span-3">
                    {paySettings[b.id]?.last4
                      ? `Paid to ${paySettings[b.id]!.accountName} · ${paySettings[b.id]!.bankName} ••••${paySettings[b.id]!.last4}${paySettings[b.id]!.mode === "test" ? " (added in test mode)" : ""}`
                      : "No bank account added yet."}
                    {!b.verified ? " Needs the Verified badge first." : ""} Payments also need an approved ID (ID checks, above).
                  </p>
                </form>
              )}
              <form action={adminGrantDropAction.bind(null, b.id)} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <label className="grid gap-1">
                  <span className="text-caption text-ink-muted">Give a free drop</span>
                  <select name="tier" className={field} defaultValue={grantable[0]?.id}>
                    {grantable.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1">
                  <span className="text-caption text-ink-muted">Use by (optional)</span>
                  <input type="date" name="expiresOn" className={field} />
                </label>
                <SaveButton className="btn btn-secondary min-h-11 px-4 text-label">
                  Give drop
                </SaveButton>
              </form>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="price-h" title="Prices" note="New prices apply to the next quote. Drops and payments already made keep their price.">
        <ul className="grid gap-3">
          {paidTiers.map((t) => (
            <li key={t.id} className={card}>
              <ActionForm action={adminSaveTierAction.bind(null, t.id)} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
                <p className="text-body font-semibold sm:col-span-4">
                  {t.label} <span className="font-normal text-ink-muted">· any size up to {count(t.maxCards)} Tikkas</span>
                </p>
                <label className="grid gap-1">
                  <span className="text-caption text-ink-muted">Price (₦)</span>
                  <input name="price" inputMode="numeric" defaultValue={koboToNaira(t.priceKobo)} className={field} />
                </label>
                <label className="grid gap-1">
                  <span className="text-caption text-ink-muted">Founding price (₦)</span>
                  <input name="founding" inputMode="numeric" defaultValue={koboToNaira(t.foundingPriceKobo)} className={field} />
                </label>
                <label className="grid gap-1">
                  <span className="text-caption text-ink-muted">Guarantee: at least</span>
                  <input name="guaranteeMin" inputMode="numeric" defaultValue={t.guaranteeMinRedemptions ?? ""} className={field} />
                </label>
              </ActionForm>
            </li>
          ))}
          {plusPrice !== null && (
            <li className={card}>
              <ActionForm action={adminSavePlusPriceAction} className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                <p className="text-body font-semibold sm:col-span-2">Tikka Plus · a month (30 days)</p>
                <label className="grid gap-1">
                  <span className="text-caption text-ink-muted">Price (₦)</span>
                  <input name="price" inputMode="numeric" defaultValue={koboToNaira(plusPrice)} className={field} />
                </label>
              </ActionForm>
            </li>
          )}
          {salePacks.map((p) => (
            <li key={p.id} className={card}>
              <ActionForm action={adminSavePackAction.bind(null, p.id)} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
                <p className="text-body font-semibold sm:col-span-4">Season pack · {count(p.drops)} drops</p>
                <label className="grid gap-1">
                  <span className="text-caption text-ink-muted">Price (₦)</span>
                  <input name="price" inputMode="numeric" defaultValue={koboToNaira(p.priceKobo)} className={field} />
                </label>
                <label className="grid gap-1">
                  <span className="text-caption text-ink-muted">Founding price (₦)</span>
                  <input name="founding" inputMode="numeric" defaultValue={p.foundingPriceKobo ? koboToNaira(p.foundingPriceKobo) : ""} className={field} />
                </label>
                <label className="flex min-h-11 items-center gap-2">
                  <input type="checkbox" name="active" defaultChecked={p.active} className="size-5" />
                  <span className="text-label">On sale</span>
                </label>
              </ActionForm>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="pay-h" title="Payments">
        {payments.length === 0 ? (
          <p className="text-body text-ink-muted">No payments yet.</p>
        ) : (
          <ul className="divide-y divide-line rounded-card border border-line bg-surface-raised">
            {payments.map((p) => (
              <li key={p.id} className="grid gap-1 px-4 py-3">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="text-body font-semibold">{p.businessName}</span>
                  <span className="text-body font-semibold tabular-nums">{money(p.amountKobo)}</span>
                </div>
                <p className="text-caption text-ink-muted">
                  {{ drop: "Single drop", upgrade: "Upgrade", pack: "Season pack", plus: "Tikka Plus" }[p.kind]}
                  {p.toTier ? ` · ${p.toTier}` : ""} · {p.status} · {shortDate(p.createdAt)} · <span className="font-mono">{p.reference}</span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

export default function AdminPage(props: PageProps<"/admin">) {
  return (
    <div className="min-h-dvh bg-surface">
      <header className="border-b border-line bg-surface-raised">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link href="/app" aria-label="Back to the dashboard" className="grid size-11 place-items-center rounded-md text-ink">
            <ChevronLeft size={20} aria-hidden="true" />
          </Link>
          <Logo />
          <span className="text-label rounded-pill bg-surface-sunken px-2.5 py-1 text-ink-muted">Admin</span>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <Suspense fallback={<LoadingGrid />}>
          <Admin searchParams={props.searchParams} />
        </Suspense>
      </main>
    </div>
  );
}
