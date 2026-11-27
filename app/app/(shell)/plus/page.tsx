import type { Metadata } from "next";
import { Check, CircleCheck, Layers } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AskDomain, BuyPlus } from "@/components/plus/PlusActions";
import { LoadingGrid } from "@/components/ui/Loading";
import { isDbId } from "@/lib/data";
import { shortDate } from "@/lib/format";
import { PLUS_FEATURES, plusDaysLeft } from "@/lib/plus";
import { dbPlusState } from "@/lib/plus-db";
import { priceLabel } from "@/lib/pricing";
import { getOwnerUser } from "@/lib/session";

// Tikka Plus (supabase/migrations/20261224140000_tikka_plus.sql): what it adds, the price from the
// database, paying for a month (card or transfer, nothing charged again automatically), this
// month's drop, what happens if they stop, and asking for their own web address. Owners only.

export const metadata: Metadata = { title: "Tikka Plus" };

async function Plus({ searchParams }: { searchParams: PageProps<"/app/plus">["searchParams"] }) {
  await connection();
  const user = await getOwnerUser();
  if (!user) redirect("/app/redeem");
  const sp = await searchParams;
  const demo = !isDbId(user.id);
  const state = demo ? null : await dbPlusState();
  const price = state?.priceKobo ? priceLabel(state.priceKobo) : null;
  const on = !!state?.until;
  const left = plusDaysLeft(state?.until);

  return (
    <div className="mx-auto grid max-w-xl gap-5 px-4 pb-10 pt-4 sm:px-6 lg:pt-8">
      <div>
        <h1 className="text-heading">Tikka Plus</h1>
        <p className="text-body mt-1 text-ink-muted">Everything you have now stays free. Plus helps bring you more customers.</p>
      </div>

      {sp.paid === "1" && on && (
        <p role="status" className="text-body flex items-center gap-2 rounded-md bg-success-soft px-4 py-3 text-success">
          <CircleCheck size={20} aria-hidden="true" /> Plus is on until {shortDate(state!.until!)}.
        </p>
      )}

      <section className={`grid gap-4 rounded-card border-2 p-5 ${on ? "border-success bg-surface-raised" : "border-brand bg-brand-soft"}`}>
        <div className="flex items-baseline justify-between gap-3">
          <b className="text-title">{on ? "You have Plus" : "Tikka Plus"}</b>
          {price && (
            <span className="text-body">
              <b className="font-mono text-[20px]">{price}</b> <span className="text-ink-muted">a month</span>
            </span>
          )}
        </div>
        {on && (
          <p className="text-body -mt-2 text-ink-muted">
            Until {shortDate(state!.until!)} · {left} {left === 1 ? "day" : "days"} left
          </p>
        )}
        <ul className="grid gap-2.5">
          {PLUS_FEATURES.map((f) => (
            <li key={f} className="text-body flex items-start gap-2.5">
              <Check size={20} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
              {f}
            </li>
          ))}
        </ul>
        {demo ? (
          <p className="text-caption text-ink-muted">Tikka Plus isn&apos;t in the demo.</p>
        ) : price ? (
          <>
            <BuyPlus label={on ? `Add another month · ${price}` : `Get Plus · ${price}`} />
            <p className="text-caption -mt-2 text-ink-muted">
              Pay by card or bank transfer. It lasts 30 days{on ? " from when your current month ends" : ""}. Nothing is charged again unless you pay for another month.
            </p>
          </>
        ) : (
          <p className="text-caption text-ink-muted">Tikka Plus isn&apos;t on sale right now.</p>
        )}
      </section>

      {on && state?.dropLeft && (
        <Link href="/app/drops/new" className="flex items-center gap-3 rounded-card border border-line bg-surface-raised px-4 py-3.5">
          <Layers size={20} className="shrink-0 text-brand" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <b className="block">This month&apos;s drop is ready</b>
            <span className="text-caption text-ink-muted">Use it before {shortDate(state.until!)}. Make it now →</span>
          </span>
        </Link>
      )}

      <section className="grid gap-2 rounded-card border border-line bg-surface-raised p-5">
        <h2 className="text-title">If you stop</h2>
        <p className="text-body text-ink-muted">
          Nothing on your page breaks. Your photos, collections, page style, bookings and customers all stay. You leave the top of search, the monthly drop stops,
          &ldquo;Made with Tikka&rdquo; comes back, and you can&apos;t add photos past 20 until you remove some.
        </p>
      </section>

      <section id="domain" className="grid scroll-mt-20 gap-3 rounded-card border border-line bg-surface-raised p-5">
        <div>
          <h2 className="text-title">Your own web address</h2>
          <p className="text-body mt-1 text-ink-muted">Want yourbusiness.com instead of usetikka.com/yourname? We&apos;ll set it up for you. Your usetikka.com link keeps working too.</p>
        </div>
        {demo ? <p className="text-caption text-ink-muted">Not in the demo.</p> : <AskDomain sent={state?.domain ? { domain: state.domain.domain } : undefined} />}
      </section>
    </div>
  );
}

export default function PlusPage(props: PageProps<"/app/plus">) {
  return (
    <Suspense fallback={<LoadingGrid tiles={0} className="mx-auto max-w-xl px-4 py-6" />}>
      <Plus searchParams={props.searchParams} />
    </Suspense>
  );
}
