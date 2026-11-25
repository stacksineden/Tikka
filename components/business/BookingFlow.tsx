"use client";

// NEW DIRECTION, stage 3 (docs/OWNER_JOURNEYS.md journeys 2 and 3, prototype
// design/prototypes/customer-booking.html): the customer books from the business page. Choices,
// extras, home service, a free time or a wedding date, the total and deposit, then the pass.
// Opens from every [data-book] link, like CalendarSheet. Demo businesses only for now.

import { ArrowLeft, CalendarX, Check, ChevronLeft, ChevronRight, Info, Loader2, Lock, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { slotLabel } from "@/lib/booking";
import { freeDays, openRange, PROBLEM_TEXT, watInstant, type BookingRules } from "@/lib/bookings";
import { MAX_PEOPLE, priceBooking, type DepositRule } from "@/lib/booking-price";
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
}

type Step = "option" | "place" | "time" | "date" | "call" | "people" | "extras" | "details" | "review" | "pay";
const CALL_TIMES = [300, 330, 360, 390, 420, 450, 480, 540, 600];
const naira = (n: number) => "₦" + Math.round(n).toLocaleString("en-NG");
const DOW = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function stepsFor(s: ServiceItem, b: FlowBusiness): Step[] {
  const out: Step[] = [];
  if (s.eventDay) out.push("date", "call");
  if (s.options && s.options.length > 1 && !s.perPerson) out.push("option");
  if (b.workPlace !== "shop") out.push("place");
  if (s.perPerson) out.push("people");
  if (!s.eventDay) out.push("time");
  if (s.extras?.length) out.push("extras");
  out.push("details", "review", "pay");
  return out;
}

