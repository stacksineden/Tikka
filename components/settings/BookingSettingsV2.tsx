"use client";

// NEW DIRECTION: Booking settings in one place. Each row says what's set now; tapping it opens one
// question in a sheet (one decision at a time), and saving updates the page straight away.

import { CalendarClock, Car, ChevronRight, CircleCheck, Clock, Loader2, MessageCircleQuestion, Plus, Power, ScrollText, Timer, Trash2, Users, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveBookingPatch, type BookingPatch } from "@/app/app/booking-settings-actions";
import { Chip, MIN_DEPOSIT_PERCENT, NairaInput, PercentInput, Sheet } from "@/components/today/Sheet";
import { GAP_CHOICES, gapLabel } from "@/lib/bookings";
import { reachLabel } from "@/lib/presets";
import type { OpeningHours, TravelReach, WorkPlace } from "@/lib/types";

export interface BookingSettingsData {
  enabled: boolean;
  hours: OpeningHours;
  capacity: number;
  noticeMinutes: number;
  aheadDays: number;
  workPlace: WorkPlace;
  travelFee: number;
  travelReach: TravelReach;
  place: { area: string; city: string; state: string };
  deposit: { mode: "off" | "percent" | "fixed"; percent?: number; fixedKobo?: number; counts: boolean };
  rules: string[];
  services: { id: string; name: string; questions: string[]; gapMinutes?: number }[];
  gapMinutes: number;
  homeGapMinutes: number;
}

type Row = "hours" | "capacity" | "timing" | "gap" | "place" | "deposit" | "rules" | "questions" | null;
const naira = (n: number) => "₦" + Math.round(n).toLocaleString("en-NG");
const t12 = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
};
const dayText = (d: OpeningHours["weekdays"]) => (d.open ? `${t12(d.from)}–${t12(d.to)}` : "closed");
const NOTICE: [number, string][] = [
  [0, "Any time"],
  [60, "1 hour before"],
  [120, "2 hours before"],
  [360, "6 hours before"],
  [1440, "The day before"],
];
const AHEAD: [number, string][] = [
  [14, "2 weeks"],
  [31, "1 month"],
  [92, "3 months"],
  [186, "6 months"],
];

