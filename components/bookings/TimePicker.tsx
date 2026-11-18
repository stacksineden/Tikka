"use client";

import { useMemo, useState } from "react";
import { slotLabel } from "@/lib/booking";
import { freeDays, watInstant, type BookingRules } from "@/lib/bookings";

/** Every half hour from 6am to 10pm, any day: for "Fit them in anyway". */
const ANY_TIME = {
  weekdays: { open: true, from: "06:00", to: "22:00" },
  saturday: { open: true, from: "06:00", to: "22:00" },
  sunday: { open: true, from: "06:00", to: "22:00" },
};

/**
 * Pick a day (a scrolling row) and a free time for a service of `minutes`. With `force`, every
 * half hour shows, full or not (the owner knows she can fit them in). Calls onPick with the ISO
 * time, or null when nothing is picked.
 */
export function TimePicker({ rules, minutes, force, onPick }: { rules: BookingRules; minutes: number; force: boolean; onPick: (iso: string | null) => void }) {
  const days = useMemo(
    () => freeDays(force ? { ...rules, hours: ANY_TIME, busy: [], blocked: [], noticeMinutes: 0, capacity: 999 } : rules, minutes, new Date()),
    [rules, minutes, force],
  );
  const [dayKey, setDayKey] = useState<string | null>(() => days.find((d) => d.slots.length)?.key ?? null);
  const [time, setTime] = useState<number | null>(null);
  const day = days.find((d) => d.key === dayKey) ?? days.find((d) => d.slots.length);

  function pick(d: string, t: number | null) {
    setDayKey(d);
    setTime(t);
    onPick(t === null ? null : new Date(watInstant(d, t)).toISOString());
  }

  if (!days.some((d) => d.slots.length)) return <p className="text-body mt-4 text-ink-muted">No free times. Turn on &quot;Fit them in anyway&quot; to pick any time.</p>;

  return (
    <div className="mt-4 grid gap-3">
      <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none]" role="radiogroup" aria-label="Day">
        <div className="flex gap-2">
          {days.slice(0, 60).map((d) => (
            <button
              key={d.key}
              type="button"
              role="radio"
              aria-checked={d.key === day?.key}
              disabled={!d.slots.length}
              onClick={() => pick(d.key, null)}
              className={`grid min-h-14 min-w-14 shrink-0 place-items-center rounded-md border px-2 py-1 text-center disabled:opacity-35 ${
                d.key === day?.key ? "border-brand bg-brand-soft text-brand" : "border-line-strong bg-surface-raised"
              }`}
            >
              <span className="text-caption">{d.short}</span>
              <span className="text-[17px] font-semibold tabular-nums">{d.date}</span>
            </button>
          ))}
        </div>
      </div>
      {day && (
        <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label={`Times on ${day.label}`}>
          {day.slots.map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={t === time && day.key === dayKey}
              onClick={() => pick(day.key, t)}
              className={`min-h-11 rounded-md border text-[14px] font-semibold ${t === time && day.key === dayKey ? "border-brand bg-brand text-on-brand" : "border-line-strong bg-surface-raised"}`}
            >
              {slotLabel(t).replace(":00", "")}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
