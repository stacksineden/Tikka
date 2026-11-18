import "@/components/business/site.css";
import type { Metadata } from "next";
import { CalendarCheck, Clock, MapPin, Ticket } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { bizSerif } from "@/components/business/fonts";
import { ActionIcon } from "@/components/tikka/ActionIcon";
import { whatsappLink } from "@/lib/booking";
import { after } from "next/server";
import { FinishPaying } from "@/components/payments/FinishPaying";
import { bookedMessage, leftToPay, lengthLabel, whenLabel } from "@/lib/bookings";
import { dbCompleteDeposit } from "@/lib/bookings-db";
import { naira } from "@/lib/format";
import { verifyPayment } from "@/lib/paystack";
import { sendBookingAlert } from "@/lib/push";
import { getBookingPass } from "@/lib/bookings-data";
import { place } from "@/lib/format";
import { bookingNumber } from "@/lib/page";

// The booking pass (docs/BOOKINGS.md journey 1): the customer's link after booking. The booking,
// its code and "Message {business}" with the booking written out. Never the phone number. Tikka
// sends the customer nothing; the business and customer talk on WhatsApp.

export const metadata: Metadata = { title: "Your booking", robots: { index: false, follow: false } };

const STATUS: Record<string, string> = {
  held: "Waiting for your deposit",
  booked: "Booked",
  arrived: "You came in",
  no_show: "Missed",
  cancelled: "Cancelled",
};

