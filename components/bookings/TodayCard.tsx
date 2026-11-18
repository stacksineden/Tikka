import { ArrowRight, CalendarDays } from "lucide-react";
import Link from "next/link";
import { timeLabel, type Booking } from "@/lib/bookings";

/**
 * Home's "Today" card (docs/BOOKINGS.md): today's bookings at a glance, under the numbers row.
 * One line on a day with none. Before bookings are set up, a short invitation instead.
 */
export function TodayCard({ setUp, bookings }: { setUp: boolean; bookings: Booking[] }) {
  if (!setUp) {
    return (
      <Link href="/app/bookings" className="flex items-center gap-3 rounded-card border border-line bg-surface-raised p-4 active:bg-surface-sunken">
        <span className="grid size-11 shrink-0 place-items-center rounded-pill bg-brand-soft text-brand">
          <CalendarDays size={20} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-label block">Let customers book a time on your page</span>
          <span className="text-caption text-ink-muted">They pick a free time; you see every booking here.</span>
        </span>
        <ArrowRight size={18} className="shrink-0 text-ink-muted" aria-hidden="true" />
      </Link>
    );
  }
  const live = bookings.filter((b) => b.status !== "cancelled");
  if (!live.length) {
    return (
      <Link href="/app/bookings" className="flex min-h-14 items-center justify-between gap-3 rounded-card border border-line bg-surface-raised px-4 active:bg-surface-sunken">
        <span className="text-body flex items-center gap-2">
          <CalendarDays size={18} className="text-ink-muted" aria-hidden="true" />
          No bookings today
        </span>
        <span className="text-label text-brand">See all</span>
      </Link>
    );
  }
  return (
    <section className="rounded-card border border-line bg-surface-raised" aria-labelledby="today-bk">
      <h2 id="today-bk" className="text-title flex items-center gap-2 px-4 pt-4">
        <CalendarDays size={20} aria-hidden="true" />
        Today · {live.length} {live.length === 1 ? "booking" : "bookings"}
      </h2>
      <ul className="mt-2 divide-y divide-line">
        {live.slice(0, 6).map((b) => (
          <li key={b.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className="w-16 shrink-0 font-mono text-[15px] font-semibold tabular-nums">{timeLabel(b.startsAt)}</span>
            <span className="text-body min-w-0 flex-1 truncate">
              <span className="font-semibold">{b.firstName}</span> <span className="text-ink-muted">· {b.service}</span>
            </span>
            {b.status === "arrived" && <span className="tag tag--redeemed">Came in</span>}
            {b.status === "no_show" && <span className="tag bg-danger-soft text-danger">No-show</span>}
          </li>
        ))}
      </ul>
      <Link href="/app/bookings" className="text-label flex min-h-12 items-center gap-1 border-t border-line px-4 text-brand">
        See all bookings
        <ArrowRight size={16} aria-hidden="true" />
      </Link>
    </section>
  );
}
