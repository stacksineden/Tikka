"use client";

// NEW DIRECTION, stage 3 (docs/OWNER_JOURNEYS.md journeys 2 and 3, prototype
// design/prototypes/customer-booking.html): the customer books from the business page. Choices,
// extras, home service, a free time or a wedding date, the total and deposit, then the pass.
// Opens from every [data-book] link, like CalendarSheet. Real businesses book through book_time_v2()
// (docs/DB_MOVE.md step 2): the server's price and deposit are shown before Book, and a deposit goes
// to Paystack. Demo businesses price in the browser and pretend the payment.
// It wears the page's colours (lib/sheet-theme.ts), and from a Tikka's card ("Book a time to use it",
// ?tikka=) it opens by itself and books for that Tikka: before its use-by, no details, no deposit.

import { ArrowLeft, CalendarX, Check, ChevronLeft, ChevronRight, Info, Loader2, Lock, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { slotLabel } from "@/lib/booking";
import { freeDays, gapAfter, openRange, PROBLEM_TEXT, watInstant, watParts, type BookingRules } from "@/lib/bookings";
import { MAX_PEOPLE, priceBooking, type DepositRule } from "@/lib/booking-price";
import type { SheetTheme } from "@/lib/sheet-theme";
import type { ServiceItem, WorkPlace } from "@/lib/types";

export interface FlowBusiness {
  slug: string;
  name: string;
  workPlace: WorkPlace;
  travelFee: number;
  reach: string;
  address: string;
  rules: string[];
  deposit?: DepositRule;
  /** Gap time: kept free after a booking (and extra after a home visit), so free times leave room for it. */
  gapMinutes?: number;
  homeGapMinutes?: number;
  /** A real business: the server prices the booking (price_booking()) and the deposit is paid on Paystack. */
  live?: boolean;
}

/** price_booking()'s answer, in kobo. */
interface ServerPrice {
  totalKobo: number;
  depositKobo: number;
  depositCounts: boolean;
  minutes: number;
}

/** "Book a time to use it": the claimer's Tikka, read on the server (getTikkaForBooking). */
export interface FlowTikka {
  token: string;
  name: string;
  /** The last WAT day it can be used, "2026-12-03". */
  until: string;
  reward: string;
  booking?: { token: string; startsAt: string; service: string };
}

type Step = "option" | "place" | "time" | "date" | "call" | "people" | "extras" | "details" | "review" | "pay";
const CALL_TIMES = [300, 330, 360, 390, 420, 450, 480, 540, 600];
const naira = (n: number) => "₦" + Math.round(n).toLocaleString("en-NG");
const DOW = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function stepsFor(s: ServiceItem, b: FlowBusiness, forTikka = false): Step[] {
  const out: Step[] = [];
  if (s.eventDay) out.push("date", "call");
  if (s.options && s.options.length > 1 && !s.perPerson) out.push("option");
  // A Tikka is used at the shop, so it never asks where.
  if (b.workPlace !== "shop" && !forTikka) out.push("place");
  if (s.perPerson) out.push("people");
  if (!s.eventDay) out.push("time");
  if (s.extras?.length) out.push("extras");
  // A Tikka booking: name and number come from the claim, and it never takes a deposit. A real
  // business's deposit is paid on Paystack's own page, so there's no pretend pay step.
  // With a Tikka, details only asks the service's questions (when it has any).
  const tikkaSteps: Step[] = s.questions?.length ? ["details", "review"] : ["review"];
  out.push(...(forTikka ? tikkaSteps : b.live ? (["details", "review"] as const) : (["details", "review", "pay"] as const)));
  return out;
}

const dayKeyOf = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const longDay = (key: string) => new Date(`${key}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

export function BookingFlow({ business: b, services, theme, tikka }: { business: FlowBusiness; services: ServiceItem[]; theme: SheetTheme; tikka?: FlowTikka }) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [svc, setSvc] = useState<ServiceItem | null>(null);
  const [step, setStep] = useState<Step>("option");
  const [rules, setRules] = useState<BookingRules | null>(null);
  const [option, setOption] = useState<number | null>(null);
  const [home, setHome] = useState<boolean | null>(null);
  const [area, setArea] = useState("");
  const [address, setAddress] = useState("");
  const [people, setPeople] = useState<number[]>([]);
  const [extras, setExtras] = useState<number[]>([]);
  const [dayKey, setDayKey] = useState<string | null>(null);
  const [time, setTime] = useState<number | null>(null);
  const [monthOffset, setMonthOffset] = useState(0);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [offers, setOffers] = useState(false);
  const [answers, setAnswers] = useState<string[]>([]);
  const [email, setEmail] = useState("");
  const [server, setServer] = useState<ServerPrice | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [waitlisted, setWaitlisted] = useState(false);
  // A general "Book" (not on one service): pick the service first, like a menu.
  const [picking, setPicking] = useState(false);

  function start(s: ServiceItem) {
    setSvc(s);
    setOption(s.options && s.options.length === 1 ? 0 : null);
    setHome(b.workPlace === "home" ? true : b.workPlace === "shop" ? false : null);
    setPeople(s.options?.map((_, i) => (i === 0 ? 1 : 0)) ?? []);
    setExtras([]);
    setDayKey(null);
    setTime(null);
    setMonthOffset(0);
    setError("");
    setWaitlisted(false);
    setAnswers((s.questions ?? []).map(() => ""));
    setServer(null);
    setStep(stepsFor(s, b, !!tikka)[0]);
    if (!ref.current?.open) ref.current?.showModal();
    void fetch(`/api/book?slug=${encodeURIComponent(b.slug)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { rules: BookingRules | null }) => setRules(d.rules))
      .catch(() => setError("Couldn't load the free times. Check your connection."));
  }

  // From a Tikka's card: open straight away, on its booking if it has one, else on the only service
  // or the list to pick from.
  useEffect(() => {
    if (!tikka) return;
    const t = setTimeout(() => {
      if (!tikka.booking && services.length === 1) start(services[0]);
      else ref.current?.showModal();
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tikka?.token]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const el = (e.target as Element | null)?.closest<HTMLElement>("[data-book]");
      if (!el) return;
      e.preventDefault();
      const chosen = services.find((s) => s.id === el.dataset.bookId);
      if (chosen || services.length === 1) {
        setPicking(false);
        start(chosen ?? services[0]);
      } else {
        // Book with no service named: show the services first, never pick one for them.
        setSvc(null);
        setPicking(true);
        if (!ref.current?.open) ref.current?.showModal();
      }
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services]);

  const steps = svc ? stepsFor(svc, b, !!tikka) : [];
  const index = steps.indexOf(step);
  const local = svc ? priceBooking(svc, { option: option ?? 0, people, extras, home: !!home }, b.travelFee, tikka ? undefined : b.deposit) : null;
  // A real business: the total and deposit are the server's (the same sums book_time_v2() charges).
  const price =
    local && b.live && server
      ? (() => {
          const total = server.totalKobo / 100;
          const deposit = tikka ? 0 : server.depositKobo / 100;
          return { ...local, totalNaira: total, depositNaira: deposit, restNaira: Math.max(0, server.depositCounts ? total - deposit : total), depositLabel: "" };
        })()
      : local;
  const needsEmail = !!b.live && !tikka && (server?.depositKobo ?? 0) > 0;

  // Ask the server for the price once the picks are made (details and review).
  const pickKey = JSON.stringify([svc?.id, option, people, extras, home]);
  useEffect(() => {
    if (!b.live || !svc?.id || (step !== "details" && step !== "review")) return;
    let gone = false;
    void fetch("/api/book-v2/price", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: b.slug, serviceId: svc.id, option: option ?? 0, people, extras, home: !!home }),
    })
      .then((r) => r.json())
      .then((d: { price: ServerPrice | null }) => !gone && setServer(d.price))
      .catch(() => undefined);
    return () => {
      gone = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b.live, b.slug, pickKey, step]);
  const after = svc ? gapAfter(b, svc, home === true) : 0;
  const days = useMemo(() => (rules && svc && !svc.eventDay ? freeDays(rules, price?.minutes ?? 60, new Date(), tikka?.until, after) : []), [rules, svc, price?.minutes, after, tikka?.until]);

  const taken = (key: string) => {
    if (!rules) return false;
    const start = watInstant(key, 0);
    const end = start + 86_400_000;
    return rules.busy.some(([s, e]) => new Date(s).getTime() < end && new Date(e).getTime() > start) || rules.blocked.some(([s, e]) => new Date(s).getTime() < end && new Date(e).getTime() > start);
  };

  const ready: Record<Step, boolean> = {
    option: option !== null,
    place: home !== null && (!home || (area.trim().length > 1 && address.trim().length > 2)),
    time: !!dayKey && time !== null,
    date: !!dayKey && !taken(dayKey),
    call: time !== null,
    people: true,
    extras: true,
    details:
      (!!tikka || (name.trim().length > 1 && phone.replace(/\D/g, "").length >= 10)) &&
      (svc?.questions ?? []).every((_, i) => (answers[i] ?? "").trim().length > 0) &&
      (!needsEmail || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())),
    // A real booking waits for the server's price before Book or Pay.
    review: !b.live || !!server || !!tikka,
    pay: true,
  };

  function close() {
    ref.current?.close();
  }
  function back() {
    // Back from a service's first step returns to the list it was picked from.
    if (index <= 0) return picking ? (setError(""), setSvc(null)) : close();
    setError("");
    setStep(steps[index - 1]);
  }
  function next() {
    setError("");
    setStep(steps[index + 1]);
  }

  async function pay() {
    if (!svc || !dayKey || time === null) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/book-v2", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug: b.slug,
          serviceId: svc.id,
          startsAt: new Date(watInstant(dayKey, time)).toISOString(),
          option: option ?? 0,
          people,
          extras,
          home: !!home,
          area,
          address,
          answers: [...(svc.questions ?? []).map((q, i) => (answers[i]?.trim() ? `${q} ${answers[i].trim()}` : "")), note.trim()].filter(Boolean).join(" · "),
          ...(tikka ? { tikka: tikka.token } : { name, phone, futureOffers: offers, email: needsEmail ? email.trim() : undefined }),
        }),
      });
      const data = (await res.json()) as { ok: boolean; token?: string; pay?: string; reason?: string };
      // A deposit: on to Paystack's own page; it comes back to the pass.
      if (data.ok && data.pay) {
        window.location.href = data.pay;
        return;
      }
      if (data.ok && data.token) {
        close();
        router.push(tikka ? `/t/${tikka.token}` : `/bk/${data.token}`);
        return;
      }
      const reason = data.reason ?? "error";
      setError(
        reason === "after_use_by"
          ? "Pick a time before your Tikka runs out."
          : reason === "used"
            ? "This Tikka can't be booked any more."
            : (PROBLEM_TEXT[reason] ?? "Something went wrong. Try again."),
      );
      if (reason === "taken" || reason === "too_soon" || reason === "closed") {
        setStep(svc.eventDay ? "date" : "time");
        setTime(null);
        void fetch(`/api/book?slug=${encodeURIComponent(b.slug)}`, { cache: "no-store" })
          .then((r) => r.json())
          .then((d: { rules: BookingRules | null }) => setRules(d.rules));
      }
    } catch {
      setError("Couldn't book. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const day = days.find((d) => d.key === dayKey);
  const todayKey = watParts(new Date()).day;
  const open = (key: string, weekday: number) => !!openRange(rules?.hours ?? null, weekday) && key;
  const today = new Date();
  const monthBase = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + monthOffset, 1));
  const y = monthBase.getUTCFullYear();
  const m = monthBase.getUTCMonth();
  const dim = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const firstKey = days[0]?.key ?? dayKeyOf(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());

  return (
    <dialog ref={ref} aria-label="Book" data-theme={theme.tone} style={theme.vars as React.CSSProperties} className="sheet m-0 mt-auto h-dvh max-h-none w-full max-w-none bg-transparent p-0 text-ink sm:mx-auto sm:max-w-[480px]">
      {tikka && !svc && <TikkaStart tikka={tikka} business={b.name} services={services} onPick={start} onClose={close} />}
      {!tikka && !svc && picking && <ServicePick business={b.name} services={services} onPick={start} onClose={close} />}
      {svc && price && (
        <div className="flex h-full flex-col bg-surface text-ink">
          {step !== "pay" ? (
            <div className="flex items-center gap-2 border-b border-line px-2 py-2">
              <button type="button" onClick={back} aria-label="Back" className="grid size-11 place-items-center rounded-pill">
                <ArrowLeft size={22} aria-hidden="true" />
              </button>
              <div className="h-1 flex-1 overflow-hidden rounded-pill bg-surface-sunken" role="progressbar" aria-label="Booking progress" aria-valuenow={index + 1} aria-valuemin={1} aria-valuemax={steps.length - 1}>
                <div className="h-full bg-(--bf-acc) transition-[width]" style={{ width: `${((index + 1) / (steps.length - 1)) * 100}%` }} />
              </div>
              <button type="button" onClick={close} aria-label="Close" className="grid size-11 place-items-center rounded-pill">
                <X size={22} aria-hidden="true" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 border-b border-line px-2 py-2">
              <button type="button" onClick={back} aria-label="Back" className="grid size-11 place-items-center rounded-pill">
                <ArrowLeft size={22} aria-hidden="true" />
              </button>
              <b>Secure payment</b>
            </div>
          )}

          <div className="grid flex-1 content-start gap-5 overflow-y-auto px-4 pt-5 pb-6">
            {step !== "pay" && (
              <div className="grid gap-1">
                <span className="text-caption font-semibold tracking-[0.08em] uppercase" style={{ color: "var(--bf-acc)" }}>
                  {svc.name}
                </span>
                <h2 className="biz-serif text-[28px] leading-[1.1]">{step === "review" && price.depositNaira === 0 ? "Check and book" : TITLES[step](svc)}</h2>
                {tikka && <p className="text-label mt-1">For your Tikka: {tikka.reward}</p>}
              </div>
            )}

            {step === "option" && (
              <div className="grid gap-2.5">
                {svc.options!.map((o, i) => (
                  <Opt key={o.label} on={option === i} onClick={() => setOption(i)} title={o.label} sub={`About ${hours(o.minutes)}`} price={`${svc.priceKind === "from" ? "From " : ""}${naira(o.price)}`} />
                ))}
              </div>
            )}

            {step === "place" && (
              <>
                {b.workPlace === "both" && (
                  <div className="grid gap-2.5">
                    <Opt on={home === false} onClick={() => setHome(false)} title={svc.eventDay ? "At the studio" : "At the salon"} sub={b.address} />
                    <Opt on={home === true} onClick={() => setHome(true)} title="At my place" sub={`${b.name} comes to you, ${b.reach.toLowerCase()}`} price={b.travelFee ? `+${naira(b.travelFee)}` : undefined} />
                  </div>
                )}
                {home && (
                  <div className="grid gap-3.5 rounded-card border border-line bg-surface-raised p-4">
                    {b.workPlace === "home" && <p className="text-body text-ink-muted">{b.name} comes to you. Travel fee {naira(b.travelFee)}.</p>}
                    <Input id="bf-area" label="Area" value={area} onChange={setArea} placeholder="e.g. Bodija" />
                    <Input id="bf-addr" label={svc.eventDay ? "Venue or home address" : "Your address"} value={address} onChange={setAddress} placeholder={svc.eventDay ? "e.g. Oriental Hotel, or 5 Admiralty Way" : "House number and street"} />
                  </div>
                )}
              </>
            )}

            {step === "people" && (
              <div className="grid gap-2.5">
                {svc.options!.map((o, i) => (
                  <div key={o.label} className="flex items-center gap-3.5 rounded-card border border-line bg-surface-raised px-4 py-3.5">
                    <div className="min-w-0 flex-1">
                      <b className="block">{o.label}</b>
                      <span className="text-caption text-ink-muted">
                        {naira(o.price)}
                        {i > 0 ? " each" : ""}
                      </span>
                    </div>
                    {i === 0 ? (
                      <span className="text-code w-8 text-center text-lg">1</span>
                    ) : (
                      <>
                        <Round label={`Fewer ${o.label.toLowerCase()}`} disabled={!people[i]} onClick={() => setPeople((p) => p.map((n, j) => (j === i ? Math.max(0, n - 1) : n)))}>
                          −
                        </Round>
                        <span className="text-code w-8 text-center text-lg" aria-live="polite">
                          {people[i] ?? 0}
                        </span>
                        <Round label={`More ${o.label.toLowerCase()}`} disabled={(people[i] ?? 0) >= MAX_PEOPLE} onClick={() => setPeople((p) => p.map((n, j) => (j === i ? Math.min(MAX_PEOPLE, n + 1) : n)))}>
                          +
                        </Round>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            {step === "time" && (
              <>
                {!rules ? (
                  <Loader2 className="animate-spin justify-self-center text-ink-muted" aria-label="Loading free times" />
                ) : (
                  <>
                    <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1.5" role="group" aria-label="Days">
                      {days.slice(0, 21).map((d) => {
                        // Today with nothing left (it's late) reads Closed, not Full: no waitlist for a day that's over.
                        const isOpen = !!open(d.key, d.weekday) && !(d.key === todayKey && d.slots.length === 0);
                        const full = isOpen && d.slots.length === 0;
                        return (
                          <button
                            key={d.key}
                            type="button"
                            disabled={!isOpen}
                            aria-pressed={dayKey === d.key}
                            onClick={() => {
                              setDayKey(d.key);
                              setTime(null);
                              setWaitlisted(false);
                            }}
                            className={`grid min-h-19.5 w-16 shrink-0 snap-start content-center justify-items-center gap-0.5 rounded-md border-2 py-1.5 disabled:opacity-40 ${dayKey === d.key ? "border-(--bf-acc) bg-(--bf-acc) text-(--bf-on-acc)" : "border-line bg-surface-raised"}`}
                          >
                            <small className="text-xs opacity-75">{d.short}</small>
                            <b className="text-[22px] leading-[26px]">{d.date}</b>
                            <span className={`text-[11px] font-semibold ${dayKey === d.key ? "" : full ? "text-gold-text" : isOpen ? "text-success" : ""}`}>{!isOpen ? "Closed" : full ? "Full" : "Free"}</span>
                          </button>
                        );
                      })}
                    </div>
                    {day && day.slots.length === 0 && <Waitlist name={b.name} slug={b.slug} serviceId={svc.id!} day={dayKey!} done={waitlisted} onJoin={() => setWaitlisted(true)} />}
                    {day && day.slots.length > 0 && (
                      <>
                        <div className="grid grid-cols-3 gap-2">
                          {day.slots.map((t) => (
                            <button key={t} type="button" aria-pressed={time === t} onClick={() => setTime(t)} className={`text-code min-h-12 rounded-md border ${time === t ? "border-(--bf-acc) bg-(--bf-acc) text-(--bf-on-acc)" : "border-line-strong bg-surface-raised"}`}>
                              {slotLabel(t)}
                            </button>
                          ))}
                        </div>
                        <p className="text-caption text-ink-muted">Takes about {hours(price.minutes)}. Only free times show.</p>
                      </>
                    )}
                    {!dayKey && <p className="text-body text-ink-muted">Pick a day to see the free times.</p>}
                  </>
                )}
              </>
            )}

            {step === "date" && (
              <>
                <div className="rounded-card border border-line bg-surface-raised p-3.5">
                  <div className="mb-2.5 flex items-center justify-between">
                    <button type="button" className="grid size-11 place-items-center disabled:opacity-30" disabled={monthOffset === 0} onClick={() => setMonthOffset(monthOffset - 1)} aria-label="Previous month">
                      <ChevronLeft size={20} aria-hidden="true" />
                    </button>
                    <b>
                      {MONTHS[m]} {y}
                    </b>
                    <button type="button" className="grid size-11 place-items-center disabled:opacity-30" disabled={monthOffset >= 5} onClick={() => setMonthOffset(monthOffset + 1)} aria-label="Next month">
                      <ChevronRight size={20} aria-hidden="true" />
                    </button>
                  </div>
                  <div className="grid grid-cols-7 gap-1 text-center">
                    {DOW.map((d, i) => (
                      <span key={i} className="text-caption pb-1 font-semibold text-ink-muted">
                        {d}
                      </span>
                    ))}
                    {Array.from({ length: new Date(Date.UTC(y, m, 1)).getUTCDay() }, (_, i) => (
                      <span key={`e${i}`} />
                    ))}
                    {Array.from({ length: dim }, (_, i) => {
                      const key = dayKeyOf(y, m, i + 1);
                      const past = key < firstKey || (!!tikka && key > tikka.until);
                      const isTaken = !past && taken(key);
                      return (
                        <button
                          key={key}
                          type="button"
                          disabled={past}
                          aria-pressed={dayKey === key}
                          aria-label={isTaken ? `${i + 1}, already booked` : undefined}
                          onClick={() => {
                            setDayKey(key);
                            setWaitlisted(false);
                          }}
                          className={`grid aspect-square min-w-0 content-center rounded-md text-[15px] leading-4 font-semibold disabled:bg-transparent disabled:text-ink-muted/50 ${dayKey === key ? "bg-(--bf-acc) text-(--bf-on-acc)" : isTaken ? "bg-surface-sunken text-ink-muted line-through" : "bg-surface"}`}
                        >
                          {i + 1}
                          {isTaken && <small className="text-[8px] text-gold-text no-underline">Booked</small>}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {dayKey && taken(dayKey) && <Waitlist name={b.name} slug={b.slug} serviceId={svc.id!} day={dayKey!} done={waitlisted} onJoin={() => setWaitlisted(true)} />}
              </>
            )}

            {step === "call" && (
              <>
                <p className="text-body text-ink-muted">On {dayKey && longDay(dayKey)}. When should {b.name} start?</p>
                <div className="grid grid-cols-3 gap-2">
                  {CALL_TIMES.map((t) => (
                    <button key={t} type="button" aria-pressed={time === t} onClick={() => setTime(t)} className={`text-code min-h-12 rounded-md border ${time === t ? "border-(--bf-acc) bg-(--bf-acc) text-(--bf-on-acc)" : "border-line-strong bg-surface-raised"}`}>
                      {slotLabel(t)}
                    </button>
                  ))}
                </div>
              </>
            )}

            {step === "extras" && (
              <div className="grid gap-2.5">
                {svc.extras!.map((x, i) => (
                  <button
                    key={x.name}
                    type="button"
                    role="checkbox"
                    aria-checked={extras.includes(i)}
                    onClick={() => setExtras((e) => (e.includes(i) ? e.filter((j) => j !== i) : [...e, i]))}
                    className={`flex min-h-17 w-full items-center gap-3.5 rounded-card border-2 bg-surface-raised px-4 text-left ${extras.includes(i) ? "border-(--bf-acc)" : "border-line"}`}
                  >
                    <span className={`grid size-6 shrink-0 place-items-center rounded-[7px] border-2 ${extras.includes(i) ? "border-(--bf-acc) bg-(--bf-acc) text-(--bf-on-acc)" : "border-line-strong text-transparent"}`}>
                      <Check size={15} aria-hidden="true" />
                    </span>
                    <b className="flex-1">{x.name}</b>
                    <span className="text-code font-bold">+{naira(x.price)}</span>
                  </button>
                ))}
              </div>
            )}

            {step === "details" && (
              <>
                {!tikka && (
                  <>
                    <p className="text-body text-ink-muted">{b.name} uses these to reach you about your booking.</p>
                    <Input id="bf-name" label="Your name" value={name} onChange={setName} placeholder="e.g. Chiamaka" autoComplete="name" />
                    <Input id="bf-phone" label="WhatsApp number" value={phone} onChange={setPhone} placeholder="0803 000 0000" inputMode="tel" autoComplete="tel-national" />
                  </>
                )}
                {(svc.questions ?? []).map((q, i) => (
                  <Input key={q} id={`bf-q-${i}`} label={q} value={answers[i] ?? ""} onChange={(v) => setAnswers((a) => a.map((x, j) => (j === i ? v : x)))} />
                ))}
                <div>
                  <label htmlFor="bf-note" className="text-label mb-1.5 block">
                    {svc.eventDay ? "Skin type, allergies or wedding colours" : "Anything we should know?"} <span className="font-normal text-ink-muted">(optional)</span>
                  </label>
                  <textarea id="bf-note" className="input h-auto min-h-21 py-3" value={note} onChange={(e) => setNote(e.target.value)} placeholder={svc.eventDay ? "e.g. oily skin, emerald and gold" : "e.g. sensitive scalp, I'll bring my own hair"} maxLength={160} />
                </div>
                {needsEmail && (
                  <Input id="bf-email" label="Email, for your payment receipt" value={email} onChange={setEmail} placeholder="you@example.com" inputMode="email" autoComplete="email" />
                )}
                {/* Unticked: it reaches the business's list only once they come in (rule 12). */}
                {!tikka && (
                  <label className="flex min-h-11 items-start gap-3">
                    <input type="checkbox" className="mt-1 size-5 shrink-0" checked={offers} onChange={(e) => setOffers(e.target.checked)} />
                    <span className="text-body">Tell me about {b.name}&apos;s offers</span>
                  </label>
                )}
                {!b.live && <p className="text-caption text-center text-ink-muted">Demo: nothing is sent. Any number works.</p>}
              </>
            )}

            {step === "review" && dayKey && time !== null && (
              <>
                <div className="rounded-card border border-line bg-surface-raised px-4 py-1.5">
                  <Line label="When" value={`${longDay(dayKey)}, ${svc.eventDay ? "start " : ""}${slotLabel(time)}`} />
                  <Line label="Where" value={home ? [address, area].filter(Boolean).join(", ") : b.address} />
                </div>
                <div className="rounded-card border border-line bg-surface-raised px-4 py-1.5">
                  {price.lines.map((l) => (
                    <Line key={l.label} label={l.label} value={naira(l.naira)} mono />
                  ))}
                  <div className="mt-1 border-t border-line">
                    <Line label={svc.priceKind === "from" ? "Total from" : "Total"} value={naira(price.totalNaira)} mono strong />
                  </div>
                </div>
                {svc.priceKind === "from" && <p className="text-caption -mt-2 text-ink-muted">This is the starting price. {b.name} confirms the final price with you; the deposit is on the starting price.</p>}
                {price.depositNaira > 0 ? (
                  <div className="grid gap-1.5 rounded-card bg-ink p-4 text-surface">
                    <span className="text-caption opacity-80">Deposit to pay now{price.depositLabel ? ` (${price.depositLabel})` : ""}</span>
                    <span className="text-code-lg tracking-normal">{naira(price.depositNaira)}</span>
                    <span className="text-caption opacity-80">
                      {naira(price.restNaira)} to pay {svc.eventDay ? "on the day" : "at the appointment"}. The deposit goes straight to {b.name}.
                    </span>
                  </div>
                ) : (
                  <p className="text-body rounded-md bg-surface-sunken px-4 py-3">No deposit: pay {naira(price.totalNaira)} on the day.</p>
                )}
                {b.rules.length > 0 && (
                  <div>
                    <h3 className="biz-serif mb-2 text-[19px]">Booking rules</h3>
                    <ul className="divide-y divide-line rounded-card border border-line bg-surface-raised px-4">
                      {b.rules.map((r) => (
                        <li key={r} className="text-body py-2.5">
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {price.depositNaira > 0 && (
                  <p className="text-body flex gap-2.5 rounded-md bg-gold-soft px-4 py-3">
                    <Info size={20} className="mt-0.5 shrink-0 text-gold-text" aria-hidden="true" /> The deposit is not refundable. By paying, you agree to these rules.
                  </p>
                )}
              </>
            )}

            {step === "pay" && (
              <div className="grid gap-4 pt-3">
                <div className="grid justify-items-center gap-3 rounded-card border-2 border-dashed border-line-strong p-5 text-center">
                  <Lock size={28} aria-hidden="true" />
                  <b className="text-lg">Paystack&apos;s payment page opens here</b>
                  <span className="text-body text-ink-muted">
                    In the real app you pay {naira(price.depositNaira)} by card, bank transfer or USSD on Paystack&apos;s own secure page, then come straight back.
                  </span>
                  <span className="text-code-lg tracking-normal">{naira(price.depositNaira)}</span>
                  <span className="text-caption text-ink-muted">to {b.name}</span>
                </div>
                <button type="button" className="btn btn-lg w-full rounded-pill bg-(--bf-acc) text-(--bf-on-acc) hover:bg-(--bf-acc)" disabled={busy} onClick={pay}>
                  {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />} Pretend it&apos;s paid (demo)
                </button>
                <p className="text-caption text-center text-ink-muted">Demo: no money moves.</p>
              </div>
            )}

            {error && (
              <p role="alert" className="text-body rounded-md bg-danger-soft px-4 py-3 text-danger">
                {error}
              </p>
            )}
          </div>

          {step !== "pay" && (
            <div className="flex items-center gap-3 border-t border-line px-4 pt-2.5 pb-[calc(12px+env(safe-area-inset-bottom))]">
              <div className="min-w-0 flex-1">
                <span className="text-caption text-ink-muted">Total</span>
                <b className="text-code block text-lg">{naira(price.totalNaira)}</b>
              </div>
              <button
                type="button"
                className="btn btn-lg shrink-0 rounded-pill bg-(--bf-acc) text-(--bf-on-acc) hover:bg-(--bf-acc)"
                disabled={!ready[step] || busy}
                onClick={step === "review" ? (price.depositNaira > 0 && !b.live ? next : pay) : next}
              >
                {step === "review" ? (price.depositNaira > 0 ? `Pay ${naira(price.depositNaira)} deposit` : "Book") : "Continue"}
              </button>
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}

const TITLES: Record<Step, (s: ServiceItem) => string> = {
  option: () => "Choose your option",
  place: (s) => (s.eventDay ? "Where is everyone getting ready?" : "Where should it happen?"),
  time: () => "Pick a day and time",
  date: () => "When is the big day?",
  call: () => "What time should we start?",
  people: () => "Who's getting ready?",
  extras: () => "Anything to add?",
  details: () => "Your details",
  review: () => "Check and pay your deposit",
  pay: () => "",
};

function hours(m: number) {
  if (m < 60) return `${m} min`;
  if (m % 60 === 0) return `${m / 60} hour${m === 60 ? "" : "s"}`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** A general "Book": every service with its time and price, grouped like the page; picking one starts its booking. */
function ServicePick({ business, services, onPick, onClose }: { business: string; services: ServiceItem[]; onPick: (s: ServiceItem) => void; onClose: () => void }) {
  const groups = [...new Set(services.map((s) => s.group ?? ""))];
  const price = (s: ServiceItem) => {
    const low = s.options?.length ? Math.min(...s.options.map((o) => o.price)) : s.price;
    if (s.priceKind === "ask" || low === null || low === undefined) return "Ask";
    return `${s.priceKind === "from" || (s.options?.length ?? 0) > 1 ? "From " : ""}${naira(low)}`;
  };
  return (
    <div className="flex h-full flex-col bg-surface text-ink">
      <div className="flex justify-end border-b border-line px-2 py-2">
        <button type="button" onClick={onClose} aria-label="Close" className="grid size-11 place-items-center rounded-pill">
          <X size={22} aria-hidden="true" />
        </button>
      </div>
      <div className="grid flex-1 content-start gap-5 overflow-y-auto px-4 pt-5 pb-6">
        <div className="grid gap-1">
          <span className="text-caption font-semibold tracking-[0.08em] uppercase" style={{ color: "var(--bf-acc)" }}>
            {business}
          </span>
          <h2 className="biz-serif text-[28px] leading-[1.1]">What would you like?</h2>
        </div>
        {groups.map((g) => (
          <div key={g || "all"} className="grid gap-2.5">
            {g && groups.length > 1 && <h3 className="text-label text-ink-muted">{g}</h3>}
            {services
              .filter((s) => (s.group ?? "") === g)
              .map((s) => (
                <Opt key={s.id} on={false} onClick={() => onPick(s)} title={s.name} sub={s.eventDay ? "A whole day" : s.minutes ? `About ${hours(s.minutes)}` : undefined} price={price(s)} />
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Opt({ on, onClick, title, sub, price }: { on: boolean; onClick: () => void; title: string; sub?: string; price?: string }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={`flex min-h-17 w-full items-center gap-3.5 rounded-card border-2 bg-surface-raised px-4 py-3 text-left ${on ? "border-(--bf-acc)" : "border-line"}`}>
      <span className={`size-6 shrink-0 rounded-pill border-2 ${on ? "border-[7px] border-(--bf-acc)" : "border-line-strong"}`} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <b className="block text-[17px]">{title}</b>
        {sub && <span className="text-caption text-ink-muted">{sub}</span>}
      </span>
      {price && <span className="text-code font-bold whitespace-nowrap">{price}</span>}
    </button>
  );
}

function Round({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} disabled={disabled} onClick={onClick} className="grid size-11 place-items-center rounded-pill border border-line-strong bg-surface text-xl disabled:opacity-30">
      {children}
    </button>
  );
}

function Input({ id, label, value, onChange, placeholder, inputMode, autoComplete }: { id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string; inputMode?: "tel" | "email"; autoComplete?: string }) {
  return (
    <div>
      <label htmlFor={id} className="text-label mb-1.5 block">
        {label}
      </label>
      <input id={id} className="input h-13 text-[17px]" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} inputMode={inputMode} autoComplete={autoComplete} />
    </div>
  );
}

function Line({ label, value, mono, strong }: { label: string; value: string; mono?: boolean; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 py-2 ${strong ? "font-bold" : ""}`}>
      <span className={mono ? "" : "text-ink-muted"}>{label}</span>
      <span className={`text-right ${mono ? "text-code" : ""}`}>{value}</span>
    </div>
  );
}

function Waitlist({ name, slug, serviceId, day, done, onJoin }: { name: string; slug: string; serviceId: string; day: string; done: boolean; onJoin: () => void }) {
  const [form, setForm] = useState(false);
  const [first, setFirst] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function join() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/book-v2/waitlist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug, serviceId, day, name: first, phone }) });
      const r = (await res.json()) as { ok: boolean; reason?: string };
      if (r.ok) onJoin();
      else setError(PROBLEM_TEXT[r.reason ?? ""] ?? "That didn't work. Try again.");
    } catch {
      setError("Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex gap-3 rounded-md bg-gold-soft px-4 py-3.5">
      <CalendarX size={20} className="mt-0.5 shrink-0 text-gold-text" aria-hidden="true" />
      <div className="grid min-w-0 flex-1 gap-2.5">
        {done ? (
          <span className="text-body">
            <b>You&apos;re on the waitlist.</b> {name} will message you on WhatsApp if a place opens on {longDay(day)}.
          </span>
        ) : form ? (
          <>
            <span className="text-body">Leave your name and WhatsApp number. {name} messages you if a place opens.</span>
            <input aria-label="Your first name" className="input" value={first} onChange={(e) => setFirst(e.target.value)} placeholder="Your first name" autoComplete="given-name" />
            <input aria-label="Your WhatsApp number" className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0803 000 0000" inputMode="tel" autoComplete="tel-national" />
            {error && <span role="alert" className="text-body text-danger">{error}</span>}
            <button type="button" disabled={busy || first.trim().length < 2 || phone.replace(/\D/g, "").length < 10} className="btn justify-self-start rounded-pill bg-(--bf-acc) text-(--bf-on-acc) hover:bg-(--bf-acc)" onClick={join}>
              {busy && <Loader2 className="animate-spin" aria-hidden="true" />} Add me to the waitlist
            </button>
          </>
        ) : (
          <>
            <span className="text-body">
              <b>This day is fully booked.</b> Join the waitlist and {name} will message you if a place opens, or pick another day.
            </span>
            <button type="button" className="btn justify-self-start rounded-pill bg-(--bf-acc) text-(--bf-on-acc) hover:bg-(--bf-acc)" onClick={() => setForm(true)}>
              Join the waitlist
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function TikkaStart({ tikka, business, services, onPick, onClose }: { tikka: FlowTikka; business: string; services: ServiceItem[]; onPick: (s: ServiceItem) => void; onClose: () => void }) {
  const when = (iso: string) =>
    new Date(iso).toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos" });
  return (
    <div className="flex h-full flex-col bg-surface text-ink">
      <div className="flex justify-end border-b border-line px-2 py-2">
        <button type="button" onClick={onClose} aria-label="Close" className="grid size-11 place-items-center rounded-pill">
          <X size={22} aria-hidden="true" />
        </button>
      </div>
      <div className="grid flex-1 content-start gap-5 overflow-y-auto px-4 pt-5 pb-6">
        <div className="grid gap-1">
          <span className="text-caption font-semibold tracking-[0.08em] uppercase" style={{ color: "var(--bf-acc)" }}>
            {business}
          </span>
          <h2 className="biz-serif text-[28px] leading-[1.1]">{tikka.booking ? "You're booked" : "Book a time to use your Tikka"}</h2>
          <p className="text-label mt-1">For your Tikka: {tikka.reward}</p>
        </div>
        {tikka.booking ? (
          <>
            <p className="text-body rounded-md bg-surface-sunken px-4 py-3 font-semibold">
              {tikka.booking.service} · {when(tikka.booking.startsAt)}
            </p>
            <a href={`/t/${tikka.token}`} className="btn btn-lg w-full rounded-pill bg-(--bf-acc) text-(--bf-on-acc) hover:bg-(--bf-acc)">
              Back to your Tikka
            </a>
            <a href={`/bk/${tikka.booking.token}`} className="btn btn-lg w-full rounded-pill border border-line-strong">
              See your booking
            </a>
            <p className="text-caption text-ink-muted">To change it, message {business} from your booking.</p>
          </>
        ) : (
          <>
            <p className="text-body text-ink-muted">Pick what you&apos;d like. Only times before your Tikka runs out show.</p>
            <div className="grid gap-2.5">
              {services.map((s) => (
                <Opt key={s.id} on={false} onClick={() => onPick(s)} title={s.name} sub={s.minutes ? `About ${hours(s.minutes)}` : undefined} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
