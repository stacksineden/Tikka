import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { adminGrantDropAction, adminSaveTierAction, adminSavePackAction, adminSetFoundingAction } from "@/app/app/actions";
import { Logo } from "@/components/site/Logo";
import { adminBusinesses, adminGuaranteeDrops, getAllDropPacks, adminPayments, getDropTiers } from "@/lib/data";
import { count, naira, place, shortDate } from "@/lib/format";
import { koboToNaira } from "@/lib/pricing";

const money = (kobo: number) => naira(koboToNaira(kobo));
import { getSessionUser } from "@/lib/session";

export const metadata: Metadata = { title: "Admin" };

const field = "min-h-11 w-full rounded-md border border-line-strong/50 bg-surface-raised px-3 text-body";

async function Admin() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?next=/admin");
  // is_admin only (TECH_PLAN §16). Everyone else gets a plain 404.
  if (!user.isAdmin) notFound();
  const [rows, payments, tiers, earned, packs] = await Promise.all([adminBusinesses(), adminPayments(), getDropTiers(), adminGuaranteeDrops(), getAllDropPacks()]);
  const paid = payments.filter((p) => p.status === "paid");
  const revenue = paid.reduce((x, p) => x + p.amountKobo, 0);
  const byKind = (k: string) => paid.filter((p) => p.kind === k).reduce((x, p) => x + p.amountKobo, 0);
  const paidTiers = tiers.filter((t) => t.priceKobo > 0);
  const name = (ownerId: string) => rows.find((r) => r.ownerId === ownerId)?.business.name ?? ownerId;

  return (
    <div className="grid gap-6">
      <section aria-labelledby="rev-h" className="grid gap-3">
        <h2 id="rev-h" className="text-title text-[17px]">
          Revenue
        </h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Total paid", money(revenue)],
            ["Single drops", money(byKind("drop"))],
            ["Upgrades", money(byKind("upgrade"))],
            ["Season packs", money(byKind("pack"))],
          ].map(([k, v]) => (
            <div key={k} className="rounded-card border border-line bg-surface-raised p-3">
              <dt className="text-caption text-ink-muted">{k}</dt>
              <dd className="text-title tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="text-caption text-ink-muted">
          {count(earned.length)} free drop{earned.length === 1 ? "" : "s"} given through the guarantee
          {earned.length ? `: ${earned.map((e) => `${name(e.ownerId)} (${e.tierId}, ${shortDate(e.createdAt)})`).join(", ")}` : ""}.
        </p>
      </section>

      <section aria-labelledby="biz-h" className="grid gap-3">
        <h2 id="biz-h" className="text-title text-[17px]">
          Businesses
        </h2>
        <ul className="grid gap-3">
          {rows.map(({ ownerId, business: b, dropsReady, paidKobo }) => (
            <li key={ownerId} className="grid gap-3 rounded-card border border-line bg-surface-raised p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-body font-semibold">{b.name}</p>
                  <p className="text-caption text-ink-muted">
                    {place(b.area, b.city)} · {count(dropsReady)} drop{dropsReady === 1 ? "" : "s"} ready · paid {money(paidKobo)}
                    {b.guaranteeUsed ? " · guarantee used" : ""}
                  </p>
                </div>
                <form action={adminSetFoundingAction.bind(null, ownerId, !b.foundingMember)}>
                  <button type="submit" className={`btn min-h-11 px-3 text-label ${b.foundingMember ? "" : "btn-secondary"}`} aria-pressed={b.foundingMember}>
                    {b.foundingMember ? "Founding member" : "Make founding member"}
                  </button>
                </form>
              </div>
              <form action={adminGrantDropAction.bind(null, ownerId)} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
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
      </section>

      <section aria-labelledby="price-h" className="grid gap-3">
        <h2 id="price-h" className="text-title text-[17px]">
          Prices
        </h2>
        <p className="text-caption text-ink-muted">New prices apply to the next quote. Drops and payments already made keep their price.</p>
        <ul className="grid gap-3">
          {paidTiers.map((t) => (
            <li key={t.id} className="rounded-card border border-line bg-surface-raised p-4">
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
            <li key={p.id} className="rounded-card border border-line bg-surface-raised p-4">
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
      </section>

      <section aria-labelledby="pay-h" className="grid gap-3">
        <h2 id="pay-h" className="text-title text-[17px]">
          Payments
        </h2>
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
                  {{ drop: "Single drop", upgrade: "Upgrade", pack: "Season pack" }[p.kind]} · {p.toTier} · {p.status} · {shortDate(p.createdAt)} ·{" "}
                  <span className="font-mono">{p.reference}</span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function AdminPage() {
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
          <Admin />
        </Suspense>
      </main>
    </div>
  );
}
