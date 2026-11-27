"use client";

// The homepage search (docs/HOMEPAGE_PLAN.md, prototype design/prototypes/homepage.html): what,
// where and when. On a phone, a pill that opens a full-screen sheet with the three questions as
// stacked cards, one open at a time (a pick moves on to the next). On a computer, one bar with three
// segments and a panel under the one you pick. Search goes to /search with the picks in the address.

import { ArrowRight, ChevronLeft, ChevronRight, LocateFixed, MapPin, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { TRADES, type TradeId } from "@/lib/presets";
import { matchPlaces, POPULAR, searchHref, watToday, whatLabel, whenLabel, type SearchQuery, type TimeOfDay, type When } from "@/lib/search";
import { TRADE_ICONS } from "./tradeIcons";

type Step = "what" | "where" | "when";
const COMMON_PLACES = [
  { label: "Ibadan", hint: "Oyo" },
  { label: "Lagos", hint: "Lagos" },
  { label: "Abuja", hint: "FCT" },
  { label: "Ogbomoso", hint: "Oyo" },
  { label: "Port Harcourt", hint: "Rivers" },
  { label: "Enugu", hint: "Enugu" },
];

export function SearchBox({ initial, variant = "hero" }: { initial?: Partial<SearchQuery>; variant?: "hero" | "bar" }) {
  const router = useRouter();
  const [q, setQ] = useState<SearchQuery>({ when: "any", ...initial });
  const [seg, setSeg] = useState<Step | null>(null);
  const [sheet, setSheet] = useState(false);
  const [step, setStep] = useState<Step>("what");
  const barRef = useRef<HTMLDivElement>(null);
  const initialRef = useRef(initial);
  useEffect(() => {
    initialRef.current = initial;
  });

  // Next.js keeps a page alive (hidden) after leaving it, so coming back Home would show the last
  // search still typed in. Start fresh each time the box is hidden.
  useLayoutEffect(
    () => () => {
      setQ({ when: "any", ...initialRef.current });
      setSeg(null);
      setSheet(false);
      setStep("what");
    },
    [],
  );

  const set = (patch: Partial<SearchQuery>, next?: Step | null) => {
    setQ((cur) => ({ ...cur, ...patch }));
    if (next !== undefined) {
      if (sheet && next) setStep(next);
      if (seg) setSeg(next);
    }
  };
  function go() {
    setSeg(null);
    setSheet(false);
    router.push(searchHref(q));
  }

  // Close the computer panel on a click outside or Escape; Escape closes the phone sheet.
  useEffect(() => {
    const click = (e: MouseEvent) => seg && barRef.current && !barRef.current.contains(e.target as Node) && setSeg(null);
    const key = (e: KeyboardEvent) => e.key === "Escape" && (setSeg(null), setSheet(false));
    document.addEventListener("mousedown", click);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", click);
      document.removeEventListener("keydown", key);
    };
  }, [seg]);
  useEffect(() => {
    document.body.style.overflow = sheet ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [sheet]);

  const what = whatLabel(q);
  const when = whenLabel(q);
  const big = variant === "hero";

  return (
    <>
      {/* Phone: the pill */}
      <button
        type="button"
        onClick={() => (setStep("what"), setSheet(true))}
        aria-label="Search: what, where and when"
        className={`flex w-full items-center gap-3 rounded-pill border border-line bg-surface-raised text-left shadow-raised md:hidden ${big ? "mx-auto mt-6 min-h-16 max-w-[520px] py-2.5 pr-2.5 pl-5" : "min-h-13 py-1.5 pr-1.5 pl-4"}`}
      >
        <Search size={20} className="shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <b className="block truncate text-[16px]">{what || "What do you need?"}</b>
          <span className="block truncate text-[13px] text-ink-muted">
            {q.where || "Anywhere"} · {when}
          </span>
        </span>
        <span className={`grid shrink-0 place-items-center rounded-pill bg-brand text-on-brand ${big ? "size-11" : "size-10"}`} aria-hidden="true">
          <ArrowRight size={18} />
        </span>
      </button>

      {/* Computer: three segments and a panel */}
      <div ref={barRef} className={`relative mx-auto hidden md:block ${big ? "mt-8 max-w-[920px]" : "max-w-[760px]"}`}>
        <div className={`grid grid-cols-[1.2fr_1fr_1fr_auto] items-center rounded-pill border border-line p-2 shadow-raised ${seg ? "bg-surface-sunken" : "bg-surface-raised"}`}>
          {(
            [
              ["what", "What", what, "Service or business"],
              ["where", "Where", q.where ?? "", "Anywhere in Nigeria"],
              ["when", "When", q.when === "any" && !q.tod ? "" : when, "Any time"],
            ] as const
          ).map(([key, label, value, empty], i) => (
            <button
              key={key}
              type="button"
              aria-expanded={seg === key}
              onClick={() => setSeg(seg === key ? null : key)}
              className={`relative min-h-15 rounded-pill px-5 text-left ${seg === key ? "bg-surface-raised shadow-raised" : ""} ${i > 0 && seg !== key ? "before:absolute before:top-4 before:bottom-4 before:left-0 before:w-px before:bg-line" : ""}`}
            >
              <b className="block text-[13px]">{label}</b>
              <span className={`block truncate text-[15px] ${value ? "font-medium text-ink" : "text-ink-muted"}`}>{value || empty}</span>
            </button>
          ))}
          <button type="button" onClick={go} className="btn btn-lg ml-1 min-h-14 rounded-pill px-6">
            <Search size={18} aria-hidden="true" /> Search
          </button>
        </div>
        {seg && (
          <div
            className={`absolute top-[calc(100%+12px)] z-30 max-h-[70vh] overflow-y-auto rounded-[28px] border border-line bg-surface-raised p-6 text-left shadow-raised ${seg === "what" ? "left-0 w-[460px]" : seg === "where" ? "left-[28%] w-[420px]" : "right-0 w-[520px]"}`}
          >
            {seg === "what" && <WhatStep q={q} set={set} autoFocus />}
            {seg === "where" && <WhereStep q={q} set={set} autoFocus />}
            {seg === "when" && <WhenStep q={q} set={set} />}
          </div>
        )}
      </div>

      {/* Phone: the sheet */}
      {sheet && (
        <div role="dialog" aria-modal="true" aria-label="Search" className="fixed inset-0 z-50 flex flex-col bg-surface-sunken text-left md:hidden">
          <div className="flex items-center justify-between px-3 pt-[max(8px,env(safe-area-inset-top))] pb-2">
            <button type="button" onClick={() => setSheet(false)} aria-label="Close search" className="grid size-11 place-items-center rounded-pill border border-line-strong bg-surface-raised">
              <X size={18} aria-hidden="true" />
            </button>
            <span className="text-label">Find and book</span>
            <span className="w-11" />
          </div>
          <div className="grid flex-1 content-start gap-3 overflow-y-auto px-3 pb-4">
            <SheetCard open={step === "what"} title="What do you need?" label="What" summary={what || "Anything"} onOpen={() => setStep("what")}>
              <WhatStep q={q} set={set} />
            </SheetCard>
            <SheetCard open={step === "where"} title="Where?" label="Where" summary={q.where || "Anywhere"} onOpen={() => setStep("where")}>
              <WhereStep q={q} set={set} />
            </SheetCard>
            <SheetCard open={step === "when"} title="When?" label="When" summary={when} onOpen={() => setStep("when")}>
              <WhenStep q={q} set={set} />
            </SheetCard>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-line bg-surface-raised px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
            <button type="button" onClick={() => (setQ({ when: "any" }), setStep("what"))} className="text-label min-h-11 px-1 underline underline-offset-4">
              Clear all
            </button>
            <button type="button" onClick={go} className="btn btn-lg min-h-13 rounded-pill px-6">
              <Search size={18} aria-hidden="true" /> Search
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function SheetCard({ open, title, label, summary, onOpen, children }: { open: boolean; title: string; label: string; summary: string; onOpen: () => void; children: React.ReactNode }) {
  if (!open) {
    return (
      <button type="button" onClick={onOpen} className="flex min-h-15 w-full items-center justify-between rounded-[24px] bg-surface-raised px-5 text-left shadow-raised">
        <span className="text-[14px] text-ink-muted">{label}</span>
        <b className="max-w-[60%] truncate text-[14px]">{summary}</b>
      </button>
    );
  }
  return (
    <section aria-label={title} className="rounded-[24px] bg-surface-raised p-5 shadow-raised">
      <h2 className="mb-3.5 text-[24px] leading-tight font-bold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

type SetFn = (patch: Partial<SearchQuery>, next?: Step | null) => void;

function Row({ icon, title, hint, onClick }: { icon: React.ReactNode; title: string; hint: string; onClick: () => void }) {
  return (
    <li>
      <button type="button" onClick={onClick} className="flex min-h-14 w-full items-center gap-3.5 rounded-md px-2 py-2 text-left hover:bg-surface-sunken focus-visible:bg-surface-sunken">
        <span className="grid size-11 shrink-0 place-items-center rounded-md bg-brand-soft text-brand">{icon}</span>
        <span>
          <b className="block text-[15px]">{title}</b>
          <span className="block text-[13px] text-ink-muted">{hint}</span>
        </span>
      </button>
    </li>
  );
}

function WhatStep({ q, set, autoFocus }: { q: SearchQuery; set: SetFn; autoFocus?: boolean }) {
  const [typed, setTyped] = useState(q.q ?? "");
  const t = typed.trim().toLowerCase();
  const list = t ? POPULAR.filter((p) => p.name.toLowerCase().includes(t)) : POPULAR;
  const trades = t ? TRADES.filter((x) => x.name.toLowerCase().includes(t)) : [];
  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          set({ q: typed.trim() || undefined, trade: undefined }, "where");
        }}
        className="flex min-h-13 items-center gap-2.5 rounded-md border border-line-strong bg-surface-raised px-3.5 focus-within:outline-2 focus-within:outline-brand"
      >
        <Search size={18} aria-hidden="true" />
        <input
          autoFocus={autoFocus}
          aria-label="Service or business"
          className="min-h-12 min-w-0 flex-1 bg-transparent text-[16px] outline-none"
          placeholder="Braids, makeup, photoshoot…"
          value={typed}
          enterKeyHint="next"
          onChange={(e) => setTyped(e.target.value)}
        />
      </form>
      <p className="text-label mt-4 mb-1 text-ink-muted">{t ? "Matches" : "Popular"}</p>
      <ul>
        {trades.map((x) => {
          const Icon = TRADE_ICONS[x.id];
          return <Row key={x.id} icon={<Icon size={20} aria-hidden="true" />} title={x.name} hint={x.examples} onClick={() => set({ trade: x.id, q: undefined }, "where")} />;
        })}
        {list.slice(0, 6).map((p) => {
          const Icon = TRADE_ICONS[p.trade];
          return <Row key={p.name} icon={<Icon size={20} aria-hidden="true" />} title={p.name} hint={TRADES.find((x) => x.id === p.trade)?.name ?? ""} onClick={() => set({ q: p.name, trade: undefined }, "where")} />;
        })}
        {t && (
          <Row icon={<Search size={20} aria-hidden="true" />} title={`Search for “${typed.trim()}”`} hint="Services and business names" onClick={() => set({ q: typed.trim(), trade: undefined }, "where")} />
        )}
      </ul>
      {!t && (
        <>
          <p className="text-label mt-3 mb-2 text-ink-muted">Or a kind of business</p>
          <div className="flex flex-wrap gap-2">
            {TRADES.map((x) => (
              <Chip key={x.id} on={q.trade === x.id && !q.q} onClick={() => set({ trade: x.id as TradeId, q: undefined }, "where")}>
                {x.name}
              </Chip>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function WhereStep({ q, set, autoFocus }: { q: SearchQuery; set: SetFn; autoFocus?: boolean }) {
  const [typed, setTyped] = useState(q.where ?? "");
  const matches = matchPlaces(typed);
  const list = typed.trim() ? matches : COMMON_PLACES;
  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          set({ where: typed.trim() || undefined }, "when");
        }}
        className="flex min-h-13 items-center gap-2.5 rounded-md border border-line-strong bg-surface-raised px-3.5 focus-within:outline-2 focus-within:outline-brand"
      >
        <MapPin size={18} aria-hidden="true" />
        <input
          autoFocus={autoFocus}
          aria-label="Area, city or state"
          className="min-h-12 min-w-0 flex-1 bg-transparent text-[16px] outline-none"
          placeholder="Area, city or state"
          value={typed}
          enterKeyHint="next"
          onChange={(e) => setTyped(e.target.value)}
        />
      </form>
      <ul className="mt-2">
        <Row icon={<LocateFixed size={20} aria-hidden="true" />} title="Anywhere" hint="Every city, and people who come to you" onClick={() => set({ where: undefined }, "when")} />
        {list.map((p) => (
          <Row key={`${p.label}|${p.hint}`} icon={<MapPin size={20} aria-hidden="true" />} title={p.label} hint={p.hint} onClick={() => set({ where: p.label }, "when")} />
        ))}
        {typed.trim() && !matches.some((m) => m.label.toLowerCase() === typed.trim().toLowerCase()) && (
          <Row icon={<MapPin size={20} aria-hidden="true" />} title={typed.trim()} hint="An area, like Bodija or Lekki" onClick={() => set({ where: typed.trim() }, "when")} />
        )}
      </ul>
    </div>
  );
}

function WhenStep({ q, set }: { q: SearchQuery; set: SetFn }) {
  const opts: [When, string][] = [
    ["any", "Any time"],
    ["today", "Today"],
    ["tomorrow", "Tomorrow"],
    ["weekend", "This weekend"],
  ];
  const tods: [TimeOfDay, string, string][] = [
    ["morning", "Morning", "before 12"],
    ["afternoon", "Afternoon", "12 to 4"],
    ["evening", "Evening", "after 4"],
  ];
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {opts.map(([k, l]) => (
          <Chip key={k} on={q.when === k} onClick={() => set({ when: k, date: undefined })}>
            {l}
          </Chip>
        ))}
      </div>
      <MonthPicker value={q.when === "date" ? q.date : undefined} onPick={(day) => set({ when: "date", date: day })} />
      <p className="text-label mt-4 mb-2 text-ink-muted">Time of day</p>
      <div className="flex flex-wrap gap-2">
        {tods.map(([k, l, hint]) => (
          <Chip key={k} on={q.tod === k} onClick={() => set({ tod: q.tod === k ? undefined : k })}>
            {l} <span className="font-normal opacity-70">{hint}</span>
          </Chip>
        ))}
      </div>
    </div>
  );
}

function MonthPicker({ value, onPick }: { value?: string; onPick: (day: string) => void }) {
  const [today] = useState(() => watToday(new Date()));
  const [offset, setOffset] = useState(0);
  const [y, m] = today.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1 + offset, 1));
  const first = base.getUTCDay();
  const days = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  const key = (d: number) => `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return (
    <div className="mt-4">
      <div className="mb-1 flex items-center justify-between">
        <button type="button" disabled={offset <= 0} onClick={() => setOffset(offset - 1)} aria-label="Previous month" className="grid size-11 place-items-center rounded-pill hover:bg-surface-sunken disabled:opacity-30">
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <b className="text-[15px]">{base.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}</b>
        <button type="button" disabled={offset >= 2} onClick={() => setOffset(offset + 1)} aria-label="Next month" className="grid size-11 place-items-center rounded-pill hover:bg-surface-sunken disabled:opacity-30">
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <span key={i} className="py-1.5 text-[12px] text-ink-muted">
            {d}
          </span>
        ))}
        {Array.from({ length: first }, (_, i) => (
          <span key={`e${i}`} />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const k = key(i + 1);
          const past = k < today;
          const on = value === k;
          return (
            <button
              key={k}
              type="button"
              disabled={past}
              aria-pressed={on}
              aria-label={new Date(`${k}T12:00:00Z`).toDateString()}
              onClick={() => onPick(k)}
              className={`aspect-square min-h-10 rounded-pill text-[14px] ${on ? "bg-ink text-surface" : "hover:outline hover:outline-1 hover:outline-ink"} ${k === today ? "font-bold" : ""} disabled:opacity-35 disabled:hover:outline-0`}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-pill border px-4 text-[14px] font-semibold ${on ? "border-ink bg-ink text-surface" : "border-line-strong bg-surface-raised"}`}
    >
      {children}
    </button>
  );
}
