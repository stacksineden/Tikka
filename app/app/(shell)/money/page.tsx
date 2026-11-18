import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { PayLinkActions } from "@/components/payments/PayLinkActions";
import { SendPayLink } from "@/components/payments/SendPayLink";
import { getBusiness, isDbId } from "@/lib/data";
import { naira, shortDate, WAT } from "@/lib/format";
import { dbPayLinks } from "@/lib/paylinks-db";
import { dbDeposits } from "@/lib/bookings-db";
import { whenLabel } from "@/lib/bookings";
import { paystackMode } from "@/lib/paystack";
import { dbPayoutState, payReady } from "@/lib/payouts-db";
import { getOwnerUser } from "@/lib/session";
import { siteUrl } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "Money" };

// Money (REVENUE_PLAN 5.3): pay links and what came in. Owners only. Paystack pays the business the
// next working day; Tikka never holds the money.

const STATUS: Record<string, [string, string]> = {
  open: ["Waiting", "bg-surface-sunken text-ink-muted"],
  paid: ["Paid", "tag--redeemed"],
  cancelled: ["Cancelled", "bg-surface-sunken text-ink-muted"],
};

const month = (d: Date | string) => new Date(d).toLocaleDateString("en-GB", { timeZone: WAT, month: "2-digit", year: "numeric" });

async function Money() {
  const user = await getOwnerUser();
  if (!user) redirect("/app/redeem");
  const b = await getBusiness(user);
  if (!b) redirect("/app/setup");
  await connection();
  const state = isDbId(b.id) ? await dbPayoutState(b.id) : null;
  const ready = payReady(state, paystackMode());
  const [links, deposits] = isDbId(b.id) ? await Promise.all([dbPayLinks(b.id), dbDeposits(b.id)]) : [[], []];
  const now = new Date();
  const mode = paystackMode();
  // This month, in this Paystack mode: pay links and booking deposits.
  const paid = [
    ...links.filter((l) => l.status === "paid" && l.paidAt && month(l.paidAt) === month(now) && l.mode === mode).map((l) => ({ gross: l.paidKobo ?? 0, fees: (l.feeKobo ?? 0) + (l.tikkaKobo ?? 0) })),
    ...deposits.filter((d) => month(d.paidAt) === month(now) && d.mode === mode).map((d) => ({ gross: d.paidKobo, fees: d.feeKobo + d.tikkaKobo })),
  ];
  const gross = paid.reduce((a, l) => a + l.gross, 0);
  const fees = paid.reduce((a, l) => a + l.fees, 0);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-heading">Money</h1>
          <p className="text-body mt-1 text-ink-muted">Pay links, booking deposits and what came in. It goes to your bank the next working day.</p>
        </div>
        {ready.ready && <SendPayLink businessName={b.name} maxKobo={ready.maxKobo} />}
      </div>

      {!ready.ready && (
        <section className="rounded-card border border-dashed border-line-strong bg-surface-raised p-4 sm:p-5">
          <p className="text-body">
            {ready.why === "no_account"
              ? "Add the bank account payments go to, then you can send pay links."
              : ready.why === "account_again"
                ? "Add your bank account again: the one saved was added while Tikka was being tested."
                : "Getting paid online is in early access. We're switching it on for a few businesses first."}
          </p>
          {ready.why !== "closed" && (
            <Link href="/app/settings/get-paid" className="btn mt-3 min-h-11">
              Go to Get paid
            </Link>
          )}
        </section>
      )}

      <section className="grid grid-cols-3 gap-2" aria-label="This month">
        {[
          ["Came in this month", naira(gross / 100)],
          ["Fees", naira(fees / 100)],
          ["To your bank", naira((gross - fees) / 100)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-card border border-line bg-surface-raised p-3">
            <p className="text-caption text-ink-muted">{label}</p>
            <p className="mt-1 font-mono text-[18px] font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </section>

      <section className="overflow-hidden rounded-card border border-line bg-surface-raised" aria-label="Pay links">
        <p className="text-caption border-b border-line px-4 py-2.5 text-ink-muted">
          {links.length} pay {links.length === 1 ? "link" : "links"}
        </p>
        {links.length === 0 ? (
          <p className="text-body p-4 text-ink-muted">No pay links yet. Send one for a balance, a custom job or a Tikka&apos;s price, and the customer pays online.</p>
        ) : (
          <ul className="divide-y divide-line">
            {links.map((l) => {
              const [label, cls] = STATUS[l.status];
              const net = (l.paidKobo ?? 0) - (l.feeKobo ?? 0) - (l.tikkaKobo ?? 0);
              return (
                <li key={l.id} className="grid gap-2 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-body font-semibold">{l.note}</p>
                      <p className="text-caption text-ink-muted">
                        {l.customerName ? `${l.customerName} · ` : ""}
                        {l.claimId ? "With a Tikka · " : ""}
                        {l.status === "paid" && l.paidAt ? `Paid ${shortDate(l.paidAt)}` : `Sent ${shortDate(l.createdAt)}`}
                        {l.mode === "test" && paystackMode() === "live" ? " · test" : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-mono text-[16px] font-semibold tabular-nums">{naira(l.amountKobo / 100)}</p>
                      <span className={`tag ${cls}`}>{label}</span>
                    </div>
                  </div>
                  {l.status === "paid" && <p className="text-caption text-ink-muted">To your bank: {naira(net / 100)} (Paystack {naira((l.feeKobo ?? 0) / 100)}, Tikka {naira((l.tikkaKobo ?? 0) / 100)})</p>}
                  {l.status === "open" && <PayLinkActions id={l.id} url={`${siteUrl()}/pay/${l.token}`} />}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {deposits.length > 0 && (
        <section className="overflow-hidden rounded-card border border-line bg-surface-raised" aria-label="Booking deposits">
          <p className="text-caption border-b border-line px-4 py-2.5 text-ink-muted">
            {deposits.length} booking {deposits.length === 1 ? "deposit" : "deposits"}
          </p>
          <ul className="divide-y divide-line">
            {deposits.map((d) => (
              <li key={d.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-body font-semibold">
                    {d.firstName} · {d.service}
                  </p>
                  <p className="text-caption text-ink-muted">
                    For {whenLabel(d.startsAt)} · paid {shortDate(d.paidAt)}
                    {d.status === "cancelled" ? " · booking cancelled" : ""}
                    {d.mode === "test" && mode === "live" ? " · test" : ""}
                  </p>
                  <p className="text-caption text-ink-muted">To your bank: {naira((d.paidKobo - d.feeKobo - d.tikkaKobo) / 100)}</p>
                </div>
                <p className="shrink-0 font-mono text-[16px] font-semibold tabular-nums">{naira(d.paidKobo / 100)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-caption flex items-start gap-2 text-ink-muted">
        <ShieldCheck size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
        Payments go through Paystack straight to your bank. Tikka never holds your money and doesn&apos;t refund payments: if you agree a refund with a customer, send it from your bank.
      </p>
    </>
  );
}

export default function Page() {
  return (
    <div className="mx-auto grid max-w-3xl grid-cols-1 gap-4 px-4 pb-10 pt-6 sm:px-6 lg:px-8 lg:pt-8">
      <Suspense fallback={<div className="h-96 rounded-card bg-surface-sunken" />}>
        <Money />
      </Suspense>
    </div>
  );
}
