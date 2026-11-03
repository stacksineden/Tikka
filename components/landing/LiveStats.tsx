"use client";

import { useEffect, useRef, useState } from "react";
import { TIER_LABEL } from "@/components/tikka/RarityBadge";
import { count, nairaShort, timeAgo } from "@/lib/format";
import { STAT_KEYS, STAT_LABEL, type PlatformStats, type StatKey } from "@/lib/stats";

const POLL_MS = 20_000;
const FEED_MS = 4_000;

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return reduced;
}

/** Counts from the last value shown to the new one (transform-free: only text changes). */
function CountUp({ value, format, reduced }: { value: number; format: (n: number) => string; reduced: boolean }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);

  useEffect(() => {
    const start = from.current;
    if (reduced || start === value) {
      from.current = value;
      setShown(value);
      return;
    }
    const t0 = performance.now();
    const dur = 1200;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(start + (value - start) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    // Safety net: if animation frames are paused (background tab, power saving), still land on the number.
    const done = setTimeout(() => {
      cancelAnimationFrame(raf);
      from.current = value;
      setShown(value);
    }, dur + 100);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(done);
      from.current = value;
    };
  }, [value, reduced]);

  return <>{format(shown)}</>;
}

const FORMAT: Record<StatKey, (n: number) => string> = {
  tikkasClaimed: count,
  businesses: count,
  dropsLive: count,
  recordedSales: nairaShort,
};

/**
 * "Live on Tikka": real platform numbers and a feed of real claims, refreshed every 20 s. Each
 * part only shows above its threshold (lib/stats.ts); with neither, nothing renders.
 */
export function LiveStats({ initial }: { initial: PlatformStats }) {
  const [stats, setStats] = useState(initial);
  const [feed, setFeed] = useState(0);
  const reduced = useReducedMotion();

  // Poll while the tab is visible.
  useEffect(() => {
    let live = true;
    const load = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/stats", { cache: "no-store" });
        if (res.ok && live) setStats(await res.json());
      } catch {
        // Offline or blocked: keep the last numbers.
      }
    };
    load();
    const id = setInterval(load, POLL_MS);
    document.addEventListener("visibilitychange", load);
    return () => {
      live = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", load);
    };
  }, []);

  // Rotate the live feed.
  useEffect(() => {
    if (reduced || stats.recent.length < 2) return;
    const id = setInterval(() => setFeed((f) => (f + 1) % stats.recent.length), FEED_MS);
    return () => clearInterval(id);
  }, [reduced, stats.recent.length]);

  const keys = stats.show.bar ? STAT_KEYS : [];
  const item = stats.show.ticker ? stats.recent[feed % Math.max(1, stats.recent.length)] : undefined;
  const now = new Date(stats.asOf);
  if (!keys.length && !item) return null;

  return (
    <section aria-labelledby="live-title" className="border-t border-night-raised">
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-6 lg:py-10">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <h2 id="live-title" className="text-label flex items-center gap-2 text-on-night">
            <span className="counter__dot" aria-hidden="true" />
            Live on Tikka
          </h2>
          {item && (
            <p className="text-caption min-h-8 min-w-0 max-w-full text-on-night-muted sm:min-h-0 sm:truncate" aria-live="off">
              <span key={item.id} className="live-feed-in inline-block">
                {/^[aeiou]/i.test(TIER_LABEL[item.tier]) ? "An" : "A"} <span className="text-on-night">{TIER_LABEL[item.tier]}</span> Tikka was just
                claimed at <span className="text-on-night">{item.businessName}</span> · {item.city} · {timeAgo(item.at, now)}
              </span>
            </p>
          )}
        </div>

        {keys.length > 0 && (
          <dl className={`mt-6 grid gap-px overflow-hidden rounded-card bg-night-raised grid-cols-2 ${keys.length >= 4 ? "lg:grid-cols-4" : ""}`}>
            {keys.map((k) => (
              <div key={k} className="bg-night p-4 sm:p-6">
                <dt className="text-caption text-on-night-muted">{STAT_LABEL[k]}</dt>
                <dd className="mt-1 text-[32px] font-extrabold leading-9 tracking-[-0.02em] text-on-night tabular-nums sm:text-[40px] sm:leading-[44px]">
                  <CountUp value={stats[k]} format={FORMAT[k]} reduced={reduced} />
                </dd>
              </div>
            ))}
          </dl>
        )}
        <p className="sr-only">
          {keys.map((k) => `${STAT_LABEL[k]}: ${FORMAT[k](stats[k])}`).join(". ")}
        </p>
      </div>
    </section>
  );
}
