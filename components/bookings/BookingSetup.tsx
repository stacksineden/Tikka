"use client";

import { ChevronDown, Minus, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveBookingSettingsAction } from "@/app/app/bookings-actions";
import { slotLabel } from "@/lib/booking";
import { DEFAULT_MINUTES, lengthLabel, LENGTHS, openRange } from "@/lib/bookings";
import type { OpeningHours } from "@/lib/types";

const NOTICE: [number, string][] = [
  [0, "No notice"],
  [30, "30 minutes"],
  [60, "1 hour"],
  [120, "2 hours"],
  [240, "4 hours"],
  [720, "12 hours"],
  [1440, "1 day"],
  [2880, "2 days"],
];
const AHEAD: [number, string][] = [
  [14, "2 weeks"],
  [31, "1 month"],
  [62, "2 months"],
  [92, "3 months"],
  [183, "6 months"],
];

function hoursLine(hours: OpeningHours | null | undefined): string[] {
  const row = (label: string, wd: number) => {
    const r = openRange(hours, wd);
    return `${label}: ${r ? `${slotLabel(r[0])} – ${slotLabel(r[1])}` : "closed"}`;
  };
  return [row("Mon–Fri", 1), row("Saturday", 6), row("Sunday", 0)];
}

/**
 * Setting bookings up (docs/BOOKINGS.md journey 0), and changing them later: opening hours (from
 * the business page), how many customers at the same time, how long each service takes. Notice
 * and how far ahead are under More options.
 */
export function BookingSetup({
  first,
  hours,
  services,
  initial,
}: {
  first: boolean;
  hours: OpeningHours | null | undefined;
  services: { id: string; name: string }[];
  initial: { enabled: boolean; capacity: number; noticeMinutes: number; aheadDays: number; minutes: Record<string, number | null> };
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(first ? true : initial.enabled);
  const [capacity, setCapacity] = useState(initial.capacity);
  const [notice, setNotice] = useState(initial.noticeMinutes);
  const [ahead, setAhead] = useState(initial.aheadDays);
  const [minutes, setMinutes] = useState<Record<string, number | null>>(initial.minutes);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  function save() {
    setError("");
    setSaved(false);
    start(async () => {
      const r = await saveBookingSettingsAction({ enabled, capacity, noticeMinutes: notice, aheadDays: ahead, minutes });
      if (!r.ok) return setError(r.error);
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4">
      <section className="rounded-card border border-line bg-surface-raised p-4 sm:p-5">
        <h2 className="text-title">1. Your opening hours</h2>
        <p className="text-body mt-1 text-ink-muted">Customers can only book inside these.</p>
        <ul className="text-body mt-3 grid gap-1">
          {hoursLine(hours).map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        <Link href="/app/settings/profile#about" className="btn btn-secondary mt-3">
          Change opening hours
        </Link>
      </section>

      <section className="rounded-card border border-line bg-surface-raised p-4 sm:p-5">
        <h2 className="text-title">2. How many customers can you serve at the same time?</h2>
        <p className="text-body mt-1 text-ink-muted">1 if it&apos;s just you. 3 if you have 3 chairs and 3 people working.</p>
        <div className="mt-3 flex items-center gap-3">
          <button type="button" className="grid size-12 place-items-center rounded-pill border border-line-strong" aria-label="One fewer" disabled={capacity <= 1} onClick={() => setCapacity((c) => Math.max(1, c - 1))}>
            <Minus size={20} aria-hidden="true" />
          </button>
          <span className="min-w-10 text-center font-mono text-[28px] tabular-nums" aria-live="polite">
            {capacity}
          </span>
          <button type="button" className="grid size-12 place-items-center rounded-pill border border-line-strong" aria-label="One more" disabled={capacity >= 20} onClick={() => setCapacity((c) => Math.min(20, c + 1))}>
            <Plus size={20} aria-hidden="true" />
          </button>
        </div>
      </section>

      <section className="rounded-card border border-line bg-surface-raised p-4 sm:p-5">
        <h2 className="text-title">3. How long does each service take?</h2>
        <p className="text-body mt-1 text-ink-muted">So nobody gets booked on top of someone else.</p>
        {services.length === 0 ? (
          <p className="text-body mt-3">
            Add your services first.{" "}
            <Link href="/app/page#services" className="font-semibold text-brand underline">
              Add services
            </Link>
          </p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {services.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3">
                <label htmlFor={`len-${s.id}`} className="text-body min-w-0 truncate font-medium">
                  {s.name}
                </label>
                <select
                  id={`len-${s.id}`}
                  className="input w-36 shrink-0"
                  value={minutes[s.id] ?? ""}
                  onChange={(e) => setMinutes((m) => ({ ...m, [s.id]: e.target.value ? Number(e.target.value) : null }))}
                >
                  <option value="">{lengthLabel(DEFAULT_MINUTES)} (not set)</option>
                  {LENGTHS.map((l) => (
                    <option key={l} value={l}>
                      {lengthLabel(l)}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        )}
      </section>

      <details className="group rounded-card border border-line bg-surface-raised p-4 sm:p-5">
        <summary className="text-label flex min-h-11 cursor-pointer list-none items-center justify-between">
          More options
          <ChevronDown size={20} className="transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="mt-3 grid gap-4">
          <label className="grid gap-1">
            <span className="text-label">How much notice do you need?</span>
            <select className="input" value={notice} onChange={(e) => setNotice(Number(e.target.value))}>
              {NOTICE.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-label">How far ahead can people book?</span>
            <select className="input" value={ahead} onChange={(e) => setAhead(Number(e.target.value))}>
              {AHEAD.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          {!first && (
            <label className="flex min-h-11 items-start gap-3">
              <input type="checkbox" className="mt-1 size-5 shrink-0" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              <span className="text-body">
                Take bookings on my page
                <span className="text-caption block text-ink-muted">Off: Book goes back to a WhatsApp message. Bookings you already have stay.</span>
              </span>
            </label>
          )}
        </div>
      </details>

      <div className="grid gap-2">
        <button type="button" className="btn min-h-[52px]" disabled={pending || services.length === 0} onClick={save}>
          {pending ? "Saving…" : first ? "Start taking bookings" : "Save"}
        </button>
        <p role="alert" className="text-caption min-h-5 text-danger">
          {error}
        </p>
        {saved && !first && <p className="text-caption text-success">Saved.</p>}
      </div>
    </div>
  );
}
