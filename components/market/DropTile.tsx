import Link from "next/link";
import { Spark } from "@/components/tikka/glyphs";
import { clockTime, count, place, shortDate, timeLeft } from "@/lib/format";
import type { MarketDrop } from "@/lib/types";

/**
 * A drop on the marketplace: a mini sealed wrapper drawn in CSS in the business's colours
 * (no image per tile), then the facts. Taps open the claim page tagged as a marketplace visit.
 */
export function DropTile({ d, now, wide = false }: { d: MarketDrop; now: Date; wide?: boolean }) {
  const low = d.status === "live" && d.left / d.total < 0.1;
  return (
    <Link
      href={`/d/${d.businessSlug}/${d.dropSlug}?c=market`}
      className={`group block overflow-hidden rounded-card border border-line bg-surface-raised transition-shadow hover:shadow-raised ${wide ? "w-full" : "w-[200px] shrink-0 snap-start"}`}
    >
      <div className="relative grid h-[150px] place-items-center" style={{ background: d.brandColor }} aria-hidden="true">
        <div className="relative h-[118px] w-[86px] rounded-[10px] bg-brand shadow-card transition-transform group-hover:-translate-y-0.5">
          <div className="absolute inset-x-0 top-[18px] border-t border-dashed border-on-night/60" />
          <Spark className="absolute left-1/2 top-[30px] size-8 -translate-x-1/2 text-gold" />
          <div
            className="absolute -right-3 top-[64px] grid size-9 -rotate-12 place-items-center rounded-pill border-2 border-on-night text-[11px] font-extrabold"
            style={{ background: d.brandColor, color: d.onBrandColor }}
          >
            {d.initials}
          </div>
        </div>
        {d.legendaryLeft > 0 && d.status === "live" && (
          <span className="absolute left-2 top-2 rounded-pill bg-rarity-legendary px-2 py-0.5 text-[11px] font-semibold text-on-gold">Legendary inside</span>
        )}
      </div>
      <div className="p-3.5">
        <div className="text-label truncate text-[15px] text-ink">{d.businessName}</div>
        <div className="text-caption truncate text-ink-muted">
          {d.category} · {place(d.area, d.city)}
        </div>
        <div className="text-caption mt-2 text-ink">
          {count(d.legendary)} legendary · {count(d.rare)} rare
        </div>
        <div className="mt-2.5 flex items-center justify-between gap-2">
          {d.status === "live" ? (
            <span className={`font-mono text-[11px] uppercase tracking-[0.08em] ${low ? "text-gold-text" : "text-ink"}`}>
              <b>{count(d.left)}</b> of {count(d.total)} left
            </span>
          ) : (
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-brand">
              Opens {shortDate(d.startsAt)}, {clockTime(d.startsAt)}
            </span>
          )}
          {d.status === "live" && <span className="text-caption shrink-0 text-ink-muted">{timeLeft(d.endsAt, now)}</span>}
        </div>
        {d.status === "live" ? (
          <>
            <div className="mt-2 h-1.5 overflow-hidden rounded-pill bg-surface-sunken" aria-hidden="true">
              <div className="h-full rounded-pill bg-brand" style={{ width: `${Math.round((d.claimed / d.total) * 100)}%` }} />
            </div>
            {d.claimsLastHour > 0 && <div className="text-caption mt-1.5 font-semibold text-success">+{count(d.claimsLastHour)} claimed this hour</div>}
          </>
        ) : (
          d.waiting > 0 && <div className="text-caption mt-1.5 font-semibold text-brand">{count(d.waiting)} waiting</div>
        )}
      </div>
    </Link>
  );
}
