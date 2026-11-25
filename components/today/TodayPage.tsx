import { connection } from "next/server";
import { getBookings } from "@/lib/bookings-data";
import { dayLabel, timeLabel, todayKey, watInstant, watParts } from "@/lib/bookings";
import { getLedger } from "@/lib/ledger-data";
import { getClients } from "@/lib/clients-data";
import { owedList, owedOf, paidOf } from "@/lib/ledger";
import { isDbId } from "@/lib/data";
import { demoPayLinks } from "@/lib/paylinks-demo";
import type { Business, SessionUser } from "@/lib/types";
import { TodayScreen, type TodayData } from "./TodayScreen";

// NEW DIRECTION, stage 2: Home becomes Today for businesses set up with the new setup.

export async function TodayPage({ user, business }: { user: SessionUser; business: Business }) {
  await connection(); // the real clock
  const now = new Date();
  const today = todayKey(now);
  const start = new Date(watInstant(today, 0));
  const dayAfter = new Date(start.getTime() + 2 * 86_400_000);
  const [bookings, ledger, clients, links] = await Promise.all([getBookings(user, start, dayAfter), getLedger(user), getClients(user), demoPayLinks(user)]);
  // Sales with a pay link sent and not paid yet ("Pay link sent" instead of "Owes").
  const linkWaiting = new Map(links.filter((l) => l.status === "open" && l.for.kind === "balance").map((l) => [(l.for as { saleId: string }).saleId, l.amountKobo]));
  const tomorrowStart = new Date(start.getTime() + 86_400_000);
  const paidFor = new Map(ledger.sales.filter((s) => s.bookingId).map((s) => [s.bookingId!, s]));

  const todays = bookings.filter((b) => new Date(b.startsAt) < tomorrowStart);
  const tomorrows = bookings.filter((b) => new Date(b.startsAt) >= tomorrowStart && b.status !== "cancelled");
  const isToday = (iso: string) => watParts(iso).day === today;

  const data: TodayData = {
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
      todays.filter((b) => isToday(b.createdAt)).reduce((n, b) => n + (b.depositPaidKobo ?? 0), 0),
    demo: !isDbId(user.id),
    customers: clients
      .filter((c) => c.phone)
      .sort((a, b) => (b.lastVisit ?? b.next?.at ?? "").localeCompare(a.lastVisit ?? a.next?.at ?? ""))
      .map((c) => ({ name: c.name, phone: c.phone! })),
  };
  return <TodayScreen d={data} />;
}