export function BookingSettingsV2({ d }: { d: BookingSettingsData }) {
  const router = useRouter();
  const [open, setOpen] = useState<Row>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const save = (p: BookingPatch, close = true) =>
    start(async () => {
      setError("");
      const r = await saveBookingPatch(p);
      if (!r.ok) return setError(r.error);
      router.refresh();
      if (close) setOpen(null);
    });

  const depositText =
    d.deposit.mode === "off" ? "No deposit" : d.deposit.mode === "fixed" ? `${naira((d.deposit.fixedKobo ?? 0) / 100)} on every booking` : `${d.deposit.percent ?? 30}% of the price`;
  const asked = d.services.filter((s) => s.questions.length).length;

  return (
    <div className="grid gap-4">
      <button type="button" onClick={() => save({ kind: "open", enabled: !d.enabled }, false)} disabled={pending} className="flex min-h-16 items-center gap-3 rounded-card border border-line bg-surface-raised px-4 text-left">
        <Power size={20} className={d.enabled ? "text-success" : "text-ink-muted"} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <b className="block">{d.enabled ? "Customers can book on your page" : "Bookings are paused"}</b>
          <span className="text-caption text-ink-muted">{d.enabled ? "Tap to pause, for a holiday or a busy week." : "Tap to open bookings again."}</span>
        </span>
        <span className={`relative inline-block h-7 w-11.5 shrink-0 rounded-pill ${d.enabled ? "bg-success" : "bg-line-strong"}`} aria-hidden="true">
          <span className={`absolute top-0.75 left-0.75 size-5.5 rounded-pill bg-surface-raised transition-transform ${d.enabled ? "translate-x-4.5" : ""}`} />
        </span>
      </button>

      <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface-raised">
        <SettingRow icon={Clock} title="Opening hours" value={`Mon–Fri ${dayText(d.hours.weekdays)} · Sat ${dayText(d.hours.saturday)} · Sun ${dayText(d.hours.sunday)}`} onClick={() => setOpen("hours")} />
        <SettingRow icon={Users} title="Customers at the same time" value={d.capacity === 1 ? "1: just you" : `${d.capacity} at once`} onClick={() => setOpen("capacity")} />
        <SettingRow icon={CalendarClock} title="How soon and how far ahead" value={`${NOTICE.find(([m]) => m === d.noticeMinutes)?.[1] ?? `${d.noticeMinutes} min before`} · up to ${AHEAD.find(([n]) => n === d.aheadDays)?.[1] ?? `${d.aheadDays} days`} ahead`} onClick={() => setOpen("timing")} />
        <SettingRow icon={Timer} title="Time between bookings" value={gapText(d)} onClick={() => setOpen("gap")} />
        <SettingRow icon={Car} title="Where you work" value={d.workPlace === "shop" ? "Customers come to you" : `${d.workPlace === "home" ? "You go to customers" : "Both"} · travel fee ${naira(d.travelFee)}`} onClick={() => setOpen("place")} />
        <SettingRow icon={Wallet} title="Deposit" value={`${depositText}${d.deposit.mode !== "off" ? (d.deposit.counts ? " · counts towards the bill" : " · on top of the bill") : ""}`} onClick={() => setOpen("deposit")} />
        <SettingRow icon={ScrollText} title="Booking rules" value={d.rules.length ? `${d.rules.length} rules customers see before they pay` : "No rules yet"} onClick={() => setOpen("rules")} />
        <SettingRow icon={MessageCircleQuestion} title="Questions when booking" value={asked ? `Asked on ${asked} ${asked === 1 ? "service" : "services"}` : "None yet, e.g. “Any allergies?”"} onClick={() => setOpen("questions")} />
      </ul>
      {error && !open && (
        <p role="alert" className="text-body text-danger">
          {error}
        </p>
      )}

      {open === "hours" && <HoursSheet initial={d.hours} pending={pending} error={error} onSave={(hours) => save({ kind: "hours", hours })} onClose={() => setOpen(null)} />}
      {open === "capacity" && <CapacitySheet initial={d.capacity} pending={pending} onSave={(capacity) => save({ kind: "capacity", capacity })} onClose={() => setOpen(null)} />}
      {open === "timing" && <TimingSheet d={d} pending={pending} onSave={(noticeMinutes, aheadDays) => save({ kind: "timing", noticeMinutes, aheadDays })} onClose={() => setOpen(null)} />}
      {open === "gap" && <GapSheet d={d} pending={pending} onSave={(p) => save({ kind: "gap", ...p })} onClose={() => setOpen(null)} />}
      {open === "place" && <PlaceSheet d={d} pending={pending} onSave={(p) => save({ kind: "place", ...p })} onClose={() => setOpen(null)} />}
      {open === "deposit" && <DepositSheet d={d} pending={pending} onSave={(p) => save({ kind: "deposit", ...p })} onClose={() => setOpen(null)} />}
      {open === "rules" && <RulesSheet initial={d.rules} pending={pending} onSave={(rules) => save({ kind: "rules", rules })} onClose={() => setOpen(null)} />}
      {open === "questions" && <QuestionsSheet services={d.services} pending={pending} onSave={(serviceId, questions) => save({ kind: "questions", serviceId, questions }, false)} onClose={() => setOpen(null)} />}
    </div>
  );
}

function SettingRow({ icon: Icon, title, value, onClick }: { icon: typeof Clock; title: string; value: string; onClick: () => void }) {
  return (
    <li>
      <button type="button" onClick={onClick} className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-sunken">
        <Icon size={20} className="shrink-0 text-ink-muted" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <b className="block">{title}</b>
          <span className="text-caption text-ink-muted">{value}</span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-ink-muted" aria-hidden="true" />
      </button>
    </li>
  );
}

function SaveButton({ pending, onClick, label = "Save" }: { pending: boolean; onClick: () => void; label?: string }) {
  return (
    <button type="button" className="btn btn-lg w-full rounded-pill" disabled={pending} onClick={onClick}>
      {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <CircleCheck aria-hidden="true" />} {label}
    </button>
  );
}

