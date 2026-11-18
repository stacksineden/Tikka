import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { GetPaidForm } from "@/components/payments/GetPaidForm";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { getBusiness, isDbId } from "@/lib/data";
import { naira } from "@/lib/format";
import { paystackConfigured, paystackMode } from "@/lib/paystack";
import { dbPayoutState } from "@/lib/payouts-db";
import { getOwnerUser } from "@/lib/session";

export const metadata: Metadata = { title: "Get paid" };

// Settings → Get paid (REVENUE_PLAN 5.3): the bank account customers' payments go to. Owners
// only. In the pilot, Tikka switches it on per business (5.7).

const CLOSED: Record<string, string> = {
  demo: "The demo business can't take payments.",
  suspended: "Your business is suspended, so it can't take payments.",
  not_enabled: "Getting paid online is in early access. We're switching it on for a few businesses first, and we'll tell you when it's your turn.",
  not_verified: "Getting paid online needs the Verified badge on your business. Talk to Tikka to get verified.",
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

  return (
    <div className="grid gap-4">
      <p className="text-body text-ink-muted">
        When customers pay you through Tikka (pay links, and deposits soon), the money goes straight to this account the next working day. Tikka never holds it.
      </p>
      {problem ? (
        <section className="rounded-card border border-dashed border-line-strong bg-surface-raised p-4 sm:p-5">
          <p className="text-body">{CLOSED[problem] ?? CLOSED.not_enabled}</p>
        </section>
      ) : (
        <>
          {otherMode && (
            <p className="text-body rounded-md bg-gold-soft px-4 py-3">
              Your bank account was added while Tikka was being tested, so it can&apos;t take real payments. Add it again below: it only takes a minute.
            </p>
          )}
          <GetPaidForm current={payout} />
          <section className="rounded-card border border-line bg-surface-raised p-4 sm:p-5">
            <h2 className="text-title text-[17px] leading-6">What it costs</h2>
            <ul className="text-body mt-2 grid gap-1.5">
              <li>Nothing to set up, nothing monthly.</li>
              <li>On each payment: Paystack&apos;s fee (1.5% + ₦100, no more than ₦2,000) and 1% to Tikka.</li>
              <li>Example: a ₦5,000 payment pays you ₦4,775.</li>
              <li>For now, one payment can be up to {naira(state!.maxKobo / 100)}.</li>
            </ul>
          </section>
        </>
      )}
      <p className="text-caption flex items-start gap-2 text-ink-muted">
        <ShieldCheck size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
        Payments are processed by Paystack. Tikka keeps only your bank, the last 4 digits and the account name.
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