async function Pass({ params, searchParams }: { params: PageProps<"/bk/[token]">["params"]; searchParams: PageProps<"/bk/[token]">["searchParams"] }) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  // Back from paying the deposit: check with Paystack and record it before showing the pass (the
  // webhook records it too, whichever comes first).
  const reference = typeof sp.reference === "string" ? sp.reference : null;
  if (reference?.startsWith(`bk_${token}_`)) {
    const v = await verifyPayment(reference).catch(() => null);
    if (v?.status === "success") {
      const r = await dbCompleteDeposit(reference, v.amountKobo, v.feeKobo, v.email);
      const id = r.id;
      if (r.kind === "paid" && id) after(() => sendBookingAlert(id));
    }
  }
  const pass = await getBookingPass(token);
  if (!pass) notFound();
  const b = pass.business;
  const number = bookingNumber(b);
  const cancelled = pass.status === "cancelled";
  const message = cancelled ? `Hi ${b.name}, about my ${pass.service} booking (Ref ${pass.code}).` : bookedMessage(b.name, pass);
  const style = { "--biz": b.brandColor, "--on-biz": b.onBrandColor } as React.CSSProperties;

  return (
    <div className={`${bizSerif.variable} mx-auto grid max-w-md gap-5 px-4 pb-16 pt-8`} style={style}>
      <Link href={`/${b.slug}`} className="text-label text-ink-muted">
        ← {b.name}
      </Link>

      <section className="overflow-hidden rounded-card border border-line bg-surface-raised shadow-raised" aria-label="Your booking">
        <div className="px-5 pb-4 pt-5" style={{ background: "var(--biz)", color: "var(--on-biz)" }}>
          <p className="text-label flex items-center gap-1.5 opacity-90">
            <CalendarCheck size={16} aria-hidden="true" />
            {STATUS[pass.status] ?? "Booked"}
            {pass.moved && !cancelled ? " · new time" : ""}
          </p>
          <h1 className="biz-serif mt-1 text-[30px] leading-tight tracking-[-0.01em]">{pass.service}</h1>
          <p className={`mt-1 text-[17px] font-semibold ${cancelled ? "line-through opacity-80" : ""}`}>{whenLabel(pass.startsAt)}</p>
        </div>
        {/* The ticket's tear line. */}
        <div className="relative h-0 border-t border-dashed border-line" aria-hidden="true" />
        <dl className="grid gap-3 px-5 py-4">
          <div className="flex items-center gap-2 text-body">
            <Clock size={16} className="shrink-0 text-ink-muted" aria-hidden="true" />
            <dt className="sr-only">How long</dt>
            <dd>{lengthLabel(pass.minutes)}</dd>
          </div>
          <div className="flex items-center gap-2 text-body">
            <MapPin size={16} className="shrink-0 text-ink-muted" aria-hidden="true" />
            <dt className="sr-only">Where</dt>
            <dd>
              {b.name}, {b.address || place(b.area, b.city)}
            </dd>
          </div>
          {pass.depositPaidKobo ? (
            <div>
              <dt className="text-caption text-ink-muted">Deposit</dt>
              <dd className="text-body font-semibold">
                {naira(pass.depositPaidKobo / 100)} paid ·{" "}
                {(() => {
                  const left = leftToPay(pass, pass.depositPaidKobo);
                  return left === null ? `the rest agreed with ${b.name}` : left > 0 ? `${naira(left / 100)} to pay at ${b.name}` : "nothing more to pay";
                })()}
              </dd>
            </div>
          ) : null}
          {pass.status !== "held" && (
            <div>
              <dt className="text-caption text-ink-muted">Booking ref</dt>
              <dd className="font-mono text-[20px] tracking-[0.06em]">{pass.code}</dd>
            </div>
          )}
        </dl>
      </section>

      {/* Booked with a Tikka: its code and QR are on the card, which is what the counter needs. */}
      {pass.tikka && (
        <section className="rounded-card border border-line bg-surface-raised p-4" aria-label="Your Tikka">
          <p className="text-label flex items-center gap-1.5 text-ink-muted">
            <Ticket size={16} aria-hidden="true" />
            Your Tikka{pass.tikka.used ? " · used" : ""}
          </p>
          <p className="text-body-lg mt-1 font-semibold">{pass.tikka.reward}</p>
          {!pass.tikka.used && <p className="text-body mt-1 text-ink-muted">Show your Tikka at the counter to get it.</p>}
          <a href={`/t/${pass.tikka.token}`} className="biz-btn mt-3 min-h-12 w-full border border-line-strong">
            Open your Tikka
          </a>
        </section>
      )}

      {pass.status === "held" && pass.depositKobo ? (
        <section className="grid gap-3 rounded-card border border-line bg-surface-raised p-4">
          <p className="text-body">
            {pass.holdLive
              ? `Your time is held for a few minutes. Pay the ${naira(pass.depositKobo / 100)} deposit to book it.`
              : `Your deposit wasn't paid, so the time isn't booked yet. Pay ${naira(pass.depositKobo / 100)} to book it if it's still free.`}
          </p>
          <FinishPaying token={token} label={`Pay ${naira(pass.depositKobo / 100)} deposit`} />
          <p className="text-caption text-ink-muted">This deposit holds your time. It isn&apos;t refundable through Tikka. To move or cancel, message {b.name}.</p>
        </section>
      ) : null}

      {pass.status === "held" ? null : cancelled ? (
        <p className="text-body rounded-md bg-surface-sunken px-4 py-3">
          {b.name} cancelled this booking. Message them to find another time.
        </p>
      ) : (
        <p className="text-body text-ink-muted">
          Hi {pass.firstName}, you&apos;re booked. Show this page or your ref when you arrive. To move or cancel, message {b.name}.
        </p>
      )}

      {number && (
        <a href={whatsappLink(number, message)} target="_blank" rel="noopener noreferrer" className="biz-btn min-h-[52px] w-full bg-ink text-surface-raised">
          <ActionIcon kind="whatsapp" />
          Message {b.name}
        </a>
      )}
      <p className="text-caption text-center text-ink-muted">Keep this link to find your booking again.</p>
    </div>
  );
}

export default function Page(props: PageProps<"/bk/[token]">) {
  return (
    <main data-theme="light" className="min-h-dvh bg-surface-sunken text-ink">
      <Suspense fallback={<div className="h-dvh" />}>
        <Pass params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}
