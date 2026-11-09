"use client";

import { Eye, ScanLine, Star } from "lucide-react";
import { useState } from "react";
import { Spark } from "@/components/tikka/glyphs";
import { TIER_LABEL } from "@/components/tikka/RarityBadge";
import { foldOldViews } from "@/lib/dashboard";
import { naira, shortDate, timeAgo, WAT } from "@/lib/format";
import type { ActivityEvent } from "@/lib/types";

/** How many lines the feed shows before "Show more". */
const SHOWN = 8;

const SOURCE_LABEL: Record<string, string> = {
  ig: "Instagram",
  wa: "WhatsApp status",
  qr: "QR code",
  web: "your website",
  ads: "ads",
  market: "the marketplace",
};

function describe(e: ActivityEvent): { text: React.ReactNode; Icon: React.ElementType; tone: string } {
  switch (e.kind) {
    case "views":
      return {
        Icon: Eye,
        tone: "bg-surface-sunken text-ink-muted",
        text: e.day ? (
          <>
            <b>{e.count === 1 ? "1 person" : `${e.count} people`}</b> opened your link{e.source ? ` · via ${SOURCE_LABEL[e.source]}` : ""}
          </>
        ) : e.count === 1 ? (
          <>Someone opened your link{e.source ? ` · via ${SOURCE_LABEL[e.source]}` : ""}</>
        ) : (
          <>
            <b>{e.count} people</b> opened your link in the last 5 minutes
          </>
        ),
      };
    case "claim":
      return {
        Icon: Spark,
        tone: "bg-brand-soft text-brand",
        text: (
          <>
            <b>{e.name}</b> claimed a {TIER_LABEL[e.tier]} Tikka
          </>
        ),
      };
    case "redeem":
      return {
        Icon: ScanLine,
        tone: "bg-success-soft text-success",
        text: (
          <>
            <b>{e.name}</b> redeemed{e.amount ? ` · ${naira(e.amount)}` : ""}
          </>
        ),
      };
    case "review":
      return {
        Icon: Star,
        tone: "bg-gold-soft text-gold-text",
        text: (
          <>
            <b>{e.name}</b> left a {e.rating}-star review
          </>
        ),
      };
  }
}

const watDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: WAT });

/** A folded day's label: "Yesterday", else "Sat 7 Nov". */
function dayLabel(iso: string, now: Date): string {
  const yesterday = new Date(now.getTime() - 86_400_000);
  return watDay(new Date(iso)) === watDay(yesterday) ? "Yesterday" : shortDate(iso);
}

/**
 * The feed's lines: earlier days' link opens folded into one line a day, the latest few shown and
 * the rest behind "Show more", so the box doesn't grow down the page.
 */
export function ActivityList({ events, now: nowIso }: { events: ActivityEvent[]; now: string }) {
  const [open, setOpen] = useState(false);
  const now = new Date(nowIso);
  const lines = foldOldViews(events, now);
  const shown = open ? lines : lines.slice(0, SHOWN);
  const hidden = lines.length - SHOWN;

  return (
    <>
      <ol className="mt-2 grid gap-1 px-3 pb-3 empty:hidden" aria-live="polite">
        {shown.map((e) => {
          const { text, Icon, tone } = describe(e);
          return (
            <li key={e.id} className="flex items-start gap-3 rounded-md px-2 py-2">
              <span className={`grid size-8 shrink-0 place-items-center rounded-pill ${tone}`}>
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 pt-0.5">
                <p className="text-body leading-5 [&_b]:font-semibold">{text}</p>
                <p className="text-caption mt-0.5 text-ink-muted">{e.kind === "views" && e.day ? dayLabel(e.at, now) : timeAgo(e.at, now)}</p>
              </div>
            </li>
          );
        })}
      </ol>
      {hidden > 0 && (
        <div className="border-t border-line px-3 py-1">
          <button type="button" className="text-label min-h-11 w-full rounded-md text-brand" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? "Show less" : `Show ${hidden} more`}
          </button>
        </div>
      )}
    </>
  );
}
