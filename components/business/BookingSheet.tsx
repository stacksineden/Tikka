"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ActionIcon } from "@/components/tikka/ActionIcon";
import { bookingDays, bookingMessage, slotLabel, whatsappLink, type BookingDay } from "@/lib/booking";
import type { OpeningHours } from "@/lib/types";

/**
 * The booking sheet (PRD A5, "Booking a time"). Every Book link on the business page carries
 * `data-book` (and, on a service card, `data-book-name` and `data-book-price`); a tap opens this
 * sheet instead of following the link. The link's own href is the plain WhatsApp booking message,
 * so Book still works before this script loads. Pick a day, one or two times, then WhatsApp opens
 * with the request written. Nothing is stored: the business confirms on WhatsApp.
 */
export function BookingSheet({ business, number, hours }: { business: string; number: string; hours?: OpeningHours | null }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [service, setService] = useState<{ name: string; price: string } | null>(null);
  const [days, setDays] = useState<BookingDay[]>([]);
  const [dayKey, setDayKey] = useState<string | null>(null);
  const [times, setTimes] = useState<number[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const el = (e.target as Element | null)?.closest<HTMLElement>("[data-book]");
      if (!el) return;
      e.preventDefault();
      const next = bookingDays(new Date(), hours);
      setService(el.dataset.bookName ? { name: el.dataset.bookName, price: el.dataset.bookPrice ?? "" } : null);
      setDays(next);
      setDayKey(next.find((d) => d.slots.length)?.key ?? null);
      setTimes([]);
      setError("");
      ref.current?.showModal();
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [hours]);

  const day = days.find((d) => d.key === dayKey);
  const anyOpen = days.some((d) => d.slots.length);
  const what = service ? (service.price ? `${service.name} (${service.price})` : service.name) : "";
  const ready = day && times.length > 0;
  const href = ready ? whatsappLink(number, bookingMessage(business, what, day.label, times[0], times[1])) : undefined;
  const plain = whatsappLink(number, service ? `Hi ${business}, I'd like to book ${what}.` : `Hi ${business}, I'd like to book an appointment.`);

  function pickTime(t: number) {
    setError("");
    setTimes((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : cur.length < 2 ? [...cur, t] : [cur[0], t]));
  }

  function close() {
    ref.current?.close();
  }

  return (
    <dialog
      ref={ref}
      className="biz-sheet"
      aria-labelledby="book-title"
      onClick={(e) => {
        // A tap on the dimmed backdrop (the dialog itself, outside its panel) closes it.
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="biz-sheet-panel">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id="book-title" className="biz-serif text-[26px] leading-tight tracking-[-0.01em]">
              {service ? `Book ${service.name}` : "Book an appointment"}
            </h2>
            <p className="text-body mt-0.5 text-ink-muted">{service?.price ? `${business} · ${service.price}` : business}</p>
          </div>
          <button type="button" onClick={close} className="biz-sheet-x" aria-label="Close">
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {anyOpen ? (
          <>
            <p className="biz-sheet-label">Pick a day</p>
            <div className="biz-sheet-days" role="radiogroup" aria-label="Day">
              {days.map((d) => (
                <button
                  key={d.key}
                  type="button"
                  role="radio"
                  aria-checked={d.key === dayKey}
                  aria-label={d.slots.length ? d.label : `${d.label}, closed`}
                  disabled={!d.slots.length}
                  onClick={() => (setDayKey(d.key), setTimes([]), setError(""))}
                  className="biz-chip biz-day"
                >
                  <span className="text-[12px] font-semibold uppercase tracking-[0.06em]">{d.short}</span>
                  <span className="text-[18px] font-extrabold">{d.date}</span>
                </button>
              ))}
            </div>

            <p className="biz-sheet-label">Pick a time</p>
            {day?.slots.length ? (
              <div className="grid grid-cols-4 gap-2" role="group" aria-label={`Times on ${day.label}`}>
                {day.slots.map((t) => {
                  const i = times.indexOf(t);
                  return (
                    <button key={t} type="button" aria-pressed={i >= 0} data-second={i === 1 || undefined} onClick={() => pickTime(t)} className="biz-chip min-h-11 text-[14px] font-semibold">
                      {slotLabel(t).replace(":00", "")}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-body text-ink-muted">Pick a day to see the times.</p>
            )}
            <p className="text-caption mt-2 text-ink-muted">Tap a second time if you&apos;re flexible (optional). Times are West Africa Time.</p>

            <a
              href={href ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="biz-btn mt-6 min-h-[52px] w-full bg-ink text-surface-raised"
              onClick={(e) => {
                if (!day || !times.length) {
                  e.preventDefault();
                  setError(day ? "Pick a time first." : "Pick a day first.");
                  return;
                }
                // Let the link open WhatsApp, then put the sheet away.
                setTimeout(close, 0);
              }}
            >
              <ActionIcon kind="whatsapp" />
              Send on WhatsApp
            </a>
            <p role="alert" className="text-caption mt-2 min-h-5 text-danger">
              {error}
            </p>
            <p className="text-caption text-center text-ink-muted">{business} will confirm your time on WhatsApp.</p>
          </>
        ) : (
          <>
            <p className="text-body mt-6 text-ink-muted">No open days in the next two weeks. Message {business} to find a time.</p>
            <a href={plain} target="_blank" rel="noopener noreferrer" className="biz-btn mt-4 min-h-[52px] w-full bg-ink text-surface-raised" onClick={() => setTimeout(close, 0)}>
              <ActionIcon kind="whatsapp" />
              Message on WhatsApp
            </a>
          </>
        )}
      </div>
    </dialog>
  );
}