function HoursSheet({ initial, pending, error, onSave, onClose }: { initial: OpeningHours; pending: boolean; error: string; onSave: (h: OpeningHours) => void; onClose: () => void }) {
  const [h, setH] = useState(initial);
  return (
    <Sheet title="Opening hours" onClose={onClose}>
      <p className="text-body text-ink-muted">Customers can only book inside these times.</p>
      {(
        [
          ["weekdays", "Monday to Friday"],
          ["saturday", "Saturday"],
          ["sunday", "Sunday"],
        ] as const
      ).map(([k, l]) => (
        <div key={k} className="grid gap-2 rounded-md border border-line bg-surface-raised px-4 py-3">
          <label className="flex min-h-9 items-center justify-between">
            <b>{l}</b>
            <span className="flex items-center gap-2 text-sm">
              {h[k].open ? "Open" : "Closed"}
              <input type="checkbox" className="size-5 accent-[var(--brand)]" checked={h[k].open} onChange={(e) => setH({ ...h, [k]: { ...h[k], open: e.target.checked } })} />
            </span>
          </label>
          {h[k].open && (
            <div className="grid grid-cols-2 gap-2">
              <input type="time" aria-label={`${l} opens`} className="input" value={h[k].from} onChange={(e) => setH({ ...h, [k]: { ...h[k], from: e.target.value } })} />
              <input type="time" aria-label={`${l} closes`} className="input" value={h[k].to} onChange={(e) => setH({ ...h, [k]: { ...h[k], to: e.target.value } })} />
            </div>
          )}
        </div>
      ))}
      {error && <p role="alert" className="text-body text-danger">{error}</p>}
      <SaveButton pending={pending} onClick={() => onSave(h)} />
    </Sheet>
  );
}

function CapacitySheet({ initial, pending, onSave, onClose }: { initial: number; pending: boolean; onSave: (n: number) => void; onClose: () => void }) {
  const [n, setN] = useState(initial);
  return (
    <Sheet title="Customers at the same time" onClose={onClose}>
      <p className="text-body text-ink-muted">If you have helpers or more than one chair, more customers can book the same time.</p>
      <div className="flex items-center justify-center gap-5 py-2">
        <button type="button" className="grid size-14 place-items-center rounded-pill border border-line-strong text-2xl" aria-label="Fewer" onClick={() => setN(Math.max(1, n - 1))}>
          −
        </button>
        <span className="w-14 text-center text-[44px] leading-none font-extrabold" aria-live="polite">
          {n}
        </span>
        <button type="button" className="grid size-14 place-items-center rounded-pill border border-line-strong text-2xl" aria-label="More" onClick={() => setN(Math.min(8, n + 1))}>
          +
        </button>
      </div>
      <SaveButton pending={pending} onClick={() => onSave(n)} />
    </Sheet>
  );
}

function TimingSheet({ d, pending, onSave, onClose }: { d: BookingSettingsData; pending: boolean; onSave: (notice: number, ahead: number) => void; onClose: () => void }) {
  const [notice, setNotice] = useState(d.noticeMinutes);
  const [ahead, setAhead] = useState(d.aheadDays);
  return (
    <Sheet title="How soon and how far ahead" onClose={onClose}>
      <div>
        <span className="text-label mb-1.5 block">The latest someone can book</span>
        <div className="flex flex-wrap gap-2">
          {NOTICE.map(([m, l]) => (
            <Chip key={m} on={notice === m} onClick={() => setNotice(m)}>
              {l}
            </Chip>
          ))}
        </div>
      </div>
      <div>
        <span className="text-label mb-1.5 block">How far ahead they can book</span>
        <div className="flex flex-wrap gap-2">
          {AHEAD.map(([n, l]) => (
            <Chip key={n} on={ahead === n} onClick={() => setAhead(n)}>
              {l}
            </Chip>
          ))}
        </div>
        <p className="text-caption mt-1.5 text-ink-muted">Brides book months ahead: 6 months works well for weddings.</p>
      </div>
      <SaveButton pending={pending} onClick={() => onSave(notice, ahead)} />
    </Sheet>
  );
}

