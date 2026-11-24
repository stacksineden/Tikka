import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { NotifyMe } from "@/components/market/NotifyMe";
import { clockTime, count, shortDate } from "@/lib/format";
import type { PageDrop } from "@/lib/page";
import type { Business } from "@/lib/types";

/** The live drop band: a moving ticker, the only place the page promotes anything. */
/** `fromCard`: they came from a business card scan, so a claim from here counts as "Business card". */
export function DropBand({ b, live, next, dark = false, fromCard = false }: { b: Pick<Business, "slug" | "name">; live?: PageDrop; next?: PageDrop; dark?: boolean; fromCard?: boolean }) {
  if (live) {
    const left = count(live.left);
    const item = (k: number) => (
      <span key={k} className="flex shrink-0 items-center gap-6 pr-6 font-mono text-[13px] uppercase tracking-[0.12em]">
        <span className="text-gold">● Live now</span>
        <span>{live.name}</span>
        <span className={dark ? "pg-muted" : "text-on-night-muted"}>{left} Tikkas left</span>
        <span className={dark ? "pg-muted" : "text-on-night-muted"}>Ends {shortDate(live.endsAt)}</span>
        <span aria-hidden="true">✦</span>
      </span>
    );
    return (
      <div data-theme="light" className={`relative flex items-center overflow-hidden ${dark ? "pg-drop" : "stage bg-night text-on-night"}`}>
        <div className="min-w-0 flex-1 overflow-hidden py-4" aria-hidden="true">
          <div className="biz-marquee">{[0, 1, 2, 3, 4, 5].map(item)}</div>
        </div>
        <p className="sr-only">
          Live now: {live.name}, {left} Tikkas left, ends {shortDate(live.endsAt)}.
        </p>
        <Link href={`/d/${b.slug}/${live.slug}${fromCard ? "?c=card" : ""}`} className="biz-btn shrink-0 self-stretch bg-gold text-on-gold">
          Claim yours
          <ArrowUpRight aria-hidden="true" />
        </Link>
      </div>
    );
  }
  return (
    <div className={`border-y px-4 py-4 sm:px-8 ${dark ? "pg-band" : "border-[var(--biz-rule)]"}`}>
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <p className={`text-body ${dark ? "pg-muted" : "text-ink-muted"}`}>
          {next ? (
            <>
              <b className={dark ? "" : "text-ink"}>{next.name}</b> opens {shortDate(next.startsAt)}, {clockTime(next.startsAt)}.
            </>
          ) : (
            <>Be the first to hear when {b.name} has something new.</>
          )}
        </p>
        <NotifyMe
          businessSlug={b.slug}
          businessName={b.name}
          dropSlug={next?.slug}
          opensLabel={next ? `${shortDate(next.startsAt)}, ${clockTime(next.startsAt)}` : undefined}
          className={dark ? "biz-btn pg-btn-line" : "biz-btn border border-ink bg-transparent text-ink"}
        >
          {next ? "Notify me" : "Get notified"}
        </NotifyMe>
      </div>
    </div>
  );
}
