"use client";

// NEW DIRECTION, stage 3: "Move or cancel" on the booking pass, within the booking rules. Moving
// needs 24 hours' notice and keeps the deposit; cancelling doesn't refund it.

import { CalendarClock, CalendarX, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { slotLabel } from "@/lib/booking";
import { freeDays, PROBLEM_TEXT, watInstant, watParts, type BookingRules } from "@/lib/bookings";
import { Sheet } from "@/components/today/Sheet";

const naira = (kobo: number) => "₦" + Math.round(kobo / 100).toLocaleString("en-NG");

export function PassChange({ token, slug, minutes, eventDay, startsAt, depositKobo, rules }: { token: string; slug: string; minutes: number; eventDay: boolean; startsAt: string; depositKobo: number; rules: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<"menu" | "move" | "cancel" | null>(null);
  const [free, setFree] = useState<BookingRules | null>(null);
  const [dayKey, setDayKey] = useState<string | null>(null);
  const [time, setTime] = useState<number | null>(null);
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // The rule the owner wrote; the server checks the notice again.
  const notice = 86_400_000;
  const [canMove] = useState(() => new Date(startsAt).getTime() - Date.now() >= notice);
  const [minDate] = useState(() => new Date(Date.now() + notice).toISOString().slice(0, 10));
  const moveRule = rules.find((r) => /move/i.test(r)) ?? "To move your booking, tell us at least 24 hours before.";
  const days = useMemo(() => (free ? freeDays(free, minutes, new Date()).filter((d) => d.slots.length) : []), [free, minutes]);

  async function send(body: object) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/book-v2/change", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, ...body }) });
      const r = (await res.json()) as { ok: boolean; reason?: string };
      if (!r.ok) return setError(r.reason === "too_late" ? "It's too close to the time to move it. Message the business." : (PROBLEM_TEXT[r.reason ?? ""] ?? "Something went wrong. Try again."));
      setOpen(null);
      router.refresh();
    } catch {
      setError("Couldn't save. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  function startMove() {
    setOpen("move");
    if (!eventDay)
      void fetch(`/api/book?slug=${encodeURIComponent(slug)}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d: { rules: BookingRules | null }) => setFree(d.rules));
  }

  const keepMinute = watParts(startsAt).minute;
  return (
    <>
      <button type="button" className="biz-btn min-h-[52px] w-full border border-line-strong bg-surface-raised" onClick={() => setOpen("menu")}>
        <CalendarClock size={18} aria-hidden="true" /> Move or cancel
      </button>
      {open === "menu" && (
        <Sheet title="Move or cancel" onClose={() => setOpen(null)}>
          <p className="text-body rounded-md bg-surface-sunken px-4 py-3">{moveRule}</p>
          <button type="button" disabled={!canMove} onClick={startMove} className="flex min-h-17 w-full items-center gap-3.5 rounded-card border-2 border-line bg-surface-raised px-4 text-left disabled:opacity-50">
            <CalendarClock size={22} aria-hidden="true" />
            <span>
              <b className="block">Move to another {eventDay ? "date" : "time"}</b>
              <span className="text-caption text-ink-muted">{canMove ? "Your deposit moves with it" : "Too close to the time: message the business"}</span>
            </span>
          </button>
          <button type="button" onClick={() => setOpen("cancel")} className="flex min-h-17 w-full items-center gap-3.5 rounded-card border-2 border-line bg-surface-raised px-4 text-left">
            <CalendarX size={22} className="text-danger" aria-hidden="true" />
            <span>
              <b className="block">Cancel my booking</b>
              <span className="text-caption text-ink-muted">{depositKobo ? `The ${naira(depositKobo)} deposit isn't refunded` : "The business will be told"}</span>
            </span>
          </button>
        </Sheet>
      )}
      {open === "cancel" && (
        <Sheet title="Cancel this booking?" onClose={() => setOpen(null)}>
          <p className="text-body">{depositKobo ? `The ${naira(depositKobo)} deposit isn't refunded, as the booking rules say.` : "The time goes back to other customers."}</p>
          {error && <p role="alert" className="text-body text-danger">{error}</p>}
          <button type="button" className="btn btn-lg w-full rounded-pill bg-danger text-on-danger hover:bg-danger" disabled={busy} onClick={() => send({ kind: "cancel" })}>
            {busy && <Loader2 className="animate-spin" aria-hidden="true" />} Yes, cancel it
          </button>
          <button type="button" className="btn btn-secondary btn-lg w-full rounded-pill" onClick={() => setOpen(null)}>
            Keep my booking
          </button>
        </Sheet>
      )}
      {open === "move" && (
        <Sheet title={`Pick a new ${eventDay ? "date" : "time"}`} onClose={() => setOpen(null)}>
          {eventDay ? (
            <input type="date" aria-label="New date" className="input h-13" value={date} min={minDate} onChange={(e) => setDate(e.target.value)} />
          ) : !free ? (
            <Loader2 className="animate-spin justify-self-center text-ink-muted" aria-label="Loading free times" />
          ) : (
            <>
              <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
                {days.slice(0, 14).map((d) => (
                  <button
                    key={d.key}
                    type="button"
                    aria-pressed={dayKey === d.key}
                    onClick={() => {
                      setDayKey(d.key);
                      setTime(null);
                    }}
                    className={`grid min-h-17 w-16 shrink-0 content-center justify-items-center rounded-md border-2 ${dayKey === d.key ? "border-ink bg-ink text-surface" : "border-line bg-surface-raised"}`}
                  >
                    <small className="text-xs opacity-75">{d.short}</small>
                    <b className="text-xl">{d.date}</b>
                  </button>
                ))}
              </div>
              {dayKey && (
                <div className="grid grid-cols-3 gap-2">
                  {days
                    .find((d) => d.key === dayKey)
                    ?.slots.map((t) => (
                      <button key={t} type="button" aria-pressed={time === t} onClick={() => setTime(t)} className={`text-code min-h-12 rounded-md border ${time === t ? "border-ink bg-ink text-surface" : "border-line-strong bg-surface-raised"}`}>
                        {slotLabel(t)}
                      </button>
                    ))}
                </div>
              )}
            </>
          )}
          {error && <p role="alert" className="text-body text-danger">{error}</p>}
          <button
            type="button"
            className="btn btn-lg w-full rounded-pill bg-ink text-surface hover:bg-ink"
            disabled={busy || (eventDay ? !date : !dayKey || time === null)}
            onClick={() => send({ kind: "move", startsAt: new Date(eventDay ? watInstant(date, keepMinute) : watInstant(dayKey!, time!)).toISOString() })}
          >
            {busy && <Loader2 className="animate-spin" aria-hidden="true" />} Move my booking
          </button>
        </Sheet>
      )}
    </>
  );
}
