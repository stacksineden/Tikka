import "@/components/business/site.css";
import "@/components/bookings/pass.css";
import type { Metadata } from "next";
import { Check, Clock, MapPin, Ticket, Wallet } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { bizSerif } from "@/components/business/fonts";
import { ActionIcon } from "@/components/tikka/ActionIcon";
import { whatsappLink } from "@/lib/booking";
import { after } from "next/server";
import { FinishPaying } from "@/components/payments/FinishPaying";
import { bookedMessage, dateBlock, leftToPay, lengthLabel } from "@/lib/bookings";
import { dbCompleteDeposit } from "@/lib/bookings-db";
import { naira } from "@/lib/format";
import { verifyPayment } from "@/lib/paystack";
import { sendBookingAlert } from "@/lib/push";
import { getBookingPass, passBooking } from "@/lib/bookings-data";
import { PassChange } from "@/components/bookings/PassChange";
import { place } from "@/lib/format";
import { bookingNumber } from "@/lib/page";

// The booking pass (docs/BOOKINGS.md journey 1): the customer's link after booking. The booking,
// its code and "Message {business}" with the booking written out. Never the phone number. Tikka
// sends the customer nothing; the business and customer talk on WhatsApp.

export const metadata: Metadata = { title: "Your booking", robots: { index: false, follow: false } };

const STATUS: Record<string, string> = {
  held: "Not booked yet",
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
  // NEW DIRECTION (demo only for now): the customer can move or cancel within the booking rules.
  const change = await passBooking(token);
  const b = pass.business;
  const number = bookingNumber(b);
  const cancelled = pass.status === "cancelled";
  const message = cancelled ? `Hi ${b.name}, about my ${pass.service} booking (Ref ${pass.code}).` : bookedMessage(b.name, pass);
  const style = { "--biz": b.brandColor, "--on-biz": b.onBrandColor } as React.CSSProperties;
  const when = dateBlock(pass.startsAt);

  return (
    <div className={`${bizSerif.variable} mx-auto grid max-w-md gap-5 px-4 pb-16 pt-8`} style={style}>
      <Link href={`/${b.slug}`} className="text-label text-ink-muted">
        ← {b.name}
      </Link>

      <section className="bk-ticket" data-cancelled={cancelled || undefined} aria-label="Your booking">
        <div className="bk-head px-5 pb-5 pt-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="bk-logo shrink-0" aria-hidden="true">
                {b.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.logoUrl} alt="" className="size-full object-cover" />
                ) : (
                  b.initials
                )}
              </span>
              <span className="truncate text-[14px] font-semibold opacity-90">{b.name}</span>
            </div>
            <span className="bk-stamp" data-quiet={pass.status === "held" || cancelled || undefined}>
              {pass.status === "booked" || pass.status === "arrived" ? <Check size={14} strokeWidth={3} aria-hidden="true" /> : null}
              {STATUS[pass.status] ?? "Booked"}
              {pass.moved && !cancelled ? " · new time" : ""}
            </span>
          </div>
          <div className="mt-5 flex items-end justify-between gap-4">
            <h1 className="biz-serif min-w-0 text-[32px] leading-[1.05] tracking-[-0.015em]">{pass.service}</h1>
            <div className={`bk-date shrink-0 ${cancelled ? "line-through" : ""}`}>
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] opacity-85">{when.weekday.slice(0, 3)}</span>
              <span className="biz-serif text-[40px] leading-none">{when.day}</span>
              <span className="text-[12px] font-semibold uppercase tracking-[0.12em] opacity-85">{when.month}</span>
            </div>
          </div>
          <p className={`mt-3 text-[17px] font-semibold ${cancelled ? "line-through opacity-80" : ""}`}>
            {when.weekday} at {when.time}
          </p>
        </div>

        <div className="bk-perf" aria-hidden="true" />

        <dl className="grid gap-3.5 px-5 pb-5 pt-5">
          <div className="bk-row flex items-center gap-2.5 text-body" style={{ "--i": 0 } as React.CSSProperties}>
            <Clock size={17} className="shrink-0 text-ink-muted" aria-hidden="true" />
            <dt className="sr-only">How long</dt>
            <dd>{change?.eventDay ? "The whole day is yours" : lengthLabel(pass.minutes)}</dd>
          </div>
          {pass.detail && (
            <div className="bk-row flex items-start gap-2.5 text-body" style={{ "--i": 0 } as React.CSSProperties}>
              <Check size={17} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden="true" />
              <dt className="sr-only">What you picked</dt>
              <dd>{pass.detail}</dd>
            </div>
          )}
          <div className="bk-row flex items-start gap-2.5 text-body" style={{ "--i": 1 } as React.CSSProperties}>
            <MapPin size={17} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden="true" />
            <dt className="sr-only">Where</dt>
            <dd>{pass.homeArea ? `${b.name} comes to you: ${pass.homeArea}` : `${b.name}, ${b.address || place(b.area, b.city)}`}</dd>
          </div>
          {pass.depositPaidKobo ? (
            <div className="bk-row flex items-start gap-2.5" style={{ "--i": 2 } as React.CSSProperties}>
              <Wallet size={17} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden="true" />
              <dt className="sr-only">Deposit</dt>
              <dd className="text-body font-semibold">
                {naira(pass.depositPaidKobo / 100)} paid ·{" "}
                {(() => {
                  const left = leftToPay(pass, pass.depositPaidKobo);
                  return left === null ? `the rest agreed with ${b.name}` : left > 0 ? `${naira(left / 100)} to pay ${pass.homeArea ? "on the day" : `at ${b.name}`}` : "nothing more to pay";
                })()}
              </dd>
            </div>
          ) : null}
          {pass.status !== "held" && (
            <div className="bk-row mt-1 flex items-end justify-between gap-3 border-t border-line pt-4" style={{ "--i": 3 } as React.CSSProperties}>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Booking ref</dt>
                <dd className="mt-1 font-mono text-[22px] tracking-[0.08em]">{pass.code}</dd>
              </div>
              <span className="text-caption text-ink-muted">Show at the counter</span>
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
          Hi {pass.firstName}, you&apos;re booked. Show this page or your ref when you arrive.{change ? "" : ` To move or cancel, message ${b.name}.`}
        </p>
      )}
      {change && pass.status === "booked" && (
        <PassChange token={token} slug={change.slug} minutes={change.minutes} eventDay={change.eventDay} startsAt={change.startsAt} depositKobo={pass.depositPaidKobo ?? 0} rules={b.bookingRules ?? []} />
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
