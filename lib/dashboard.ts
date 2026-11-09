// Drop dashboard maths (PRD B6, TECH_PLAN §12). Pure, so every number is pinned by tests; the
// real numbers come from `events` + `claims` (and drop_daily_stats for charts).

import { WAT } from "./format";
import type { ActivityEvent, Source } from "./types";

export interface FunnelStep {
  key: string;
  label: string;
  count: number;
  /** % of the step before (null for the first). */
  ofPrev: number | null;
}

/** The 7-step link funnel, each with % of the step before. */
export function funnel(counts: { opened: number; tore: number; tapped: number; continued: number; claimed: number; redeemed: number; followedUp: number }): FunnelStep[] {
  const steps: [string, string, number][] = [
    ["opened", "Opened the link", counts.opened],
    ["tore", "Tore open the wrapper", counts.tore],
    ["tapped", "Tapped Claim", counts.tapped],
    ["continued", "Continued to WhatsApp", counts.continued],
    ["claimed", "Claimed", counts.claimed],
    ["redeemed", "Redeemed", counts.redeemed],
    ["followedUp", "Followed up", counts.followedUp],
  ];
  return steps.map(([key, label, count], i) => ({
    key,
    label,
    count,
    ofPrev: i === 0 ? null : steps[i - 1][2] > 0 ? Math.round((count / steps[i - 1][2]) * 100) : 0,
  }));
}

/**
 * Suggested next size (TECH_PLAN §12): unique viewers after sell-out × the drop's claim rate
 * + claims, rounded up to the nearest 50.
 */
export function suggestNextSize(viewersAfterSellout: number, uniqueViewers: number, claims: number): number {
  const rate = uniqueViewers > 0 ? claims / uniqueViewers : 0;
  return Math.ceil((viewersAfterSellout * rate + claims) / 50) * 50;
}

/** Bursts of views become one line: "14 people opened your link in the last 5 minutes". */
export function groupViews(views: { at: string; source: Source }[], windowMs = 5 * 60_000): ActivityEvent[] {
  const sorted = [...views].sort((a, b) => b.at.localeCompare(a.at));
  const out: ActivityEvent[] = [];
  let i = 0;
  while (i < sorted.length) {
    const start = new Date(sorted[i].at).getTime();
    let j = i;
    while (j + 1 < sorted.length && start - new Date(sorted[j + 1].at).getTime() < windowMs) j++;
    const group = sorted.slice(i, j + 1);
    const sources = new Set(group.map((v) => v.source));
    out.push({
      id: `v_${sorted[i].at}`,
      kind: "views",
      count: group.length,
      source: sources.size === 1 && group[0].source !== "direct" ? group[0].source : undefined,
      at: sorted[i].at,
    });
    i = j + 1;
  }
  return out;
}

const watDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: WAT });

/**
 * The live feed, shorter: link opens from before today (WAT) become one line per day, placed at
 * that day's latest open. Claims, redemptions, reviews and today's opens stay as they are.
 */
export function foldOldViews(events: ActivityEvent[], now: Date): ActivityEvent[] {
  const today = watDay(now.toISOString());
  const days = new Map<string, Extract<ActivityEvent, { kind: "views" }>>();
  const out: ActivityEvent[] = [];
  for (const e of [...events].sort((a, b) => b.at.localeCompare(a.at))) {
    const day = e.kind === "views" ? watDay(e.at) : today;
    if (e.kind !== "views" || day === today) {
      out.push(e);
      continue;
    }
    const seen = days.get(day);
    if (seen) {
      seen.count += e.count;
      if (seen.source !== e.source) seen.source = undefined;
    } else {
      const line = { id: `vd_${day}`, kind: "views" as const, count: e.count, source: e.source, at: e.at, day: true as const };
      days.set(day, line);
      out.push(line);
    }
  }
  return out;
}

/** "28%" from 0.28; claim rate per channel. */
export function rate(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "–";
}
