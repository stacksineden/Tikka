"use client";

import { ArrowLeft, ChevronLeft, ChevronRight, Clock, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ActionIcon } from "@/components/tikka/ActionIcon";
import { bookingMonths, slotLabel, whatsappLink, type BookingDay } from "@/lib/booking";
import { freeDays, lengthLabel, PROBLEM_TEXT, watInstant, whenLabel, type BookingRules } from "@/lib/bookings";

export interface SheetService {
  id: string;
  name: string;
  minutes: number;
  price: string;
}

type Step = "service" | "time" | "details" | "booked";

/** "Book a time to use it" (journey 11b): the Tikka from the card link; its name and number stay on the server. */
export interface SheetTikka {
  token: string;
  name: string;
  /** The last WAT day it can be booked on. */
  until: string;
  reward: string;
  booking?: { token: string; startsAt: string; service: string };
}

/**
 * The booking calendar (docs/BOOKINGS.md journey 1). Every Book link on the business page carries
 * `data-book` (a service card also `data-book-id`); a tap opens this sheet instead of the link.
 * Pick a service, a free time (only free times show), then first name and WhatsApp number: Book
 * stores the booking and opens the customer's pass. Free times are fetched fresh on every open.
 */
export function CalendarSheet({
  slug,
  business,
  number,
  services,
  tikka,
}: {
  slug: string;
  business: string;
  number: string | null;
  services: SheetService[];
  tikka?: SheetTikka;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [step, setStep] = useState<Step>(tikka?.booking ? "booked" : "service");
  const [service, setService] = useState<SheetService | null>(null);
  const [rules, setRules] = useState<BookingRules | null>(null);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState<BookingDay[]>([]);
  const [dayKey, setDayKey] = useState<string | null>(null);
  const [monthIdx, setMonthIdx] = useState(0);
  const [time, setTime] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [offers, setOffers] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function loadRules(): Promise<BookingRules | null> {
    setLoading(true);
    try {
      const res = await fetch(`/api/book?slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
      const data = (await res.json()) as { rules: BookingRules | null };
      setRules(data.rules);
      return data.rules;
    } catch {
      setError("Couldn't load the free times. Check your connection.");
      return null;
    } finally {
      setLoading(false);
    }
  }

  function showTimes(r: BookingRules | null, s: SheetService, keepDay?: string | null) {
    const next = r ? freeDays(r, s.minutes, new Date(), tikka?.until) : [];
    const first = next.find((d) => d.key === keepDay && d.slots.length) ?? next.find((d) => d.slots.length);
    setDays(next);
    setDayKey(first?.key ?? null);
    setMonthIdx(Math.max(0, bookingMonths(next).findIndex((m) => m.key === first?.month)));
    setTime(null);
  }

  function pickService(s: SheetService, r = rules) {
    setService(s);
    setError("");
    showTimes(r, s);
    setStep("time");
  }

  // From a Tikka's card: open straight away (or show the booking it already has).
  useEffect(() => {
    if (!tikka) return;
    ref.current?.showModal();
    if (tikka.booking) return;
    const t = setTimeout(() => void loadRules().then((r) => services.length === 1 && pickService(services[0], r)), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tikka?.token]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const el = (e.target as Element | null)?.closest<HTMLElement>("[data-book]");
      if (!el) return;
      e.preventDefault();
      setError("");
      setService(null);
      setStep("service");
      setDays([]);
      ref.current?.showModal();
      const chosen = services.find((s) => s.id === el.dataset.bookId) ?? (services.length === 1 ? services[0] : undefined);
      void loadRules().then((r) => chosen && pickService(chosen, r));
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services, slug]);

  const day = days.find((d) => d.key === dayKey);
  const months = bookingMonths(days);
  const month = months[monthIdx];
  const anyFree = days.some((d) => d.slots.length);
  const plain = number ? whatsappLink(number, service ? `Hi ${business}, I'd like to book ${service.name}.` : `Hi ${business}, I'd like to book an appointment.`) : null;
  const when = day && time !== null ? `${day.label}, ${slotLabel(time)}` : "";

  function close() {
    ref.current?.close();
  }

  async function book() {
    if (!service || !day || time === null) return;
    setError("");
    if (!tikka && !name.trim()) return setError(PROBLEM_TEXT.bad_name);
    if (!tikka && phone.replace(/\D/g, "").length < 10) return setError(PROBLEM_TEXT.bad_phone);
    setBusy(true);
    try {
      const res = await fetch("/api/book", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug,
          serviceId: service.id,
          startsAt: new Date(watInstant(day.key, time)).toISOString(),
          ...(tikka ? { tikka: tikka.token } : { name, phone, futureOffers: offers }),
        }),
      });
      const data = (await res.json()) as { ok: boolean; token?: string; reason?: string };
      if (data.ok && data.token) {
        // Close the sheet first: Next keeps the page it leaves mounted (hidden) for going back, and an
        // open modal dialog there would leave the booking page unclickable until a reload.
        close();
        // Booked with a Tikka: back to the Tikka card, which has the code for the counter and now
        // shows the booking. Otherwise the booking pass.
        router.push(tikka ? `/t/${tikka.token}` : `/bk/${data.token}`);
        return;
      }
      const reason = data.reason ?? "error";
      if (reason === "taken" || reason === "too_soon" || reason === "closed") {
        // Someone took it meanwhile: fresh times, same day if it still has some.
        const r = await loadRules();
        showTimes(r, service, day.key);
        setStep("time");
      }
      setError(
        reason === "slow_down"
          ? "Too many tries. Wait a little and try again."
          : reason === "after_use_by"
            ? "Pick a time before your Tikka runs out."
            : reason === "used" || reason === "expired"
              ? "This Tikka can't be booked any more."
              : (PROBLEM_TEXT[reason] ?? "Something went wrong. Try again."),
      );
    } catch {
      setError("Couldn't book. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={ref}
      className="biz-sheet"
      aria-labelledby="book-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="biz-sheet-panel">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-2">
            {step !== "service" && step !== "booked" && (
              <button
                type="button"
                className="biz-sheet-x !m-0 -ml-2 shrink-0"
                aria-label="Back"
                onClick={() => (setError(""), setStep(step === "details" ? "time" : "service"))}
              >
                <ArrowLeft size={20} aria-hidden="true" />
              </button>
            )}
            <div className="min-w-0">
              <h2 id="book-title" className="biz-serif text-[26px] leading-tight tracking-[-0.01em]">
                {step === "booked" ? "You're booked" : step === "service" || !service ? "Book a time" : step === "details" ? "Your details" : `Book ${service.name}`}
              </h2>
              <p className="text-body mt-0.5 text-ink-muted">
                {service && step !== "service" && step !== "booked" ? `${business} · ${lengthLabel(service.minutes)}${service.price ? ` · ${service.price}` : ""}` : business}
              </p>
              {tikka && step !== "booked" && <p className="text-label mt-2">For your Tikka: {tikka.reward}</p>}
            </div>
          </div>
          <button type="button" onClick={close} className="biz-sheet-x" aria-label="Close">
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {step === "service" && (
          <>
            <p className="biz-sheet-label">What would you like?</p>
            <ul className="grid gap-2">
              {services.map((s) => (
                <li key={s.id}>
                  <button type="button" onClick={() => pickService(s)} className="biz-chip flex min-h-14 w-full items-center justify-between gap-3 px-4 text-left" disabled={loading && !rules}>
                    <span className="min-w-0">
                      <span className="block text-[15px] font-semibold">{s.name}</span>
                      <span className="text-caption flex items-center gap-1 text-ink-muted">
                        <Clock size={13} aria-hidden="true" />
                        {lengthLabel(s.minutes)}
                      </span>
                    </span>
                    {s.price && <span className="shrink-0 text-[14px] font-semibold">{s.price}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {step === "booked" && tikka?.booking && (
          <div className="mt-5 grid gap-3">
            <p className="rounded-md bg-surface-sunken px-4 py-3 text-[15px] font-semibold">
              {tikka.booking.service} · {whenLabel(tikka.booking.startsAt)}
            </p>
            <a href={`/t/${tikka.token}`} className="biz-btn min-h-[52px] w-full bg-ink text-surface-raised">
              Back to your Tikka
            </a>
            <a href={`/bk/${tikka.booking.token}`} className="biz-btn min-h-[52px] w-full border border-line-strong">
              See your booking
            </a>
            <p className="text-caption text-ink-muted">To change it, message {business} from your booking.</p>
          </div>
        )}

        {step === "time" && service && (
          <>
            {loading && !days.length ? (
              <p className="text-body mt-6 text-ink-muted">Finding free times…</p>
            ) : anyFree ? (
              <>
                <div className="mt-5 flex items-center justify-between">
                  <p className="biz-sheet-label !m-0">Pick a day</p>
                  {month && (
                    <div className="flex items-center gap-1">
                      <button type="button" className="biz-sheet-x !m-0" aria-label="Previous month" disabled={monthIdx === 0} onClick={() => setMonthIdx((i) => i - 1)}>
                        <ChevronLeft size={20} aria-hidden="true" />
                      </button>
                      <span className="min-w-32 text-center text-[15px] font-semibold" aria-live="polite">
                        {month.label}
                      </span>
                      <button type="button" className="biz-sheet-x !m-0" aria-label="Next month" disabled={monthIdx >= months.length - 1} onClick={() => setMonthIdx((i) => i + 1)}>
                        <ChevronRight size={20} aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </div>
                {month && (
                  <div className="biz-cal mt-2" role="radiogroup" aria-label={`Days in ${month.label}`}>
                    {["S", "M", "T", "W", "T", "F", "S"].map((w, i) => (
                      <span key={i} className="biz-cal-head" aria-hidden="true">
                        {w}
                      </span>
                    ))}
                    {Array.from({ length: month.lead }, (_, i) => (
                      <span key={`lead-${i}`} aria-hidden="true" />
                    ))}
                    {month.days.map((d) => (
                      <button
                        key={d.key}
                        type="button"
                        role="radio"
                        aria-checked={d.key === dayKey}
                        aria-label={d.slots.length ? d.label : `${d.label}, no free times`}
                        disabled={!d.slots.length}
                        data-today={d.short === "Today" || undefined}
                        onClick={() => (setDayKey(d.key), setTime(null), setError(""))}
                        className="biz-chip biz-cal-day"
                      >
                        {d.date}
                      </button>
                    ))}
                  </div>
                )}

                <p className="biz-sheet-label">Pick a time{day ? ` · ${day.label}` : ""}</p>
                {day?.slots.length ? (
                  <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label={`Free times on ${day.label}`}>
                    {day.slots.map((t) => (
                      <button key={t} type="button" role="radio" aria-checked={t === time} onClick={() => (setTime(t), setError(""))} className="biz-chip min-h-11 text-[14px] font-semibold">
                        {slotLabel(t).replace(":00", "")}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-body text-ink-muted">Pick a day to see the free times.</p>
                )}
                <p className="text-caption mt-2 text-ink-muted">Only free times show. Times are West Africa Time.</p>

                <button
                  type="button"
                  className="biz-btn mt-6 min-h-[52px] w-full bg-ink text-surface-raised"
                  disabled={busy}
                  onClick={() => (time === null ? setError("Pick a time first.") : tikka ? void book() : (setError(""), setStep("details")))}
                >
                  {tikka ? (busy ? "Booking…" : "Book") : "Next"}
                </button>
              </>
            ) : (
              <>
                <p className="text-body mt-6 text-ink-muted">No free times in the next few months. Message {business} to find a time.</p>
                {plain && (
                  <a href={plain} target="_blank" rel="noopener noreferrer" className="biz-btn mt-4 min-h-[52px] w-full bg-ink text-surface-raised" onClick={() => setTimeout(close, 0)}>
                    <ActionIcon kind="whatsapp" />
                    Message on WhatsApp
                  </a>
                )}
              </>
            )}
          </>
        )}

        {step === "details" && service && (
          <form
            className="mt-5 grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void book();
            }}
          >
            <p className="rounded-md bg-surface-sunken px-4 py-3 text-[15px] font-semibold">
              {service.name} · {when}
            </p>
            <label className="grid gap-1">
              <span className="text-label">First name</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} autoComplete="given-name" required />
            </label>
            <label className="grid gap-1">
              <span className="text-label">WhatsApp number</span>
              <input className="input font-mono" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="0803 123 4567" required />
              <span className="text-caption text-ink-muted">So {business} can reach you about your booking.</span>
            </label>
            <label className="flex min-h-11 items-start gap-3">
              <input type="checkbox" className="mt-1 size-5 shrink-0" checked={offers} onChange={(e) => setOffers(e.target.checked)} />
              <span className="text-body">Tell me about {business}&apos;s offers</span>
            </label>
            <button type="submit" disabled={busy} className="biz-btn mt-2 min-h-[52px] w-full bg-ink text-surface-raised">
              {busy ? "Booking…" : "Book"}
            </button>
            <p className="text-caption text-center text-ink-muted">
              By booking you agree to Tikka&apos;s{" "}
              <a href="/terms" className="underline" target="_blank">
                terms
              </a>{" "}
              and{" "}
              <a href="/privacy" className="underline" target="_blank">
                privacy policy
              </a>
              .
            </p>
          </form>
        )}

        <p role="alert" className="text-caption mt-2 min-h-5 text-danger">
          {error}
        </p>
      </div>
    </dialog>
  );
}
