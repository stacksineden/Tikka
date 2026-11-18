import "@/components/business/site.css";
import type { Metadata } from "next";
import { CalendarCheck, Clock, MapPin } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { bizSerif } from "@/components/business/fonts";
import { ActionIcon } from "@/components/tikka/ActionIcon";
import { whatsappLink } from "@/lib/booking";
import { bookedMessage, lengthLabel, whenLabel } from "@/lib/bookings";
import { getBookingPass } from "@/lib/bookings-data";
import { place } from "@/lib/format";
import { bookingNumber } from "@/lib/page";

// The booking pass (docs/BOOKINGS.md journey 1): the customer's link after booking. The booking,
// its code and "Message {business}" with the booking written out. Never the phone number. Tikka
// sends the customer nothing; the business and customer talk on WhatsApp.

export const metadata: Metadata = { title: "Your booking", robots: { index: false, follow: false } };

const STATUS: Record<string, string> = {
  booked: "Booked",
  arrived: "You came in",
  no_show: "Missed",
  cancelled: "Cancelled",
};

async function Pass({ params }: { params: PageProps<"/bk/[token]">["params"] }) {
  const { token } = await params;
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
          <div>
            <dt className="text-caption text-ink-muted">Booking ref</dt>
            <dd className="font-mono text-[20px] tracking-[0.06em]">{pass.code}</dd>
          </div>
        </dl>
      </section>

      {cancelled ? (
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
        <Pass params={props.params} />
      </Suspense>
    </main>
  );
}
