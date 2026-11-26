import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { PayLinkSheet } from "@/components/payments/PayLinkSheet";
import { StayFresh } from "@/components/payments/StayFresh";
import { PayLinkList } from "@/components/today/PayLinkList";
import { getBusiness } from "@/lib/data";
import { ownerPayLinks, payLinkLimit, type OwnerPayLink } from "@/lib/paylinks-data";
import { PayLinksOff } from "@/components/payments/PayLinksOff";
import { getOwnerUser } from "@/lib/session";

export const metadata: Metadata = { title: "Pay links" };

// NEW DIRECTION: every pay link, day by day: Waiting until the customer pays, then Paid. Owners only.
// Businesses from the new setup (demo store); real businesses have the list on Money.

const naira = (kobo: number) => "₦" + Math.round(kobo / 100).toLocaleString("en-NG");
const dayOf = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Lagos" });

async function Links() {
  const user = await getOwnerUser();
  if (!user) redirect("/app/redeem");
  const b = await getBusiness(user);
  if (!b) redirect("/app/setup");
  if (!b.trades?.length) redirect("/app/money");
  await connection();
  const [links, limit] = await Promise.all([ownerPayLinks(user), payLinkLimit(user)]);
  const waiting = links.filter((l) => l.status === "open");
  const paid = links.filter((l) => l.status === "paid");
  // Grouped by the day they were sent, newest first.
  const days = new Map<string, OwnerPayLink[]>();
  for (const l of links) days.set(dayOf(l.createdAt), [...(days.get(dayOf(l.createdAt)) ?? []), l]);

  return (
    <>
      <StayFresh waiting={waiting.length > 0} />
      <Link href="/app/money" className="text-label inline-flex min-h-11 items-center gap-1.5 justify-self-start text-ink-muted">
        <ArrowLeft size={18} aria-hidden="true" /> Money
      </Link>
      <div>
        <h1 className="text-heading">Pay links</h1>
        <p className="text-body mt-1 text-ink-muted">Every link you sent. Waiting turns to Paid the moment they pay. Turn on alerts on Money and your phone tells you too.</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-md border border-line bg-surface-raised p-3">
          <span className="text-caption text-ink-muted">Waiting ({waiting.length})</span>
          <b className="text-code block text-[16px]">{naira(waiting.reduce((n, l) => n + l.amountKobo, 0))}</b>
        </div>
        <div className="rounded-md border border-transparent bg-success-soft p-3">
          <span className="text-caption">Paid ({paid.length})</span>
          <b className="text-code block text-[16px] text-success">{naira(paid.reduce((n, l) => n + l.amountKobo, 0))}</b>
        </div>
      </div>
      {limit.ready ? <PayLinkSheet businessName={b.name} maxKobo={limit.maxKobo} /> : <PayLinksOff why={limit.why} />}
      {links.length === 0 && <PayLinkList businessName={b.name} links={[]} empty="No pay links yet. Send one from here, from Today or from a customer's page." />}
      {[...days].map(([day, list]) => (
        <section key={day} className="grid gap-2">
          <h2 className="text-label text-ink-muted">{day}</h2>
          <PayLinkList businessName={b.name} links={list} />
        </section>
      ))}
    </>
  );
}

export default function Page() {
  return (
    <div className="mx-auto grid max-w-3xl grid-cols-1 gap-4 px-4 pb-10 pt-6 sm:px-6 lg:px-8 lg:pt-8">
      <Suspense fallback={<div className="h-96 rounded-card bg-surface-sunken" />}>
        <Links />
      </Suspense>
    </div>
  );
}
