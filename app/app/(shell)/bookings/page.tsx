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
import { bookingGaps, getBookings, getBookingSetup, serviceLengths } from "@/lib/bookings-data";
import { getBusiness, isDbId } from "@/lib/data";
import { SITE } from "@/lib/qr";
import { getOwnerUser } from "@/lib/session";
import { DepositSettings } from "@/components/bookings/DepositSettings";
import { paystackMode } from "@/lib/paystack";
import { dbPayoutState, payReady } from "@/lib/payouts-db";
import { dbBookingSetup } from "@/lib/bookings-db";
import { MonthCalendar, type MonthDay } from "@/components/today/MonthCalendar";
import { BookingSettingsV2 } from "@/components/settings/BookingSettingsV2";
import { WaitlistList } from "@/components/today/WaitlistList";
import { START_HOURS } from "@/lib/presets";
import { getBookingRules, getWaitlist } from "@/lib/bookings-data";
import { dayLabel, freeDays, openRange, todayKey, watParts, type Booking } from "@/lib/bookings";
import type { Business } from "@/lib/types";
import { newExperience } from "@/lib/experience";
import { needsPrice } from "@/lib/page";
import { LoadingGrid } from "@/components/ui/Loading";
import { payLinkLimit } from "@/lib/paylinks-data";

/** Each day for the next two months: free times, full or closed, and how many are booked. */
async function monthDays(ownerKey: string, b: Business, list: Booking[], now: Date): Promise<MonthDay[]> {
  const rules = await getBookingRules(ownerKey, b);
  if (!rules) return [];
  const shortest = Math.min(...b.services.map((s) => s.options?.length ? Math.min(...s.options.map((o) => o.minutes)) : (s.minutes ?? 60)));
  const counts = new Map<string, number>();
  for (const x of list) if (x.status !== "cancelled") counts.set(watParts(x.startsAt).day, (counts.get(watParts(x.startsAt).day) ?? 0) + 1);
  return freeDays({ ...rules, aheadDays: Math.min(rules.aheadDays, 62) }, shortest, now).map((d) => ({
    key: d.key,
    // Today with nothing left because it's late reads closed, not full.
    state: !openRange(rules.hours, d.weekday) || (d.key === todayKey(now) && !d.slots.length && !counts.get(d.key)) ? "closed" : d.slots.length ? "free" : "full",
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

  const services = b.services.filter((s) => s.id).map((s) => ({ id: s.id!, name: s.name, item: s }));
  const editing = sp.edit === "1";
  // With bookings on, "Ask for price" services can't be booked online until they have a price.
  const unpriced = b.services.filter((s) => s.id && needsPrice(s)).map((s) => s.name);
  const priceNotice = unpriced.length ? <UnpricedNotice names={unpriced} on={setup.enabled} /> : null;

  // NEW DIRECTION: Booking settings in one place for businesses from the new setup (demo only for now).
  if (editing && newExperience(b)) {
    const dep = setup.deposit;
    // Deposits only charge customers once payments are on (ID and bank approved in Get paid).
    const depositsLive = isDbId(b.id) ? payReady(await dbPayoutState(b.id).catch(() => null), paystackMode()).ready : true;
    return (
      <>
        <Link href="/app/bookings" className="text-label inline-flex min-h-11 items-center justify-self-start text-ink-muted">
          ← Calendar
        </Link>
        <div>
          <h1 className="text-heading">Booking settings</h1>
          <p className="text-body mt-1 text-ink-muted">Changes show on your page straight away. Bookings you already have stay as they are.</p>
        </div>
        {priceNotice}
        <BookingSettingsV2
          d={{
            enabled: setup.enabled,
            hours: b.hours ?? START_HOURS,
            capacity: setup.capacity,
            noticeMinutes: setup.noticeMinutes,
            aheadDays: setup.aheadDays,
            workPlace: b.workPlace ?? "shop",
            travelFee: b.travelFee ?? 0,
            travelReach: b.travelReach ?? "city",
            place: { area: b.area, city: b.city, state: b.state },
            deposit: dep ? { mode: dep.mode, percent: dep.percent, fixedKobo: dep.fixedKobo, counts: dep.counts } : { mode: "off", counts: true },
            rules: b.bookingRules ?? [],
            services: b.services.filter((x) => x.id).map((x) => ({ id: x.id!, name: x.name, questions: x.questions ?? [], gapMinutes: x.gapMinutes })),
            gapMinutes: b.gapMinutes ?? 0,
            homeGapMinutes: b.homeGapMinutes ?? 0,
            depositsLive,
          }}
        />
      </>
    );
  }

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
        {priceNotice}
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
  const month = newExperience(b) ? await monthDays(user.id, b, list, now) : null;

  return (
    <>
      {/* New bookings and paid deposits show without a reload. */}
      <StayFresh waiting={false} slow={20_000} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-heading">{newExperience(b) ? "Calendar" : "Bookings"}</h1>
          <p className="text-body mt-1 text-ink-muted">
            {setup.enabled ? "Customers book free times on your page." : "Bookings are off: Book on your page sends a WhatsApp message instead."}
          </p>
        </div>
        <Link href="/app/bookings?edit=1" className="btn btn-secondary shrink-0" aria-label="Booking settings">
          <Settings2 size={18} aria-hidden="true" />
          <span className="hidden sm:inline">Settings</span>
        </Link>
      </div>
      {setup.enabled && priceNotice}
      {month && <MonthCalendar days={month} todayKey={todayKey(now)} />}
      {month && (
        <WaitlistList
          rows={(await getWaitlist(user)).map((w) => ({ id: w.id, day: w.day, dayLabel: dayLabel(`${w.day}T12:00:00+01:00`), service: w.service, name: w.name, phone: w.phone, freeNow: month.find((m) => m.key === w.day)?.state === "free" }))}
          business={b.name}
          link={`usetikka.com/${b.slug}`}
        />
      )}
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
        gaps={newExperience(b) ? bookingGaps(b, list) : undefined}
        payLinks={(await payLinkLimit(user)).ready}
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

/** Services that need a price before customers can book them online (exact prices, 28 Nov 2026). */
function UnpricedNotice({ names, on }: { names: string[]; on: boolean }) {
  const list = names.length > 3 ? `${names.slice(0, 3).join(", ")} and ${names.length - 3} more` : names.join(names.length === 2 ? " and " : ", ");
  return (
    <section className="rounded-card bg-gold-soft p-4">
      <h2 className="text-label">Add a price to take bookings for {list}</h2>
      <p className="text-caption mt-1">
        Customers pay a deposit online, so they need the full price first.{" "}
        {on ? "Until you add one, customers message you on WhatsApp for these instead." : "Add one before you turn bookings on, or customers will message you for these instead."} If it depends on how many, set the price per hour or per item.
      </p>
      <Link href="/app/page#services" className="btn btn-secondary mt-3 min-h-11">
        Add prices
      </Link>
    </section>
  );
}

export default function Page(props: PageProps<"/app/bookings">) {
  return (
    <div className="mx-auto grid max-w-3xl grid-cols-1 gap-4 px-4 pb-10 pt-6 sm:px-6 lg:px-8 lg:pt-8">
      <Suspense fallback={<LoadingGrid />}>
        <Bookings searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}
