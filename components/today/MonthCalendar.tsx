"use client";

// NEW DIRECTION: "See my calendar". A month at a glance: which days are full, which have free
// times, which are closed, and how many customers each day has.

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

export interface MonthDay {
  key: string;
  state: "free" | "full" | "closed" | "past";
  bookings: number;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["S", "M", "T", "W", "T", "F", "S"];

export function MonthCalendar({ days, todayKey }: { days: MonthDay[]; todayKey: string }) {
  const byKey = new Map(days.map((d) => [d.key, d]));
  const months = [...new Set(days.map((d) => d.key.slice(0, 7)))];
  const [i, setI] = useState(0);
  const month = months[i] ?? todayKey.slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const inMonth = days.filter((d) => d.key.startsWith(month));
  const full = inMonth.filter((d) => d.state === "full").length;
  const free = inMonth.filter((d) => d.state === "free").length;

  return (
    <section id="month" className="grid gap-3 rounded-card border border-line bg-surface-raised p-4" aria-label="Your month">
      <div className="flex items-center justify-between">
        <button type="button" className="grid size-11 place-items-center disabled:opacity-30" disabled={i === 0} onClick={() => setI(i - 1)} aria-label="Previous month">
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <div className="text-center">
          <b>
            {MONTHS[m - 1]} {y}
          </b>
          <span className="text-caption block text-ink-muted">
            {free} days with free times · {full} full
          </span>
        </div>
        <button type="button" className="grid size-11 place-items-center disabled:opacity-30" disabled={i >= months.length - 1} onClick={() => setI(i + 1)} aria-label="Next month">
          <ChevronRight size={20} aria-hidden="true" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {DOW.map((d, k) => (
          <span key={k} className="text-caption pb-1 font-semibold text-ink-muted">
            {d}
          </span>
        ))}
        {Array.from({ length: first }, (_, k) => (
          <span key={`e${k}`} />
        ))}
        {Array.from({ length: dim }, (_, k) => {
          const key = `${month}-${String(k + 1).padStart(2, "0")}`;
          const d = byKey.get(key);
          const state = d?.state ?? (key < todayKey ? "past" : "closed");
          const tone =
            state === "full" ? "bg-gold-soft text-gold-text" : state === "free" ? "bg-success-soft text-success" : state === "closed" ? "bg-surface-sunken text-ink-muted" : "text-ink-muted/50";
          return (
            <div
              key={key}
              className={`grid aspect-square min-w-0 content-center rounded-md text-[15px] leading-4 font-semibold ${tone} ${key === todayKey ? "ring-2 ring-ink" : ""}`}
              aria-label={`${k + 1}: ${state === "full" ? "full" : state === "free" ? "free times" : state === "closed" ? "closed" : "past"}${d?.bookings ? `, ${d.bookings} booked` : ""}`}
            >
              {k + 1}
              {d && d.bookings > 0 && state !== "past" && <small className="text-[10px] font-semibold">{d.bookings} in</small>}
            </div>
          );
        })}
      </div>
      <div className="text-caption flex flex-wrap gap-x-4 gap-y-1 text-ink-muted">
        <span className="inline-flex items-center gap-1.5">
          <i className="size-3 rounded-sm bg-success-soft" aria-hidden="true" /> Free times
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="size-3 rounded-sm bg-gold-soft" aria-hidden="true" /> Full
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="size-3 rounded-sm bg-surface-sunken" aria-hidden="true" /> Closed
        </span>
      </div>
    </section>
  );
}
