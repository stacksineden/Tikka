import type { Metadata } from "next";
import { ChevronLeft, Landmark, Wallet } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { PaystackCheckout, TestCheckout } from "@/components/drops/TestCheckout";
import { getAllDropPacks, getDrop, getDropTiers, getPayment } from "@/lib/data";
import { count } from "@/lib/format";
import { paymentPlace } from "@/lib/payments";
import { paystackConfigured } from "@/lib/paystack";
import { PACK_MONTHS } from "@/lib/vouchers";
import { packLine, priceLabel, type DropTier } from "@/lib/pricing";
import { getSessionUser } from "@/lib/session";

export const metadata: Metadata = { title: "Pay" };

const tierName = (tiers: DropTier[], id?: string) => tiers.find((t) => t.id === id)?.label ?? id ?? "";

async function Pay({ searchParams }: { searchParams: PageProps<"/app/pay">["searchParams"] }) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  if (user.role !== "owner") redirect("/app/redeem");
  const sp = await searchParams;
  const payment = await getPayment(user, typeof sp.payment === "string" ? sp.payment : "");
  if (!payment) notFound();
  if (payment.status === "paid") redirect(paymentPlace(payment).done);
  const [tiers, found, packs] = await Promise.all([getDropTiers(), payment.dropId ? getDrop(user, payment.dropId) : null, getAllDropPacks()]);
  const pack = packs.find((p) => p.id === payment.packId);
  const tier = tiers.find((t) => t.id === payment.toTier);
  const amount = priceLabel(payment.amountKobo);
  const live = paystackConfigured();

  const head = {
    drop: ["Pay and publish", "Your drop stays a draft until the payment goes through."],
    upgrade: ["Pay and add Tikkas", "The extra Tikkas join your drop as soon as the payment goes through."],
    pack: ["Buy a season pack", `Your drops are ready to publish as soon as the payment goes through. Use them within ${PACK_MONTHS} months.`],
  }[payment.kind];

  const rows: [string, string][] =
    payment.kind === "pack"
      ? [["Season pack", `${pack && tier ? packLine(pack, tier).title : tierName(tiers, payment.toTier)}${tier ? ` · up to ${count(tier.maxCards)} Tikkas each` : ""}`]]
      : payment.kind === "upgrade"
        ? [
            ["Drop", found?.drop.name ?? ""],
            ["Adding", `${count(payment.extraCards ?? 0)} Tikkas · ${tierName(tiers, payment.fromTier)} → ${tierName(tiers, payment.toTier)}${tier ? ` (up to ${count(tier.maxCards)})` : ""}`],
          ]
        : [
            ["Drop", found?.drop.name ?? ""],
            ["Size", `${count(found?.drop.total ?? 0)} Tikkas · ${tierName(tiers, payment.toTier)}${tier ? ` (up to ${count(tier.maxCards)})` : ""}`],
          ];
  rows.push(["Reference", payment.reference]);

  return (
    <>
      <div>
        <h1 className="text-heading">{head[0]}</h1>
        <p className="text-body mt-1 text-ink-muted">{head[1]}</p>
      </div>

      <section className="rounded-card border border-line bg-surface-raised" aria-label="Order">
        <dl className="divide-y divide-line">
          {rows.map(([k, v]) => (
            <div key={k} className="flex flex-wrap justify-between gap-2 px-4 py-3 sm:px-6">
              <dt className="text-label text-ink-muted">{k}</dt>
              <dd className={`text-body ${k === "Reference" ? "font-mono text-[13px]" : ""}`}>{v}</dd>
            </div>
          ))}
          <div className="flex items-center justify-between gap-2 px-4 py-4 sm:px-6">
            <dt className="text-title text-[17px]">Total</dt>
            <dd className="text-heading tabular-nums">{amount}</dd>
          </div>
        </dl>
      </section>

      {payment.status === "pending" ? (
        <section className="grid gap-3 rounded-card border border-dashed border-line-strong bg-surface-raised p-4 sm:p-6">
          <p className="text-label flex flex-wrap items-center gap-x-4 gap-y-1 text-ink-muted">
            <span className="inline-flex items-center gap-1.5">
              <Wallet size={16} aria-hidden="true" /> Card
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Landmark size={16} aria-hidden="true" /> Bank transfer
            </span>
          </p>
          {live ? (
            <PaystackCheckout paymentId={payment.id} label={`Pay ${amount}`} />
          ) : (
            <>
              <p className="text-caption text-ink-muted">
                Demo: Paystack checkout opens here once the test keys are added. This button stands in for a successful payment.
              </p>
              <TestCheckout paymentId={payment.id} label={`Pay ${amount} (test)`} />
            </>
          )}
        </section>
      ) : (
        <p role="alert" className="text-body rounded-card bg-danger-soft p-4 text-danger">
          This payment {payment.status === "abandoned" ? "wasn't completed" : "didn't go through"}, so nothing was charged.{" "}
          {payment.kind === "drop" ? "The drop is still a draft: open it and publish again to start a new payment." : "Start again to make a new payment."}
        </p>
      )}
      {payment.kind !== "pack" && (
        <p className="text-caption text-ink-muted">Ending a drop early doesn&apos;t refund it. You can extend it up to 30 days from its start.</p>
      )}
    </>
  );
}

export default function PayPage(props: PageProps<"/app/pay">) {
  return (
    <div className="mx-auto grid max-w-xl gap-5 px-4 pb-10 pt-4 sm:px-6 lg:pt-8">
      <Link href="/app/drops" className="text-label -ml-2 inline-flex min-h-11 items-center gap-1 justify-self-start rounded-md px-2 text-brand">
        <ChevronLeft size={18} aria-hidden="true" />
        Back
      </Link>
      <Suspense fallback={<div className="h-80 rounded-card bg-surface-sunken" />}>
        <Pay searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}
