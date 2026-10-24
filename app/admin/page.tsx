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
  adminSetDropShownAction,
} from "@/app/app/actions";
import { Logo } from "@/components/site/Logo";
import { adminView, getAllDropPacks, getDropTiers } from "@/lib/data";
import { count, naira, place, shortDate } from "@/lib/format";
import { koboToNaira } from "@/lib/pricing";
import { getSessionUser } from "@/lib/session";

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
  const [{ overview: o, businesses, payments, reports, drops }, tiers, packs] = await Promise.all([adminView(user, q), getDropTiers(), getAllDropPacks()]);
  const paidTiers = tiers.filter((t) => t.priceKobo > 0);

  return (
    <div className="grid gap-8">
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
                    <button type="submit" className="btn min-h-11 w-full px-4 text-label">
                      Hide
                    </button>
                  </form>
                  <form action={adminDecideAction.bind(null, r.targetType, r.targetId, false)}>
                    <button type="submit" className="btn btn-secondary min-h-11 w-full px-4 text-label">
                      Keep
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
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
                    <button type="submit" className={`btn min-h-11 px-3 text-label ${d.shown ? "btn-secondary" : ""}`}>
                      {d.shown ? "Hide from marketplace" : "Show on marketplace"}
                    </button>
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
                    <button type="submit" className="btn btn-secondary min-h-11 px-4 text-label">
                      {d.pin ? "Update pin" : "Pin"}
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

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
                  <button type="submit" aria-pressed={b.verified} className={`btn min-h-11 w-full px-3 text-label ${b.verified ? "" : "btn-secondary"}`}>
                    {b.verified ? "Verified" : "Give Verified badge"}
                  </button>
                </form>
                <form action={adminSetBusinessAction.bind(null, b.id, { foundingMember: !b.foundingMember })}>
                  <button type="submit" aria-pressed={b.foundingMember} className={`btn min-h-11 w-full px-3 text-label ${b.foundingMember ? "" : "btn-secondary"}`}>
                    {b.foundingMember ? "Founding member" : "Make founding member"}
                  </button>
                </form>
                {!b.isDemo && (
                  <form action={adminSetBusinessAction.bind(null, b.id, { suspended: !b.suspended })}>
                    <button type="submit" aria-pressed={b.suspended} className="btn btn-secondary min-h-11 w-full px-3 text-label text-danger">
                      {b.suspended ? "Lift suspension" : "Suspend"}
                    </button>
                  </form>
                )}
              </div>
              <form action={adminGrantDropAction.bind(null, b.id)} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <label className="grid gap-1">
                  <span className="text-caption text-ink-muted">Give a free drop</span>
                  <select name="tier" className={field} defaultValue="small">
                    {tiers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label} (up to {count(t.maxCards)})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1">
                  <span className="text-caption text-ink-muted">Use by (optional)</span>
                  <input type="date" name="expiresOn" className={field} />
                </label>
                <button type="submit" className="btn btn-secondary min-h-11 px-4 text-label">
                  Give drop
                </button>
              </form>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="price-h" title="Prices" note="New prices apply to the next quote. Drops and payments already made keep their price.">
        <ul className="grid gap-3">
          {paidTiers.map((t) => (
            <li key={t.id} className={card}>
              <form action={adminSaveTierAction.bind(null, t.id)} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
                <p className="text-body font-semibold sm:col-span-4">
                  {t.label} <span className="font-normal text-ink-muted">· up to {count(t.maxCards)} Tikkas</span>
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
                <button type="submit" className="btn btn-secondary min-h-11 px-4 text-label">
                  Save
                </button>
              </form>
            </li>
          ))}
          {packs.map((p) => (
            <li key={p.id} className={card}>
              <form action={adminSavePackAction.bind(null, p.id)} className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                <p className="text-body font-semibold sm:col-span-3">
                  Season pack · {count(p.drops)} {tiers.find((t) => t.id === p.tierId)?.label ?? p.tierId}s
                </p>
                <label className="grid gap-1">
                  <span className="text-caption text-ink-muted">Price (₦)</span>
                  <input name="price" inputMode="numeric" defaultValue={koboToNaira(p.priceKobo)} className={field} />
                </label>
                <label className="flex min-h-11 items-center gap-2">
                  <input type="checkbox" name="active" defaultChecked={p.active} className="size-5" />
                  <span className="text-label">On sale</span>
                </label>
                <button type="submit" className="btn btn-secondary min-h-11 px-4 text-label">
                  Save
                </button>
              </form>
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
                  {{ drop: "Single drop", upgrade: "Upgrade", pack: "Season pack" }[p.kind]}
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
        <Suspense fallback={<div className="h-80 rounded-card bg-surface-sunken" />}>
          <Admin searchParams={props.searchParams} />
        </Suspense>
      </main>
    </div>
  );
}
