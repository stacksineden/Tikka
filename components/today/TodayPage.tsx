import { ChevronRight, Globe, MapPin, Sparkles } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { finishSetupMissing, PAGE_STEPS, pageMissing } from "@/lib/experience";
import { getBookings } from "@/lib/bookings-data";
import { dayLabel, timeLabel, todayKey, watInstant, watParts } from "@/lib/bookings";
import { getLedger } from "@/lib/ledger-data";
import { getClients } from "@/lib/clients-data";
import { owedList, owedOf, paidOf } from "@/lib/ledger";
import { isDbId } from "@/lib/data";
import { ownerPayLinks, payLinkLimit } from "@/lib/paylinks-data";
import type { Business, SessionUser } from "@/lib/types";
import { TodayScreen, type TodayData } from "./TodayScreen";

// Home becomes Today for every real business (docs/DB_MOVE.md step 8) and the new-setup demo ones.

export async function TodayPage({ user, business }: { user: SessionUser; business: Business }) {
  await connection(); // the real clock
  const now = new Date();
  const today = todayKey(now);
  const start = new Date(watInstant(today, 0));
  const dayAfter = new Date(start.getTime() + 2 * 86_400_000);
  const [bookings, ledger, clients, links, limit] = await Promise.all([getBookings(user, start, dayAfter), getLedger(user), getClients(user), ownerPayLinks(user), payLinkLimit(user)]);
  // Sales with a pay link sent and not paid yet ("Pay link sent" instead of "Owes").
  const linkWaiting = new Map(links.filter((l) => l.status === "open" && l.for.kind === "balance").map((l) => [(l.for as { saleId: string }).saleId, l.amountKobo]));
  const tomorrowStart = new Date(start.getTime() + 86_400_000);
  const paidFor = new Map(ledger.sales.filter((s) => s.bookingId).map((s) => [s.bookingId!, s]));

  const todays = bookings.filter((b) => new Date(b.startsAt) < tomorrowStart);
  const tomorrows = bookings.filter((b) => new Date(b.startsAt) >= tomorrowStart && b.status !== "cancelled");
  const isToday = (iso: string) => watParts(iso).day === today;

  const data: TodayData = {
    payLinks: limit.ready,
    greetingName: user.name && user.name !== "there" ? user.name : "",
    businessName: business.name,
    slug: business.slug,
    dateLabel: dayLabel(now),
    hour: Math.floor(watParts(now).minute / 60),
    appts: todays.map((b) => {
      const sale = paidFor.get(b.id);
      const price = b.priceKobo ?? 0;
      const deposit = b.depositPaidKobo ?? 0;
      const due = Math.max(0, b.depositCounts === false ? price : price - deposit);
      return {
        id: b.id,
        time: timeLabel(b.startsAt),
        first: b.firstName,
        phone: b.phone,
        service: b.service,
        detail: b.detail,
        homeArea: b.homeArea,
        dueKobo: due,
        depositKobo: deposit,
        status: b.status,
        paid: sale ? { kobo: paidOf(sale), method: sale.payments[0]?.method ?? "cash", owedKobo: owedOf(sale), linkKobo: linkWaiting.get(sale.id), saleId: sale.id } : null,
      };
    }),
    walkIns: ledger.sales
      .filter((s) => !s.bookingId && isToday(s.at))
      .map((s) => ({ id: s.id, time: timeLabel(s.at), name: s.name, item: s.item, paidKobo: paidOf(s), method: s.payments[0]?.method ?? "cash", owedKobo: s.totalKobo - paidOf(s), linkKobo: linkWaiting.get(s.id), phone: s.phone })),
    tomorrow: { count: tomorrows.length, first: tomorrows[0] ? `${timeLabel(tomorrows[0].startsAt)}, ${tomorrows[0].firstName} · ${tomorrows[0].service}` : undefined },
    owed: owedList(ledger).map(({ sale, owedKobo }) => ({ saleId: sale.id, name: sale.name, item: sale.item, owedKobo, phone: sale.phone, since: dayLabel(sale.at), linkKobo: linkWaiting.get(sale.id) })),
    services: business.services.flatMap((s) => (s.options?.length ? s.options.map((o) => ({ label: `${s.name}, ${o.label.toLowerCase()}`, naira: o.price })) : [{ label: s.name, naira: s.price ?? 0 }])),
    takenTodayKobo:
      ledger.sales.reduce((n, s) => n + s.payments.filter((p) => isToday(p.at)).reduce((m, p) => m + p.kobo, 0), 0) +
      bookings.filter((b) => isToday(b.depositPaidAt ?? b.createdAt)).reduce((n, b) => n + (b.depositPaidKobo ?? 0), 0),
    demo: !isDbId(user.id),
    customers: clients
      .filter((c) => c.phone)
      .sort((a, b) => (b.lastVisit ?? b.next?.at ?? "").localeCompare(a.lastVisit ?? a.next?.at ?? ""))
      .map((c) => ({ name: c.name, phone: c.phone! })),
  };
  const missing = finishSetupMissing(business);
  const pageTodo = pageMissing(business);
  const graceDay =
    business.listingGraceUntil && new Date(business.listingGraceUntil).getTime() > now.getTime()
      ? new Date(new Date(business.listingGraceUntil).getTime() - 1).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "Africa/Lagos" })
      : null;
  const listingPrompt = missing.length === 0 && isDbId(business.id) && !business.listingTermsAt;
  const prompts = missing.length > 0 || pageTodo.length > 0 || listingPrompt;
  return (
    <>
      {prompts && (
        // Setup prompts above Today, inside the same side margins.
        <div className="mx-auto grid max-w-6xl gap-3 px-4 pt-5 sm:px-6 lg:px-8">
        {missing.length > 0 && (
          // A business set up the old way: three quick questions for the new screens (docs/DB_MOVE.md step 8).
          <Link href="/app/finish" className="flex items-center gap-3 rounded-card border-2 border-brand bg-brand-soft px-4 py-3.5">
            <span className="grid size-10 shrink-0 place-items-center rounded-pill bg-brand text-on-brand">
              <Sparkles size={20} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <b className="block text-[17px]">Finish setting up</b>
              <span className="text-caption text-ink-muted">What you do, where you work and your booking rules. Takes a minute.</span>
            </span>
            <ChevronRight size={20} className="shrink-0 text-brand" aria-hidden="true" />
          </Link>
        )}
        {missing.length === 0 && pageTodo.length > 0 && (
          // One slim row until the page has a top photo, a few words about them and 3 photos of their work.
          <Link href="/app/page" className="flex min-h-12 min-w-0 items-center gap-2.5 rounded-pill border border-line bg-surface-raised px-4 text-[15px]">
            <Globe size={18} className="shrink-0 text-brand" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">
              <b>Finish your page</b> <span className="text-ink-muted">· add {pageTodo[0]}</span>
            </span>
            <span className="text-caption shrink-0 text-ink-muted">
              {PAGE_STEPS - pageTodo.length} of {PAGE_STEPS}
            </span>
            <ChevronRight size={18} className="shrink-0 text-ink-muted" aria-hidden="true" />
          </Link>
        )}
        {missing.length === 0 && isDbId(business.id) && !business.listingTermsAt && (
          // Tikka's search (20261218100000_listing_journey.sql): a choice with terms. Businesses listed
          // before them have until their date; everyone else is invited once setup is done.
          <Link href="/app/settings/listing" className={`flex items-center gap-3 rounded-card border-2 px-4 py-3.5 ${graceDay ? "border-gold bg-gold-soft" : "border-line bg-surface-raised"}`}>
            <span className="grid size-10 shrink-0 place-items-center rounded-pill bg-ink text-surface">
              <MapPin size={20} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <b className="block text-[17px]">{graceDay ? "Stay in Tikka's search" : "Get listed on Tikka"}</b>
              <span className="text-caption text-ink-muted">
                {graceDay ? `Accept the listing terms by ${graceDay} and add a photo of your space.` : "Customers searching for a service near them find you, free for now. About 3 minutes."}
              </span>
            </span>
            <ChevronRight size={20} className="shrink-0 text-ink-muted" aria-hidden="true" />
          </Link>
        )}
        </div>
      )}
      <TodayScreen d={data} />
    </>
  );
}
