"use client";

import { Film, Loader2, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { capturePoster, readVideo } from "@/lib/media-client";
import { DEFAULT_HOURS, LIMITS, type Errors } from "@/lib/setup";
import type { Business, DayHours, OpeningHours } from "@/lib/types";
import { FieldShell } from "./Fields";

/* -------------------------------------------------------------- hours */

const DAYS: { key: keyof OpeningHours; label: string }[] = [
  { key: "weekdays", label: "Mon – Fri" },
  { key: "saturday", label: "Saturday" },
  { key: "sunday", label: "Sunday" },
];

const TIMES = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);

function timeLabel(t: string) {
  const [h, m] = t.split(":").map(Number);
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}${m ? ":30" : ""}${h >= 12 ? "pm" : "am"}`;
}

export function HoursField({
  value,
  onChange,
  errors,
}: {
  value?: OpeningHours;
  onChange: (v: OpeningHours | undefined) => void;
  errors: Errors;
}) {
  if (!value) {
    return (
      <FieldShell label="Opening hours">
        <button type="button" className="btn btn-secondary justify-self-start" onClick={() => onChange(DEFAULT_HOURS)}>
          <Plus />
          Add opening hours
        </button>
      </FieldShell>
    );
  }
  const set = (k: keyof OpeningHours, d: Partial<DayHours>) => onChange({ ...value, [k]: { ...value[k], ...d } });
  return (
    <FieldShell label="Opening hours">
      <ul className="divide-y divide-line rounded-md border border-line bg-surface-raised">
        {DAYS.map(({ key, label }) => {
          const d = value[key];
          return (
            <li key={key} className="grid gap-2 p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-body font-semibold">{label}</span>
                <label className="text-label flex min-h-11 cursor-pointer items-center gap-2 text-ink-muted">
                  {d.open ? "Open" : "Closed"}
                  <input
                    type="checkbox"
                    role="switch"
                    checked={d.open}
                    onChange={(e) => set(key, { open: e.target.checked })}
                    className="peer sr-only"
                  />
                  <span
                    className="relative h-7 w-12 rounded-pill bg-line-strong/50 transition-colors peer-checked:bg-success peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand after:absolute after:left-1 after:top-1 after:size-5 after:rounded-pill after:bg-surface-raised after:transition-transform peer-checked:after:translate-x-5"
                    aria-hidden="true"
                  />
                </label>
              </div>
              {d.open && (
                <div className="flex items-center gap-2">
                  <select
                    className="input"
                    value={d.from}
                    onChange={(e) => set(key, { from: e.target.value })}
                    aria-label={`${label} opens`}
                  >
                    {TIMES.map((t) => (
                      <option key={t} value={t}>
                        {timeLabel(t)}
                      </option>
                    ))}
                  </select>
                  <span className="text-body text-ink-muted">to</span>
                  <select
                    className="input"
                    value={d.to}
                    onChange={(e) => set(key, { to: e.target.value })}
                    aria-label={`${label} closes`}
                  >
                    {TIMES.map((t) => (
                      <option key={t} value={t}>
                        {timeLabel(t)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {errors[`hours-${key}`] && (
                <p role="alert" className="text-caption font-semibold text-danger">
                  {errors[`hours-${key}`]}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </FieldShell>
  );
}

/* ----------------------------------------------------------- services */

export function ServicesField({
  value,
  onChange,
  errors,
}: {
  value: Business["services"];
  onChange: (v: Business["services"]) => void;
  errors: Errors;
}) {
  const set = (i: number, p: Partial<Business["services"][number]>) => onChange(value.map((s, j) => (j === i ? { ...s, ...p } : s)));
  return (
    <FieldShell
      label="Services and prices"
      hint="Shown on your card's Services tab. The price is optional: leave it empty if it varies."
      counter={`${value.length} / ${LIMITS.services}`}
      error={errors.services}
    >
      {value.length > 0 && (
        <ul className="grid gap-2">
          {value.map((s, i) => (
            <li key={i} className="grid gap-1">
              <div className="grid grid-cols-[minmax(0,1fr)_44px] items-center gap-2 rounded-md border border-line p-2 sm:grid-cols-[minmax(0,1fr)_11rem_44px] sm:border-0 sm:p-0">
                <input
                  className="input col-span-2 min-w-0 sm:col-span-1"
                  value={s.name}
                  placeholder="Service, e.g. Signature facial"
                  maxLength={40}
                  aria-label={`Service ${i + 1} name`}
                  aria-invalid={!!errors[`service-${i}`]}
                  onChange={(e) => set(i, { name: e.target.value })}
                />
                <div className="relative min-w-0">
                  <span className="text-body pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden="true">
                    ₦
                  </span>
                  <PriceInput
                    value={s.price}
                    label={`Service ${i + 1} price in naira (optional)`}
                    onChange={(price) => set(i, { price })}
                  />
                </div>
                <button
                  type="button"
                  className="grid size-11 shrink-0 place-items-center rounded-md text-ink-muted hover:bg-surface-sunken"
                  onClick={() => onChange(value.filter((_, j) => j !== i))}
                  aria-label={`Remove ${s.name || `service ${i + 1}`}`}
                >
                  <Trash2 size={18} aria-hidden="true" />
                </button>
              </div>
              {errors[`service-${i}`] && (
                <p role="alert" className="text-caption font-semibold text-danger">
                  {errors[`service-${i}`]}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {value.length < LIMITS.services && (
        <button type="button" className="btn btn-secondary justify-self-start" onClick={() => onChange([...value, { name: "", price: null }])}>
          <Plus />
          Add a service
        </button>
      )}
    </FieldShell>
  );
}

/* -------------------------------------------------------------- video */

export function VideoField({
  hasVideo,
  posterUrl,
  onChange,
}: {
  hasVideo: boolean;
  posterUrl?: string;
  onChange: (v: { hasVideo: boolean; videoPosterUrl?: string }) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [duration, setDuration] = useState<number>();
  const [frame, setFrame] = useState(0);

  // Capture a new poster when the frame slider moves (only for a clip picked in this session).
  useEffect(() => {
    const v = videoRef.current;
    if (!v || duration === undefined) return;
    let live = true;
    const t = setTimeout(async () => {
      const poster = await capturePoster(v, frame);
      if (live) onChange({ hasVideo: true, videoPosterUrl: poster });
    }, 150);
    return () => {
      live = false;
      clearTimeout(t);
    };
    // onChange is a fresh closure each render; frame and duration drive this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame, duration]);

  async function pick(file?: File) {
    if (!file) return;
    setBusy(true);
    setProblem(undefined);
    try {
      const info = await readVideo(file);
      videoRef.current = info.video;
      const start = Math.min(1, info.duration / 2);
      setFrame(start);
      setDuration(info.duration);
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <FieldShell
      label="Video"
      hint={`One clip up to ${LIMITS.videoSeconds} seconds and 20 MB (MP4 or MOV). It plays on your card's Video tab.`}
      error={problem}
    >
      {hasVideo && posterUrl ? (
        <div className="grid gap-3 rounded-md border border-line bg-surface-raised p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={posterUrl} alt="Your video's cover frame" className="aspect-video w-full rounded-sm bg-surface-sunken object-cover" />
          {duration !== undefined && (
            <label className="grid gap-1">
              <span className="text-label">Cover frame · {frame.toFixed(1)}s</span>
              <input
                type="range"
                min={0}
                max={Math.max(0, duration - 0.1)}
                step={0.1}
                value={frame}
                onChange={(e) => setFrame(Number(e.target.value))}
                className="h-11 w-full accent-[var(--brand)]"
              />
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => input.current?.click()} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Film />}
              Change video
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                videoRef.current = null;
                setDuration(undefined);
                onChange({ hasVideo: false, videoPosterUrl: undefined });
              }}
            >
              <Trash2 />
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn btn-secondary justify-self-start" onClick={() => input.current?.click()} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Film />}
          {busy ? "Reading video…" : "Add a video"}
        </button>
      )}
      <input ref={input} type="file" accept="video/mp4,video/quicktime,.mp4,.mov" hidden onChange={(e) => pick(e.target.files?.[0])} />
    </FieldShell>
  );
}

/** Naira amount, optional. Plain digits while typing (so the cursor never jumps), commas once you leave it. */
function PriceInput({ value, onChange, label }: { value: number | null; onChange: (v: number | null) => void; label: string }) {
  const [focused, setFocused] = useState(false);
  const shown = value === null ? "" : focused ? String(value) : value.toLocaleString("en-NG");
  return (
    <input
      className="input pl-7 tabular-nums"
      value={shown}
      placeholder="Price (optional)"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      aria-label={label}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 9);
        onChange(digits ? Number(digits) : null);
      }}
    />
  );
}
