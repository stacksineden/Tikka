import type { Metadata } from "next";
import { Settings2 } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { BookingSetup } from "@/components/bookings/BookingSetup";
import { BookingsBoard } from "@/components/bookings/BookingsBoard";
import { StayFresh } from "@/components/payments/StayFresh";
import { CopyLink } from "@/components/dashboard/CopyLink";
import { getBookings, getBookingSetup, serviceLengths } from "@/lib/bookings-data";
import { getBusiness, isDbId } from "@/lib/data";
import { SITE } from "@/lib/qr";
import { getOwnerUser } from "@/lib/session";
import { DepositSettings } from "@/components/bookings/DepositSettings";
import { paystackMode } from "@/lib/paystack";
import { dbPayoutState, payReady } from "@/lib/payouts-db";
import { dbBookingSetup } from "@/lib/bookings-db";
import { MonthCalendar, type MonthDay } from "@/components/today/MonthCalendar";
import { getBookingRules } from "@/lib/bookings-data";
import { freeDays, openRange, todayKey, watParts, type Booking } from "@/lib/bookings";
import type { Business } from "@/lib/types";

/** Each day for the next two months: free times, full or closed, and how many are booked. */
async function monthDays(ownerKey: string, b: Business, list: Booking[], now: Date): Promise<MonthDay[]> {
  const rules = await getBookingRules(ownerKey, b);
  if (!rules) return [];
  const shortest = Math.min(...b.services.map((s) => s.options?.length ? Math.min(...s.options.map((o) => o.minutes)) : (s.minutes ?? 60)));
  const counts = new Map<string, number>();
  for (const x of list) if (x.status !== "cancelled") counts.set(watParts(x.startsAt).day, (counts.get(watParts(x.startsAt).day) ?? 0) + 1);
  return freeDays({ ...rules, aheadDays: Math.min(rules.aheadDays, 62) }, shortest, now).map((d) => ({
    key: d.key,
    state: !openRange(rules.hours, d.weekday) ? "closed" : d.slots.length ? "free" : "full",
    bookings: counts.get(d.key) ?? 0,
  }));
}

export const metadata: Metadata = { title: "Bookings" };

// Bookings (docs/BOOKINGS.md). Owners only here (staff see today's on Redeem). The first visit sets
// bookings up; after that: Did they come?, Today, Coming up, blocked times and past bookings.

async function Bookings({ searchParams }: { searchParams: PageProps<"/app/bookings">["searchParams"] }) {
  const user = await getOwnerUser();
  if (!user) redirect("/app/redeem");
  const [b, setup, sp] = await Promise.all([getBusiness(user), getBookingSetup(user), searchParams]);
  if (!b) redirect("/app/setup");
  if (!setup) redirect("/app");

  const services = b.services.filter((s) => s.id).map((s) => ({ id: s.id!, name: s.name }));
  const editing = sp.edit === "1";

  if (!setup.setUp || editing) {
    return (
      <>
        <div>
          <h1 className="text-heading">{setup.setUp ? "Booking settings" : "Take bookings on your page"}</h1>
          <p className="text-body mt-1 text-ink-muted">
            {setup.setUp
              ? "Changes apply to new bookings. Bookings you already have stay as they are."
              : "Customers pick a free time on your page and it's booked. You see every booking here, with their WhatsApp number. Three quick questions:"}
          </p>
        </div>
        <BookingSetup first={!setup.setUp} hours={b.hours} services={services} initial={setup} />
        {/* Deposits (REVENUE_PLAN 5.4): once getting paid is ready for the business. */}
        {setup.setUp && isDbId(b.id) && (await depositsCard(b))}
        {editing && (
          <Link href="/app/bookings" className="btn btn-ghost justify-self-start">
            Back to bookings
          </Link>
        )}
      </>
    );
  }

  await connection();
  const now = new Date();
  const list = await getBookings(user, new Date(now.getTime() - 30 * 86_400_000), new Date(now.getTime() + (setup.aheadDays + 1) * 86_400_000));
  const lengths = serviceLengths(isDbId(b.id) ? b.id : user.id, b);
  // NEW DIRECTION: "See my calendar" for businesses from the new setup (demo only for now).
  const month = b.trades?.length ? await monthDays(user.id, b, list, now) : null;

  return (
    <>
      {/* New bookings and paid deposits show without a reload. */}
      <StayFresh waiting={false} slow={20_000} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-heading">{b.trades?.length ? "Calendar" : "Bookings"}</h1>
          <p className="text-body mt-1 text-ink-muted">
            {setup.enabled ? "Customers book free times on your page." : "Bookings are off: Book on your page sends a WhatsApp message instead."}
          </p>
        </div>
        <Link href="/app/bookings?edit=1" className="btn btn-secondary shrink-0" aria-label="Booking settings">
          <Settings2 size={18} aria-hidden="true" />
          <span className="hidden sm:inline">Settings</span>
        </Link>
      </div>
      {month && <MonthCalendar days={month} todayKey={todayKey(now)} />}
      {setup.enabled && (
        <div className="grid gap-1">
          <p className="text-label">Your booking link: put it in your Instagram and WhatsApp bio</p>
          <CopyLink url={`${SITE}/${b.slug}`} />
        </div>
      )}
      <BookingsBoard
        bookings={list}
        blocks={setup.blocks}
        services={services.map((s) => ({ ...s, minutes: lengths[s.id] ?? 60 }))}
        base={{ capacity: setup.capacity, noticeMinutes: setup.noticeMinutes, aheadDays: setup.aheadDays, hours: b.hours ?? null }}
        businessName={b.name}
      />
    </>
  );
}

async function depositsCard(b: NonNullable<Awaited<ReturnType<typeof getBusiness>>>) {
  const [state, setup] = await Promise.all([dbPayoutState(b.id), dbBookingSetup(b.id)]);
  const pay = payReady(state, paystackMode());
  if (!pay.ready) {
    return (
      <section className="rounded-card border border-dashed border-line-strong bg-surface-raised p-4 sm:p-5">
        <h2 className="text-title">Deposits</h2>
        <p className="text-body mt-1 text-ink-muted">
          {pay.why === "closed" ? "We're getting deposits ready for your business. Message Tikka on WhatsApp and we'll switch them on." : "To take deposits, add the bank account they go to."}
        </p>
        {pay.why !== "closed" && (
          <Link href="/app/settings/get-paid" className="btn btn-secondary mt-3 min-h-11">
            Go to Get paid
          </Link>
        )}
      </section>
    );
  }
  return (
    <DepositSettings
      initial={setup.deposit ?? { mode: "off", counts: true }}
      services={b.services.filter((s) => s.id).map((s) => ({ id: s.id!, name: s.name, priced: s.priceKind === "fixed" && s.price !== null, priceKobo: s.price !== null ? Math.round(s.price * 100) : undefined }))}
      serviceDeposits={setup.serviceDeposits ?? {}}
      maxKobo={pay.maxKobo}
    />
  );
}

export default function Page(props: PageProps<"/app/bookings">) {
  return (
    <div className="mx-auto grid max-w-3xl grid-cols-1 gap-4 px-4 pb-10 pt-6 sm:px-6 lg:px-8 lg:pt-8">
      <Suspense fallback={<div className="h-96 rounded-card bg-surface-sunken" />}>
        <Bookings searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}