function PlaceSheet({ d, pending, onSave, onClose }: { d: BookingSettingsData; pending: boolean; onSave: (p: { workPlace: WorkPlace; travelFee: number; travelReach: TravelReach }) => void; onClose: () => void }) {
  const [wp, setWp] = useState(d.workPlace);
  const [fee, setFee] = useState(d.travelFee);
  const [reach, setReach] = useState(d.travelReach);
  return (
    <Sheet title="Where you work" onClose={onClose}>
      <div className="flex flex-wrap gap-2">
        <Chip on={wp === "shop"} onClick={() => setWp("shop")}>
          Customers come to me
        </Chip>
        <Chip on={wp === "home"} onClick={() => setWp("home")}>
          I go to customers
        </Chip>
        <Chip on={wp === "both"} onClick={() => setWp("both")}>
          Both
        </Chip>
      </div>
      {wp !== "shop" && (
        <>
          <div>
            <span className="text-label mb-1.5 block">How far will you go?</span>
            <div className="flex flex-wrap gap-2">
              {(["area", "city", "state"] as TravelReach[]).map((r) => (
                <Chip key={r} on={reach === r} onClick={() => setReach(r)}>
                  {reachLabel(r, d.place)}
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="bs-fee" className="text-label mb-1.5 block">
              Travel fee
            </label>
            <NairaInput id="bs-fee" value={fee} onChange={setFee} label="Travel fee" />
          </div>
        </>
      )}
      <SaveButton pending={pending} onClick={() => onSave({ workPlace: wp, travelFee: fee, travelReach: reach })} />
    </Sheet>
  );
}

function DepositSheet({ d, pending, onSave, onClose }: { d: BookingSettingsData; pending: boolean; onSave: (p: { mode: "percent" | "fixed" | "off"; percent?: number; amount?: number; counts: boolean }) => void; onClose: () => void }) {
  const [mode, setMode] = useState<"percent" | "fixed" | "off">(d.deposit.mode);
  const [percent, setPercent] = useState(d.deposit.percent ?? 30);
  const [amount, setAmount] = useState((d.deposit.fixedKobo ?? 500_000) / 100);
  const [counts, setCounts] = useState(d.deposit.counts);
  return (
    <Sheet title="Deposit" onClose={onClose}>
      <p className="text-body text-ink-muted">Customers pay it when they book. If they don&apos;t come, you keep it. Wedding and event days always take 50%.</p>
      <div className="flex flex-wrap gap-2">
        {[20, 30, 40, 50].map((p) => (
          <Chip key={p} on={mode === "percent" && percent === p} onClick={() => { setMode("percent"); setPercent(p); }}>
            {p}%
          </Chip>
        ))}
        <Chip on={mode === "fixed"} onClick={() => setMode("fixed")}>
          Fixed amount
        </Chip>
        <Chip on={mode === "off"} onClick={() => setMode("off")}>
          No deposit
        </Chip>
      </div>
      {mode === "percent" && (
        <div>
          <label htmlFor="bs-dep-pct" className="text-label mb-1.5 block">Or type your own</label>
          <PercentInput id="bs-dep-pct" value={percent} onChange={setPercent} label="Deposit percentage" />
          {percent < MIN_DEPOSIT_PERCENT && <p className="text-caption mt-1.5 text-ink-muted">At least {MIN_DEPOSIT_PERCENT}%.</p>}
        </div>
      )}
      {mode === "fixed" && <NairaInput id="bs-dep" value={amount} onChange={setAmount} label="Deposit for every booking" />}
      {mode === "off" && <p className="text-body rounded-md bg-gold-soft px-4 py-3">Without a deposit, people who book and don&apos;t come cost you the time.</p>}
      {mode !== "off" && (
        <label className="flex min-h-12 items-center justify-between gap-3">
          <span>
            <b className="block">Counts towards the bill</b>
            <span className="text-caption text-ink-muted">{counts ? "They pay the rest on the day." : "They pay the full price on the day."}</span>
          </span>
          <input type="checkbox" className="size-5 accent-[var(--brand)]" checked={counts} onChange={(e) => setCounts(e.target.checked)} />
        </label>
      )}
      <SaveButton
        pending={pending}
        onClick={() => onSave(mode === "off" ? { mode: "off", counts } : mode === "fixed" ? { mode: "fixed", amount, counts } : { mode: "percent", percent: Math.max(MIN_DEPOSIT_PERCENT, percent), counts })}
      />
    </Sheet>
  );
}

function RulesSheet({ initial, pending, onSave, onClose }: { initial: string[]; pending: boolean; onSave: (r: string[]) => void; onClose: () => void }) {
  const [rules, setRules] = useState(initial.length ? initial : [""]);
  return (
    <Sheet title="Booking rules" onClose={onClose}>
      <p className="text-body text-ink-muted">Customers see these before they pay. Tap a line to change it.</p>
      <div className="divide-y divide-line rounded-card border border-line bg-surface-raised">
        {rules.map((r, i) => (
          <div key={i} className="flex items-start gap-2 px-4 py-3">
            <textarea aria-label={`Rule ${i + 1}`} className="min-h-11 min-w-0 flex-1 resize-none bg-transparent leading-[22px] outline-none [field-sizing:content]" value={r} onChange={(e) => setRules(rules.map((x, j) => (j === i ? e.target.value : x)))} />
            <button type="button" aria-label={`Remove rule ${i + 1}`} className="-mt-2 -mr-2 grid size-11 shrink-0 place-items-center text-ink-muted" onClick={() => setRules(rules.filter((_, j) => j !== i))}>
              <Trash2 size={18} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="text-label inline-flex min-h-11 items-center gap-1.5 justify-self-start text-brand" onClick={() => setRules([...rules, ""])}>
        <Plus size={16} aria-hidden="true" /> Add a rule
      </button>
      <SaveButton pending={pending} onClick={() => onSave(rules)} />
    </Sheet>
  );
}

function QuestionsSheet({ services, pending, onSave, onClose }: { services: BookingSettingsData["services"]; pending: boolean; onSave: (serviceId: string, q: string[]) => void; onClose: () => void }) {
  const [pick, setPick] = useState<string | null>(null);
  const svc = services.find((s) => s.id === pick);
  const [qs, setQs] = useState<string[]>([]);
  if (!svc)
    return (
      <Sheet title="Questions when booking" onClose={onClose}>
        <p className="text-body text-ink-muted">Ask what you need to know before the day, like allergies, hair length or how many bridesmaids. Up to 3 per service.</p>
        <ul className="divide-y divide-line rounded-card border border-line bg-surface-raised">
          {services.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className="flex min-h-14 w-full items-center gap-3 px-4 text-left active:bg-surface-sunken"
                onClick={() => {
                  setPick(s.id);
                  setQs(s.questions.length ? s.questions : [""]);
                }}
              >
                <span className="min-w-0 flex-1">
                  <b className="block">{s.name}</b>
                  <span className="text-caption text-ink-muted">{s.questions.length ? s.questions.join(" · ") : "No questions"}</span>
                </span>
                <ChevronRight size={18} className="text-ink-muted" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    );
  return (
    <Sheet title={svc.name} onClose={onClose}>
      <p className="text-body text-ink-muted">Customers answer these when they book {svc.name.toLowerCase()}.</p>
      {qs.map((q, i) => (
        <div key={i} className="flex items-center gap-2">
          <input aria-label={`Question ${i + 1}`} className="input h-12 min-w-0 flex-1" value={q} maxLength={80} placeholder={i === 0 ? "e.g. Any allergies?" : "e.g. Will you bring your own hair?"} onChange={(e) => setQs(qs.map((x, j) => (j === i ? e.target.value : x)))} />
          <button type="button" aria-label={`Remove question ${i + 1}`} className="grid size-11 shrink-0 place-items-center text-ink-muted" onClick={() => setQs(qs.filter((_, j) => j !== i))}>
            <Trash2 size={18} aria-hidden="true" />
          </button>
        </div>
      ))}
      {qs.length < 3 && (
        <button type="button" className="text-label inline-flex min-h-11 items-center gap-1.5 justify-self-start text-brand" onClick={() => setQs([...qs, ""])}>
          <Plus size={16} aria-hidden="true" /> Add a question
        </button>
      )}
      <SaveButton
        pending={pending}
        onClick={() => {
          onSave(svc.id, qs);
          setPick(null);
        }}
        label="Save questions"
      />
    </Sheet>
  );
}

const gapWord = (m: number) => (m ? gapLabel(m) : "None");

function gapText(d: BookingSettingsData): string {
  const own = d.services.filter((s) => s.gapMinutes != null).length;
  const parts = [d.gapMinutes ? `${gapLabel(d.gapMinutes)} after each booking` : "No gap between bookings"];
  if (d.workPlace !== "shop" && d.homeGapMinutes) parts.push(`+${gapLabel(d.homeGapMinutes)} after home visits`);
  if (own) parts.push(`${own} ${own === 1 ? "service has" : "services have"} its own`);
  return parts.join(" · ");
}

/** Gap time: minutes kept free after each booking, extra after a home visit, and any service's own. */
function GapSheet({ d, pending, onSave, onClose }: { d: BookingSettingsData; pending: boolean; onSave: (p: { gapMinutes: number; homeGapMinutes: number; services: { id: string; gapMinutes: number | null }[] }) => void; onClose: () => void }) {
  const [gap, setGap] = useState(d.gapMinutes);
  const [home, setHome] = useState(d.homeGapMinutes);
  const [own, setOwn] = useState<Record<string, number | null>>(Object.fromEntries(d.services.map((s) => [s.id, s.gapMinutes ?? null])));
  const [showOwn, setShowOwn] = useState(d.services.some((s) => s.gapMinutes != null));
  return (
    <Sheet title="Time between bookings" onClose={onClose}>
      <p className="text-body text-ink-muted">Time to clean up, rest or get ready before the next customer. Customers can&apos;t book into it, and their booking still shows its real length.</p>
      <div>
        <b className="mb-2 block">After every booking</b>
        <div className="flex flex-wrap gap-2">
          {GAP_CHOICES.map((m) => (
            <Chip key={m} on={gap === m} onClick={() => setGap(m)}>
              {gapWord(m)}
            </Chip>
          ))}
        </div>
      </div>
      {d.workPlace !== "shop" && (
        <div>
          <b className="block">Extra after a home visit</b>
          <span className="text-caption mb-2 block text-ink-muted">To get back or on to the next place.</span>
          <div className="flex flex-wrap gap-2">
            {[0, 30, 45, 60, 90].map((m) => (
              <Chip key={m} on={home === m} onClick={() => setHome(m)}>
                {gapWord(m)}
              </Chip>
            ))}
          </div>
        </div>
      )}
      {d.services.length > 0 &&
        (showOwn ? (
          <div className="grid gap-2">
            <b>Services that need a different time</b>
            <ul className="divide-y divide-line rounded-card border border-line bg-surface-raised">
              {d.services.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="min-w-0 truncate">{s.name}</span>
                  <select
                    aria-label={`Time after ${s.name}`}
                    className="input h-11 w-auto shrink-0"
                    value={own[s.id] == null ? "" : String(own[s.id])}
                    onChange={(e) => setOwn({ ...own, [s.id]: e.target.value === "" ? null : Number(e.target.value) })}
                  >
                    <option value="">Usual ({gapWord(gap)})</option>
                    {GAP_CHOICES.map((m) => (
                      <option key={m} value={m}>
                        {gapWord(m)}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <button type="button" className="text-label justify-self-start text-brand underline underline-offset-4" onClick={() => setShowOwn(true)}>
            Some services need a different time
          </button>
        ))}
      <SaveButton pending={pending} onClick={() => onSave({ gapMinutes: gap, homeGapMinutes: home, services: Object.entries(own).map(([id, g]) => ({ id, gapMinutes: g })) })} />
    </Sheet>
  );
}
