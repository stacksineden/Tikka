import type { Metadata } from "next";
import { Clock, ShieldCheck, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { GetPaidForm } from "@/components/payments/GetPaidForm";
import { KycForm } from "@/components/payments/KycForm";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { getBusiness, isDbId } from "@/lib/data";
import { naira } from "@/lib/format";
import { paystackConfigured, paystackMode } from "@/lib/paystack";
import { bankOpen, dbPayoutState } from "@/lib/payouts-db";
import { graceDay } from "@/lib/kyc";
import { getOwnerUser } from "@/lib/session";

export const metadata: Metadata = { title: "Get paid" };

// Settings → Get paid (REVENUE_PLAN 5.3): the owner's ID, then the bank account customers' payments
// go to. Owners only. Tikka's team reviews the ID and switches payments on
// (supabase/migrations/20261129100000_id_verification.sql).

const CLOSED: Record<string, string> = {
  demo: "The demo business can't take payments.",
  suspended: "Your business is suspended, so it can't take payments.",
  not_found: "Set up your business first.",
};

async function GetPaid() {
  const user = await getOwnerUser();
  if (!user) redirect("/app/redeem");
  const b = await getBusiness(user);
  if (!b) redirect("/app/setup");
  const state = isDbId(b.id) ? await dbPayoutState(b.id) : null;
  const problem = !state ? "demo" : !paystackConfigured() ? "not_enabled" : state.problem;
  // An account added with the other kind of Paystack key (test while trying it out, or live) can't
  // take payments here: ask for it again rather than show it as working.
  const payout = state?.payout && state.payout.mode === paystackMode() ? state.payout : null;
  const otherMode = !!state?.payout && !payout;

  const kyc = state?.kyc ?? null;
  const closed = problem && CLOSED[problem];
  const canBank = paystackConfigured() && bankOpen(state);
  const live = !problem;

  return (
    <div className="grid gap-4">
      <p className="text-body text-ink-muted">
        When customers pay you through Tikka (deposits when they book, and pay links), the money goes straight to your bank account the next working day. Tikka never holds it.
      </p>
      {closed ? (
        <section className="rounded-card border border-dashed border-line-strong bg-surface-raised p-4 sm:p-5">
          <p className="text-body">{closed}</p>
        </section>
      ) : (
        <>
          {/* 1. The ID check */}
          {kyc?.status === "submitted" ? (
            <section className="rounded-card border border-line bg-surface-raised p-4 sm:p-5">
              <p className="text-title flex items-center gap-2 text-[17px]">
                <Clock size={20} className="text-ink-muted" aria-hidden="true" />
                We&apos;re checking your details
              </p>
              <p className="text-body mt-1 text-ink-muted">
                Usually within 1 working day. We&apos;ll tell you on WhatsApp.{" "}
                {state?.graceUntil ? "Payments stay on meanwhile." : payout ? "" : "Add your bank account below meanwhile."}
              </p>
            </section>
          ) : kyc?.status === "approved" ? null : (
            <>
              {kyc?.status === "again" && (
                <p role="status" className="text-body rounded-md bg-gold-soft px-4 py-3">
                  <b>One thing to fix:</b> {kyc.note}
                </p>
              )}
              {!kyc && state?.graceUntil && (
                <p className="text-body rounded-md bg-gold-soft px-4 py-3">
                  <b>Verify your business to keep taking payments.</b> Add your ID by {graceDay(state.graceUntil)}. It takes about 3 minutes.
                </p>
              )}
              {!kyc && problem === "needs_id" && (
                <p role="alert" className="text-body flex items-start gap-2 rounded-md bg-danger-soft px-4 py-3 text-danger">
                  <TriangleAlert size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <span>
                    <b>Payments are paused.</b> Add your ID to switch deposits and pay links back on. Drops, bookings and redeeming still work, and customers can book and pay at your shop.
                  </span>
                </p>
              )}
              {!kyc && !state?.graceUntil && problem !== "needs_id" && (
                <p className="text-body text-ink-muted">Before payments go on, we check every business so customers can trust who they pay. First, your ID. It takes about 3 minutes.</p>
              )}
              <KycForm again={kyc?.status === "again"} />
            </>
          )}

          {/* 2. The bank account */}
          {canBank ? (
            <>
              {otherMode && (
                <p className="text-body rounded-md bg-gold-soft px-4 py-3">
                  Your bank account was added while Tikka was being tested, so it can&apos;t take real payments. Add it again below: it only takes a minute.
                </p>
              )}
              <GetPaidForm current={payout} />
            </>
          ) : kyc && !paystackConfigured() ? (
            <section className="rounded-card border border-dashed border-line-strong bg-surface-raised p-4 sm:p-5">
              <p className="text-body">We&apos;re getting payments ready. Message Tikka on WhatsApp and we&apos;ll help you add your bank account.</p>
            </section>
          ) : null}

          {live && (
            <section className="rounded-card border border-line bg-surface-raised p-4 sm:p-5">
              <h2 className="text-title text-[17px] leading-6">What it costs</h2>
              <ul className="text-body mt-2 grid gap-1.5">
                <li>Nothing to set up, nothing monthly.</li>
                <li>On each payment: Paystack&apos;s fee (1.5% + ₦100, no more than ₦2,000) and 1% to Tikka.</li>
                <li>Example: a ₦5,000 payment pays you ₦4,775.</li>
                <li>One payment can be up to {naira(state!.maxKobo / 100)}. Need more? Message Tikka.</li>
              </ul>
            </section>
          )}
        </>
      )}
      <p className="text-caption flex items-start gap-2 text-ink-muted">
        <ShieldCheck size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          Payments are processed by Paystack. Tikka keeps your bank, the last 4 digits and the account name, and your ID only for checking your business. Taking
          payments means you follow our{" "}
          <Link href="/acceptable-use" className="underline">
            acceptable use policy
          </Link>
          .
        </span>
      </p>
    </div>
  );
}

export default function Page() {
  return (
    <SettingsPage title="Get paid">
      <Suspense fallback={<div className="h-48 rounded-card bg-surface-sunken" />}>
        <GetPaid />
      </Suspense>
    </SettingsPage>
  );
}
