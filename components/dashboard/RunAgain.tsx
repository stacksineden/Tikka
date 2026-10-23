import { CalendarHeart, RotateCcw } from "lucide-react";
import Link from "next/link";

/** "December is here. Your last drop brought 30 customers. Run it again?" (PRD B6 nudges). */
export function SeasonalNudge({ text, fromId }: { text: string; fromId: string }) {
  return (
    <section className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-brand-soft p-4" aria-label="Seasonal idea">
      <CalendarHeart size={22} className="shrink-0 text-brand" aria-hidden="true" />
      <p className="text-body min-w-0 flex-1 font-semibold text-ink">{text}</p>
      <Link href={`/app/drops/new?from=${fromId}`} className="btn min-h-11 px-4 text-label">
        <RotateCcw />
        Run it again
      </Link>
    </section>
  );
}

/** When a drop ends: its results, and "Run it again". */
export function LastDropResults({ id, name, headline }: { id: string; name: string; headline: string }) {
  return (
    <section className="grid gap-3 rounded-card border border-gold/40 bg-gold-soft p-4 sm:p-5" aria-labelledby="last-drop-h">
      <div>
        <h2 id="last-drop-h" className="text-caption font-semibold uppercase tracking-[0.06em] text-gold-text">
          {name} has ended
        </h2>
        <p className="text-title mt-1">{headline}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href={`/app/drops/${id}`} className="btn btn-secondary min-h-11 px-4 text-label">
          See the results
        </Link>
        <Link href={`/app/drops/new?from=${id}`} className="btn min-h-11 px-4 text-label">
          <RotateCcw />
          Run it again
        </Link>
      </div>
    </section>
  );
}