const dayKeyOf = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const longDay = (key: string) => new Date(`${key}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

export function BookingFlow({ business: b, services }: { business: FlowBusiness; services: ServiceItem[] }) {
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [waitlisted, setWaitlisted] = useState(false);

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
    setStep(stepsFor(s, b)[0]);
    ref.current?.showModal();
    void fetch(`/api/book?slug=${encodeURIComponent(b.slug)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { rules: BookingRules | null }) => setRules(d.rules))
      .catch(() => setError("Couldn't load the free times. Check your connection."));
  }

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const el = (e.target as Element | null)?.closest<HTMLElement>("[data-book]");
      if (!el) return;
      e.preventDefault();
      const chosen = services.find((s) => s.id === el.dataset.bookId) ?? services[0];
      start(chosen);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services]);

  const steps = svc ? stepsFor(svc, b) : [];
  const index = steps.indexOf(step);
  const price = svc ? priceBooking(svc, { option: option ?? 0, people, extras, home: !!home }, b.travelFee, b.deposit) : null;
  const days = useMemo(() => (rules && svc && !svc.eventDay ? freeDays(rules, price?.minutes ?? 60, new Date()) : []), [rules, svc, price?.minutes]);

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
    details: name.trim().length > 1 && phone.replace(/\D/g, "").length >= 10,
    review: true,
    pay: true,
  };

  function close() {
    ref.current?.close();
  }
  function back() {
    if (index <= 0) return close();
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
          answers: note,
          name,
          phone,
        }),
      });
      const data = (await res.json()) as { ok: boolean; token?: string; reason?: string };
      if (data.ok && data.token) {
        close();
        router.push(`/bk/${data.token}`);
        return;
      }
      const reason = data.reason ?? "error";
      setError(PROBLEM_TEXT[reason] ?? "Something went wrong. Try again.");
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
  const open = (key: string, weekday: number) => !!openRange(rules?.hours ?? null, weekday) && key;
  const today = new Date();
  const monthBase = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + monthOffset, 1));
  const y = monthBase.getUTCFullYear();
  const m = monthBase.getUTCMonth();
  const dim = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const firstKey = days[0]?.key ?? dayKeyOf(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());

  return (
    <dialog ref={ref} aria-label="Book" className="sheet m-0 mt-auto h-dvh max-h-none w-full max-w-none bg-transparent p-0 sm:mx-auto sm:max-w-[480px]">
      {svc && price && (
        <div className="flex h-full flex-col bg-surface text-ink">
          {step !== "pay" ? (
            <div className="flex items-center gap-2 border-b border-line px-2 py-2">
              <button type="button" onClick={back} aria-label="Back" className="grid size-11 place-items-center rounded-pill">
                <ArrowLeft size={22} aria-hidden="true" />
              </button>
              <div className="h-1 flex-1 overflow-hidden rounded-pill bg-surface-sunken" role="progressbar" aria-label="Booking progress" aria-valuenow={index + 1} aria-valuemin={1} aria-valuemax={steps.length - 1}>
                <div className="h-full bg-ink transition-[width]" style={{ width: `${((index + 1) / (steps.length - 1)) * 100}%` }} />
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
                <span className="text-caption font-semibold tracking-[0.08em] uppercase" style={{ color: "var(--biz)" }}>
                  {svc.name}
                </span>
                <h2 className="biz-serif text-[28px] leading-[1.1]">{TITLES[step](svc)}</h2>
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
                        const isOpen = !!open(d.key, d.weekday);
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
                            className={`grid min-h-19.5 w-16 shrink-0 snap-start content-center justify-items-center gap-0.5 rounded-md border-2 py-1.5 disabled:opacity-40 ${dayKey === d.key ? "border-ink bg-ink text-surface" : "border-line bg-surface-raised"}`}
                          >
                            <small className="text-xs opacity-75">{d.short}</small>
                            <b className="text-[22px] leading-[26px]">{d.date}</b>
                            <span className={`text-[11px] font-semibold ${dayKey === d.key ? "" : full ? "text-gold-text" : isOpen ? "text-success" : ""}`}>{!isOpen ? "Closed" : full ? "Full" : "Free"}</span>
                          </button>
                        );
                      })}
                    </div>
                    {day && day.slots.length === 0 && <Waitlist name={b.name} done={waitlisted} onJoin={() => setWaitlisted(true)} />}
                    {day && day.slots.length > 0 && (
                      <>
                        <div className="grid grid-cols-3 gap-2">
                          {day.slots.map((t) => (
                            <button key={t} type="button" aria-pressed={time === t} onClick={() => setTime(t)} className={`text-code min-h-12 rounded-md border ${time === t ? "border-ink bg-ink text-surface" : "border-line-strong bg-surface-raised"}`}>
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
                      const past = key < firstKey;
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
                          className={`grid aspect-square min-w-0 content-center rounded-md text-[15px] leading-4 font-semibold disabled:bg-transparent disabled:text-ink-muted/50 ${dayKey === key ? "bg-ink text-surface" : isTaken ? "bg-surface-sunken text-ink-muted line-through" : "bg-surface"}`}
                        >
                          {i + 1}
                          {isTaken && <small className="text-[8px] text-gold-text no-underline">Booked</small>}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {dayKey && taken(dayKey) && <Waitlist name={b.name} done={waitlisted} onJoin={() => setWaitlisted(true)} />}
              </>
            )}

            {step === "call" && (
              <>
                <p className="text-body text-ink-muted">On {dayKey && longDay(dayKey)}. When should {b.name} start?</p>
                <div className="grid grid-cols-3 gap-2">
                  {CALL_TIMES.map((t) => (
                    <button key={t} type="button" aria-pressed={time === t} onClick={() => setTime(t)} className={`text-code min-h-12 rounded-md border ${time === t ? "border-ink bg-ink text-surface" : "border-line-strong bg-surface-raised"}`}>
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
                    className={`flex min-h-17 w-full items-center gap-3.5 rounded-card border-2 bg-surface-raised px-4 text-left ${extras.includes(i) ? "border-ink" : "border-line"}`}
                  >
                    <span className={`grid size-6 shrink-0 place-items-center rounded-[7px] border-2 ${extras.includes(i) ? "border-ink bg-ink text-surface" : "border-line-strong text-transparent"}`}>
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
                <p className="text-body text-ink-muted">{b.name} uses these to reach you about your booking.</p>
                <Input id="bf-name" label="Your name" value={name} onChange={setName} placeholder="e.g. Chiamaka" autoComplete="name" />
                <Input id="bf-phone" label="WhatsApp number" value={phone} onChange={setPhone} placeholder="0803 000 0000" inputMode="tel" autoComplete="tel-national" />
                <div>
                  <label htmlFor="bf-note" className="text-label mb-1.5 block">
                    {svc.eventDay ? "Skin type, allergies or wedding colours" : "Anything we should know?"} <span className="font-normal text-ink-muted">(optional)</span>
                  </label>
                  <textarea id="bf-note" className="input h-auto min-h-21 py-3" value={note} onChange={(e) => setNote(e.target.value)} placeholder={svc.eventDay ? "e.g. oily skin, emerald and gold" : "e.g. sensitive scalp, I'll bring my own hair"} maxLength={160} />
                </div>
                <p className="text-caption text-center text-ink-muted">Demo: nothing is sent. Any number works.</p>
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
                    <span className="text-caption opacity-80">Deposit to pay now ({price.depositLabel})</span>
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
                <button type="button" className="btn btn-lg w-full rounded-pill bg-ink text-surface hover:bg-ink" disabled={busy} onClick={pay}>
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
                className="btn btn-lg shrink-0 rounded-pill bg-ink text-surface hover:bg-ink"
                disabled={!ready[step] || busy}
                onClick={step === "review" ? (price.depositNaira > 0 ? next : pay) : next}
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

function Opt({ on, onClick, title, sub, price }: { on: boolean; onClick: () => void; title: string; sub?: string; price?: string }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={`flex min-h-17 w-full items-center gap-3.5 rounded-card border-2 bg-surface-raised px-4 py-3 text-left ${on ? "border-ink" : "border-line"}`}>
      <span className={`size-6 shrink-0 rounded-pill border-2 ${on ? "border-[7px] border-ink" : "border-line-strong"}`} aria-hidden="true" />
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

function Input({ id, label, value, onChange, placeholder, inputMode, autoComplete }: { id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string; inputMode?: "tel"; autoComplete?: string }) {
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

function Waitlist({ name, done, onJoin }: { name: string; done: boolean; onJoin: () => void }) {
  return (
    <div className="flex gap-3 rounded-md bg-gold-soft px-4 py-3.5">
      <CalendarX size={20} className="mt-0.5 shrink-0 text-gold-text" aria-hidden="true" />
      <div className="grid gap-2.5">
        {done ? (
          <span className="text-body">
            <b>You&apos;re on the waitlist.</b> {name} will message you on WhatsApp if a place opens. (Demo: not saved yet.)
          </span>
        ) : (
          <>
            <span className="text-body">
              <b>This day is fully booked.</b> Join the waitlist and {name} will message you if a place opens, or pick another day.
            </span>
            <button type="button" className="btn justify-self-start rounded-pill bg-ink text-surface hover:bg-ink" onClick={onJoin}>
              Join the waitlist
            </button>
          </>
        )}
      </div>
    </div>
  );
}
