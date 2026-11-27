import { Star } from "lucide-react";
import Link from "next/link";
import { tradeLine } from "@/lib/presets";
import { freeLabel } from "@/lib/search";
import type { BizCard as Card } from "@/lib/search-db";
import { blurProps } from "@/lib/blur";

// One business in the homepage rows and the results (it opens the business's listing, /book/[slug]): its photo, name, place, rating, starting price
// and, the part a directory can't show, when it's next free.

const naira = (n: number) => "₦" + Math.round(n).toLocaleString("en-NG");

export function BizCard({ b, now, wide = false }: { b: Card; now: Date; wide?: boolean }) {
  const trade = tradeLine(b.trades, b.category);
  const place = b.onlyComesToYou ? `Comes to you · ${b.city}` : `${b.area}, ${b.city}`;
  return (
    <Link href={`/book/${b.slug}`} className={`group block ${wide ? "" : "snap-start"}`}>
      <div className="relative aspect-[4/3] overflow-hidden rounded-card bg-surface-sunken">
        {b.coverUrl ? (
          <img src={b.coverUrl} alt="" loading="lazy" {...blurProps(b.coverUrl)} className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
        ) : (
          <div className="grid size-full place-items-center text-[44px] font-bold text-on-brand" style={{ background: b.brandColor }} aria-hidden="true">
            {b.name.slice(0, 1)}
          </div>
        )}
        {(b.featured || b.isNew || b.comesToYou) && (
          <span className="absolute top-2.5 left-2.5 rounded-pill bg-surface-raised px-2.5 py-1 text-[12px] font-semibold text-ink shadow-raised">
            {b.featured ? "Featured" : b.isNew ? "New on Tikka" : "Comes to you"}
          </span>
        )}
        {b.nextFree && <span className="absolute bottom-2.5 left-2.5 rounded-pill bg-success px-2.5 py-1 text-[12px] font-semibold text-on-success">{freeLabel(b.nextFree, now)}</span>}
      </div>
      <div className="px-0.5 pt-2.5">
        <div className="flex justify-between gap-2 text-[15px] font-semibold">
          <span className="truncate">{b.name}</span>
          {b.rating ? (
            <span className="inline-flex shrink-0 items-center gap-1 text-[14px] font-medium">
              <Star size={13} className="fill-current" aria-hidden="true" />
              {b.rating.toFixed(1)} <span className="text-ink-muted">({b.reviews})</span>
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 truncate text-[14px] text-ink-muted">
          {trade} · {place}
        </div>
        <div className="mt-0.5 text-[14px] text-ink-muted">
          {b.fromNaira ? (
            <>
              From <b className="font-semibold text-ink">{naira(b.fromNaira)}</b>
            </>
          ) : (
            "Ask for prices"
          )}
          {b.bookable ? (b.deposit ? " · small deposit" : " · no deposit") : " · message to book"}
        </div>
      </div>
    </Link>
  );
}
