import type { Metadata } from "next";
import { CheckCircle2, Gift, Package } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { BuyPack } from "@/components/settings/BuyPack";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { getBusiness, getDropPacks, getDrops, getDropTiers, getPayments, getVouchers } from "@/lib/data";
import { clockTime, count, shortDate } from "@/lib/format";
import type { Payment } from "@/lib/payments";
import { fromPrice, packLine, priceFor, priceLabel, type DropTier } from "@/lib/pricing";
import { getSessionUser } from "@/lib/session";
import { PACK_MONTHS, voucherLines } from "@/lib/vouchers";

export const metadata: Metadata = { title: "Payments" };

const STATUS: Record<string, { label: string; cls: string }> = {
  paid: { label: "Paid", cls: "bg-success-soft text-success" },
  pending: { label: "Waiting for payment", cls: "bg-gold-soft text-gold-text" },
  failed: { label: "Failed", cls: "bg-danger-soft text-danger" },
  abandoned: { label: "Not completed", cls: "bg-surface-sunken text-ink-muted" },
};

function what(p: Payment, tiers: DropTier[], dropName: Map<string, string>): { title: string; detail: string } {
  const tier = tiers.find((t) => t.id === p.toTier);
  const size = tier ? `${tier.label}, up to ${count(tier.maxCards)}` : (p.toTier ?? "");
  if (p.kind === "pack") return { title: "Season pack", detail: size };
  const title = (p.dropId && dropName.get(p.dropId)) || "Drop";
  return { title, detail: p.kind === "upgrade" ? `+${count(p.extraCards ?? 0)} Tikkas · upgrade to ${size}` : size };
}

async function Payments({ searchParams }: { searchParams: PageProps<"/app/settings/payments">["searchParams"] }) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  if (user.role !== "owner") redirect("/app/redeem");
  const [business, payments, drops, tiers, packs, vouchers, sp] = await Promise.all([
    getBusiness(user),
    getPayments(user),
    getDrops(user),
    getDropTiers(),
    getDropPacks(),
    getVouchers(user),
    searchParams,
  ]);
  if (!business) redirect("/app/setup");
  const now = new Date();
  const ready = voucherLines(vouchers, tiers, now);
  const dropName = new Map(drops.map((d) => [d.id, d.name]));
  const paid = tiers.filter((t) => t.priceKobo > 0);

  return (
    <div className="grid gap-4">
      {sp.pack === "1" && (
        <p role="status" className="text-body flex items-center gap-2 rounded-card bg-success-soft p-4 text-success">
          <CheckCircle2 size={20} aria-hidden="true" />
          Season pack paid. Your drops are ready to publish.
        </p>
      )}

      <section className="flex items-start gap-3 rounded-card border border-line bg-surface-raised p-4 sm:p-6" aria-labelledby="ready-h">
        <span className="grid size-10 shrink-0 place-items-center rounded-md bg-brand-soft text-brand">
          <Gift size={20} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 id="ready-h" className="text-title text-[17px] leading-6">
            Drops you can publish without paying
          </h2>
          {ready.length ? (
            <ul className="text-body mt-1 grid gap-1">
              {ready.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          ) : (
            <p className="text-body mt-1 text-ink-muted">None right now. Each drop is paid when you publish, from {fromPrice(tiers)}, by card or transfer.</p>
          )}
          <p className="text-caption mt-2 text-ink-muted">Your business page is always free.</p>
        </div>
      </section>

      <section className="rounded-card border border-line bg-surface-raised p-4 sm:p-6" aria-labelledby="price-h">
        <h2 id="price-h" className="text-title text-[17px] leading-6">
          Single drops
        </h2>
        {business.foundingMember && <p className="text-caption mt-1 text-ink-muted">Founding member prices, for life.</p>}
        <ul className="mt-3 divide-y divide-line">
          {paid.map((t) => (
            <li key={t.id} className="flex items-baseline justify-between gap-3 py-2.5">
              <span className="text-body">
                {t.label} <span className="text-ink-muted">· up to {count(t.maxCards)} Tikkas</span>
              </span>
              <span className="text-title text-[17px] tabular-nums">{priceLabel(priceFor(t, business.foundingMember))}</span>
            </li>
          ))}
        </ul>
        <p className="text-caption mt-2 text-ink-muted">
          Paid drops come with a promise: if one brings fewer customers than its size promises, your next drop of that size is free (once).
        </p>
      </section>

      {packs.length > 0 && (
        <section className="grid gap-3" aria-labelledby="packs-h">
          <div className="px-1">
            <h2 id="packs-h" className="text-title text-[17px] leading-6">
              Season packs
            </h2>
            <p className="text-body text-ink-muted">Pay once for a few drops and save. Use them within {PACK_MONTHS} months.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {packs.map((p) => {
              const tier = tiers.find((t) => t.id === p.tierId);
              if (!tier) return null;
              const line = packLine(p, tier);
              return (
                <article key={p.id} className="grid gap-3 rounded-card border border-line bg-surface-raised p-4">
                  <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-md bg-surface-sunken text-ink">
                      <Package size={20} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-title text-[17px] leading-6">{line.title}</h3>
                      <p className="text-caption text-ink-muted">Up to {count(tier.maxCards)} Tikkas each</p>
                    </div>
                    <span className="text-title ml-auto text-[17px] tabular-nums">{line.price}</span>
                  </div>
                  {line.saving && <p className="text-label text-success">{line.saving}</p>}
                  <BuyPack packId={p.id} label={`Buy for ${line.price}`} />
                </article>
              );
            })}
          </div>
        </section>
      )}

      <section className="rounded-card border border-line bg-surface-raised" aria-labelledby="history-h">
        <h2 id="history-h" className="text-title px-4 pt-4 text-[17px] leading-6 sm:px-6">
          Payment history
        </h2>
        {payments.length === 0 ? (
          <p className="text-body px-4 pb-5 pt-2 text-ink-muted sm:px-6">No payments yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line border-t border-line">
            {payments.map((p) => {
              const s = STATUS[p.status];
              const w = what(p, tiers, dropName);
              return (
                <li key={p.id} className="grid gap-1 px-4 py-3 sm:px-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-body font-semibold">{w.title}</span>
                    <span className="text-title text-[17px] tabular-nums">{priceLabel(p.amountKobo)}</span>
                  </div>
                  <div className="text-caption flex flex-wrap items-center gap-x-2 gap-y-1 text-ink-muted">
                    <span className={`rounded-pill px-2 py-0.5 font-semibold ${s.cls}`}>{s.label}</span>
                    <span>{w.detail}</span>
                    <span>
                      {shortDate(p.paidAt ?? p.createdAt)}, {clockTime(p.paidAt ?? p.createdAt)}
                    </span>
                    <span className="font-mono">{p.reference}</span>
                  </div>
                  {p.status === "pending" && (
                    <Link href={`/app/pay?payment=${p.id}`} className="text-label inline-flex min-h-11 items-center justify-self-start text-brand">
                      Finish paying
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function PaymentsPage(props: PageProps<"/app/settings/payments">) {
  return (
    <SettingsPage title="Payments" intro="Drops ready to publish, season packs, and everything you've paid.">
      <Suspense fallback={<div className="h-48 rounded-card bg-surface-sunken" />}>
        <Payments searchParams={props.searchParams} />
      </Suspense>
    </SettingsPage>
  );
}
