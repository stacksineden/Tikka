"use client";

// NEW DIRECTION, stage 2 (docs/OWNER_JOURNEYS.md journeys 4 and 5): the owner's day on one screen.

import {
  Banknote,
  CalendarDays,
  Car,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Globe,
  Link2,
  Loader2,
  MapPin,
  Moon,
  Plus,
  ScanLine,
  Send,
  Smartphone,
  Sparkles,
  UserCheck,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { arrivedAction, paidAction, payBalanceAction, payLinkTodayAction, sampleDayAction } from "@/app/app/today-actions";
import { PayLinkReady, payLinkMessage } from "@/components/payments/PayLinkSheet";
import { ReceiptButton } from "@/components/payments/ReceiptButton";
import { StayFresh } from "@/components/payments/StayFresh";
import { matchesSearch, phoneKey, phoneTail, repeatedNames } from "@/lib/clients";
import { METHOD_LABEL, reminderText, waLink, type ExpenseKind, type PayMethod } from "@/lib/ledger";
import { ExpenseSheet } from "./ExpenseSheet";
import { Chip, NairaInput, Sheet } from "./Sheet";

export interface TodayAppt {
  id: string;
  time: string;
  first: string;
  phone?: string;
  service: string;
  detail?: string;
  homeArea?: string;
  /** What's left to collect at the appointment. */
  dueKobo: number;
  depositKobo: number;
  /** The full price when booked; null when the booking has none (the Paid sheet asks). */
  priceKobo: number | null;
  /** The deposit comes off the price. */
  depositCounts: boolean;
  status: "booked" | "arrived" | "no_show" | "cancelled" | "held";
  /** Marked paid (or a pay link sent: kobo 0 until they pay); what's still owed on it. */
  paid: { kobo: number; method: PayMethod; owedKobo: number; linkKobo?: number; saleId: string } | null;
}

export interface TodayData {
  /** Pay links can be sent (payments are ready for the business). */
  payLinks: boolean;
  greetingName: string;
  businessName: string;
  slug: string;
  dateLabel: string;
  hour: number;
  appts: TodayAppt[];
  walkIns: { id: string; time: string; name: string; item: string; paidKobo: number; method: PayMethod; owedKobo: number; linkKobo?: number; phone?: string }[];
  tomorrow: { count: number; first?: string };
  /** linkKobo: a pay link for this much is out and not paid yet. */
  owed: { saleId: string; name: string; item: string; owedKobo: number; phone?: string; since: string; linkKobo?: number }[];
  services: { label: string; naira: number }[];
  /** Customers with a number, most recent first, for "Who was it?" on New sale. */
  customers: { name: string; phone: string }[];
  takenTodayKobo: number;
  demo: boolean;
}

const naira = (kobo: number) => "₦" + Math.round(kobo / 100).toLocaleString("en-NG");
/** The small actions on a row (Arrived, Remind, Paid): 44px tall, side by side. */
const ACT_BASE = "inline-flex min-h-11 items-center gap-1.5 rounded-pill border px-3.5 text-sm font-semibold disabled:opacity-50";
const ACT = `${ACT_BASE} border-line bg-surface text-ink`;
const ACT_MAIN = `${ACT_BASE} border-brand bg-brand text-on-brand`;
const PAY_CHOICES: [PayMethod, typeof Banknote][] = [
  ["cash", Banknote],
  ["transfer", Smartphone],
  ["pay_link", Link2],
];

type Open =
  | { kind: "paid"; appt: TodayAppt }
  | { kind: "remind"; appt: TodayAppt }
  | { kind: "remindOwed"; i: number }
  | { kind: "payOwed"; i: number }
  | { kind: "sale" }
  | { kind: "expense"; expense?: ExpenseKind }
  | null;

export function TodayScreen({ d }: { d: TodayData }) {
  const router = useRouter();
  const [open, setOpen] = useState<Open>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn();
      router.refresh();
    });

  const live = d.appts.filter((a) => a.status !== "cancelled");
  const unpaid = live.filter((a) => !a.paid && a.status !== "no_show");
  const toCollect = unpaid.reduce((n, a) => n + a.dueKobo, 0);
  const deposits = live.reduce((n, a) => n + a.depositKobo, 0);
  const owedTotal = d.owed.reduce((n, o) => n + o.owedKobo, 0);
  const greeting = d.hour < 12 ? "Good morning" : d.hour < 17 ? "Good afternoon" : "Good evening";
  // Long days stay short: the next 5 to see, then the rest on a tap; the done ones folded away.
  const [allTodo, setAllTodo] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [allOwed, setAllOwed] = useState(false);
  const todo = live.filter((a) => !a.paid && a.status !== "no_show");
  const doneAppts = live.filter((a) => a.paid || a.status === "no_show");
  const doneCount = doneAppts.length + d.walkIns.length;
  const SHOW = 5;

  // A pay link out: keep checking so "Pay link sent" turns to Paid without a reload.
  const linkOut = d.owed.some((o) => o.linkKobo);

  return (
    <div className="mx-auto grid max-w-6xl gap-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
      {linkOut && <StayFresh waiting />}
      <div className="flex items-center justify-between gap-3">
        <div>
          <span className="text-caption text-ink-muted">{d.dateLabel}</span>
          <h1 className="text-heading">
            {greeting}
            {d.greetingName ? `, ${d.greetingName}` : ""}
          </h1>
        </div>
        <Link href={`/${d.slug}`} target="_blank" className="grid size-11 place-items-center rounded-pill text-ink-muted active:bg-surface-sunken" aria-label="Open your page">
          <Globe size={22} aria-hidden="true" />
        </Link>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[1.35fr_1fr] lg:grid-rows-[auto_1fr]">
      <div className="grid gap-5 lg:col-start-2 lg:row-start-1">
      <section aria-label="Today in numbers" className="grid gap-4 rounded-card bg-brand p-5 text-on-brand">
        <div>
          <span className="block text-[17px] font-bold">
            {live.length} {live.length === 1 ? "customer" : "customers"} today
          </span>
          <div className="mt-1 font-mono text-[40px] leading-none font-bold tracking-normal lg:text-[46px]">{naira(toCollect)}</div>
          <span className="mt-1.5 block text-[15px] font-semibold opacity-90">still to collect today</span>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <span className="rounded-md bg-on-brand/15 px-3.5 py-3 text-[15px] font-semibold">
            <b className="block font-mono text-[22px] leading-tight font-bold lg:text-[24px]">{naira(deposits)}</b>deposits already paid
          </span>
          <span className="rounded-md bg-on-brand/15 px-3.5 py-3 text-[15px] font-semibold">
            <b className="block font-mono text-[22px] leading-tight font-bold lg:text-[24px]">{naira(d.takenTodayKobo)}</b>taken today
          </span>
        </div>
      </section>

      <div className="grid grid-cols-[1.4fr_1fr] gap-2.5">
        <button type="button" className="btn btn-lg rounded-pill bg-gold text-on-gold hover:bg-gold" onClick={() => setOpen({ kind: "sale" })}>
          <Plus aria-hidden="true" /> New sale
        </button>
        <Link href="/app/redeem" className="btn btn-secondary btn-lg rounded-pill">
          <ScanLine aria-hidden="true" /> Check a code
        </Link>
      </div>
      </div>

      <section className="grid gap-2.5 lg:col-start-1 lg:row-span-2 lg:row-start-1" aria-labelledby="t-day">
        <div className="flex items-center justify-between gap-2">
          <h2 id="t-day" className="text-title">
            Your day
          </h2>
          <Link href="/app/bookings#month" className="text-label inline-flex min-h-11 items-center gap-1 text-brand">
            <CalendarDays size={16} aria-hidden="true" /> See my calendar
          </Link>
        </div>
        {live.length > 0 && (
          <p className="text-caption -mt-2 text-ink-muted">
            {todo.length ? `${todo.length} still to come or pay` : "All done for today"}
            {doneCount ? ` · ${doneCount} done` : ""}
          </p>
        )}
        {live.length === 0 && d.walkIns.length === 0 && (
          <div className="grid gap-3 rounded-card border border-dashed border-line-strong bg-surface-raised p-4">
            <p className="text-body">No bookings today yet. When customers book on your page, they show up here.</p>
            {d.demo && (
              <button type="button" className="btn btn-secondary justify-self-start rounded-pill" disabled={pending} onClick={() => run(() => sampleDayAction())}>
                {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Sparkles aria-hidden="true" />} Add a sample day (demo)
              </button>
            )}
          </div>
        )}
        {(allTodo ? todo : todo.slice(0, SHOW)).map((a) => (
          <Appt key={a.id} a={a} busy={pending} businessName={d.businessName} onArrived={() => run(() => arrivedAction(a.id))} onPaid={() => setOpen({ kind: "paid", appt: a })} onRemind={() => setOpen({ kind: "remind", appt: a })} />
        ))}
        {todo.length > SHOW && (
          <button type="button" className="btn btn-secondary rounded-pill" onClick={() => setAllTodo(!allTodo)}>
            {allTodo ? "Show fewer" : `Show ${todo.length - SHOW} more`}
          </button>
        )}
        {doneCount > 0 && (
          <button type="button" aria-expanded={showDone} onClick={() => setShowDone(!showDone)} className="flex min-h-12 items-center justify-between rounded-md bg-surface-sunken px-4 text-left">
            <span className="text-body font-semibold">
              <CircleCheck size={16} className="mr-1.5 inline text-success" aria-hidden="true" />
              {doneCount} done today
            </span>
            <ChevronRight size={18} className={`text-ink-muted transition-transform ${showDone ? "rotate-90" : ""}`} aria-hidden="true" />
          </button>
        )}
        {showDone && doneAppts.map((a) => <Appt key={a.id} a={a} busy={pending} businessName={d.businessName} onArrived={() => undefined} onPaid={() => undefined} onRemind={() => undefined} />)}
        {showDone && d.walkIns.map((w) => (
          <div key={w.id} className="grid gap-1 rounded-card border border-line bg-surface-raised px-4 py-3.5">
            <div className="flex gap-3">
              <span className="text-code w-17 shrink-0">{w.time}</span>
              <div className="grid min-w-0 gap-1">
                <b className="text-[17px]">{w.name}</b>
                <span className="text-caption text-ink-muted">{w.item} · walk-in</span>
                <div className="flex flex-wrap gap-1.5">
                  {w.paidKobo > 0 && (
                    <Tag tone="ok">
                      Paid {naira(w.paidKobo)} · {METHOD_LABEL[w.method]}
                    </Tag>
                  )}
                  {w.linkKobo ? (
                    <Tag tone="gold">
                      <Link2 size={12} aria-hidden="true" /> Pay link sent · {naira(w.linkKobo)}
                    </Tag>
                  ) : (
                    w.owedKobo > 0 && <Tag tone="bad">Owes {naira(w.owedKobo)}</Tag>
                  )}
                </div>
                {w.paidKobo > 0 && (
                  <div className="mt-1.5">
                    <ReceiptButton saleId={w.id} name={w.name} phone={w.phone} item={w.item} businessName={d.businessName} />
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </section>

      <div className="grid gap-5 lg:col-start-2">
      <Link href="/app/bookings" className="flex min-h-14 items-center gap-3 rounded-card border border-line bg-surface-raised px-4 active:bg-surface-sunken">
        <CalendarDays size={20} className="text-ink-muted" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="text-body block font-semibold">
            Tomorrow: {d.tomorrow.count} {d.tomorrow.count === 1 ? "customer" : "customers"}
          </span>
          {d.tomorrow.first && <span className="text-caption text-ink-muted">First one: {d.tomorrow.first}</span>}
        </span>
        <ChevronRight size={18} className="text-ink-muted" aria-hidden="true" />
      </Link>

      <section className="grid gap-2.5" aria-labelledby="t-owed">
        <div className="flex items-baseline justify-between">
          <h2 id="t-owed" className="text-title">
            Still owed to you
          </h2>
          <b className="text-code">{naira(owedTotal)}</b>
        </div>
        <div className="divide-y divide-line rounded-card border border-line bg-surface-raised">
          {d.owed.length === 0 && <p className="text-body px-4 py-3.5 text-ink-muted">Nobody owes you money.</p>}
          {(allOwed ? d.owed : d.owed.slice(0, 3)).map((o, i) => (
            <div key={o.saleId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <span className="min-w-0">
                <b>{o.name}</b>
                <span className="text-caption block text-ink-muted">
                  {o.item} · since {o.since}
                </span>
                {o.linkKobo ? (
                  <span className="text-caption mt-1 inline-flex items-center gap-1 font-semibold text-gold-text">
                    <Link2 size={12} aria-hidden="true" /> Pay link sent · {naira(o.linkKobo)}
                  </span>
                ) : null}
              </span>
              <span className="flex items-center gap-2">
                <b className="text-code">{naira(o.owedKobo)}</b>
                <button type="button" className={ACT} onClick={() => setOpen({ kind: "remindOwed", i })}>
                  <Send size={16} aria-hidden="true" /> Remind
                </button>
                <button type="button" className={ACT} onClick={() => setOpen({ kind: "payOwed", i })}>
                  Paid
                </button>
              </span>
            </div>
          ))}
          {d.owed.length > 3 && (
            <button type="button" className="text-label min-h-12 w-full px-4 text-left text-brand" onClick={() => setAllOwed(!allOwed)}>
              {allOwed ? "Show fewer" : `See all ${d.owed.length}`}
            </button>
          )}
        </div>
      </section>

      <section className="grid gap-3.5 rounded-card border border-line bg-surface-raised p-4" aria-labelledby="t-close">
        <div>
          <div className="flex items-center justify-between gap-2">
            <h2 id="t-close" className="text-title">
              Before you close
            </h2>
            <Tag tone="plain">
              <Moon size={12} aria-hidden="true" /> {d.hour >= 18 ? "Now" : "From 6pm"}
            </Tag>
          </div>
          <p className="text-caption mt-1 text-ink-muted">Two quick checks so your money report is right.</p>
        </div>
        {unpaid.length ? (
          <button type="button" className="flex min-h-15 items-center gap-3 rounded-md border-2 border-line px-4 py-3 text-left" onClick={() => setOpen({ kind: "paid", appt: unpaid[0] })}>
            <CircleAlert size={22} className="shrink-0 text-gold-text" aria-hidden="true" />
            <span>
              <b className="block text-[15px]">
                {unpaid.length} {unpaid.length === 1 ? "customer" : "customers"} not marked paid yet
              </b>
              <span className="text-caption text-ink-muted">{unpaid.map((a) => a.first).join(", ")}. Tap to mark them.</span>
            </span>
          </button>
        ) : (
          <p className="text-body flex items-center gap-2 rounded-md bg-success-soft px-4 py-3">
            <CircleCheck size={20} className="text-success" aria-hidden="true" /> Everyone today is marked paid.
          </p>
        )}
        <div>
          <b className="text-[15px]">Anything you spent today?</b>
          <div className="mt-2 flex flex-wrap gap-2">
            {(["Products", "Transport", "Data", "Light / fuel", "Other"] as ExpenseKind[]).map((k) => (
              <Chip key={k} on={false} onClick={() => setOpen({ kind: "expense", expense: k })}>
                {k}
              </Chip>
            ))}
          </div>
        </div>
      </section>
      </div>
      </div>

      {open?.kind === "paid" && <PaidSheet appt={open.appt} businessName={d.businessName} payLinks={d.payLinks} onClose={() => setOpen(null)} />}
      {open?.kind === "remind" && (
        <RemindSheet
          first={open.appt.first}
          phone={open.appt.phone}
          text={reminderText("visit", { first: open.appt.first, business: d.businessName, time: open.appt.time, item: open.appt.service, dueKobo: open.appt.dueKobo, home: open.appt.homeArea })}
          onClose={() => setOpen(null)}
        />
      )}
      {open?.kind === "remindOwed" && d.owed[open.i] && (
        <RemindSheet
          first={d.owed[open.i].name}
          phone={d.owed[open.i].phone}
          text={reminderText("balance", { first: d.owed[open.i].name, business: d.businessName, dueKobo: d.owed[open.i].owedKobo })}
          onClose={() => setOpen(null)}
        />
      )}
      {open?.kind === "payOwed" && d.owed[open.i] && <PayOwedSheet o={d.owed[open.i]} businessName={d.businessName} payLinks={d.payLinks} onClose={() => setOpen(null)} />}
      {open?.kind === "sale" && <SaleSheet services={d.services} customers={d.customers} businessName={d.businessName} payLinks={d.payLinks} onClose={() => setOpen(null)} />}
      {open?.kind === "expense" && <ExpenseSheet kind={open.expense} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Tag({ tone, children }: { tone: "ok" | "bad" | "due" | "info" | "plain" | "gold"; children: React.ReactNode }) {
  const cls = { ok: "bg-success-soft text-success", bad: "bg-danger-soft text-danger", due: "bg-surface-sunken text-ink", info: "bg-brand-soft text-brand", plain: "bg-surface-sunken text-ink-muted", gold: "bg-gold-soft text-gold-text" }[tone];
  return <span className={`text-caption inline-flex items-center gap-1 rounded-pill px-2 py-0.5 font-semibold ${cls}`}>{children}</span>;
}

function Appt({ a, busy, businessName, onArrived, onPaid, onRemind }: { a: TodayAppt; busy: boolean; businessName: string; onArrived: () => void; onPaid: () => void; onRemind: () => void }) {
  const done = !!a.paid;
  return (
    <div className="grid gap-2.5 rounded-card border border-line bg-surface-raised px-4 py-3.5">
      <div className={`flex gap-3 ${done || a.status === "no_show" ? "opacity-70" : ""}`}>
        <span className="text-code w-17 shrink-0 pt-0.5">{a.time}</span>
        <div className="grid min-w-0 flex-1 gap-1">
          <b className="text-[17px]">{a.first}</b>
          <span className="text-caption text-ink-muted">
            {a.service}
            {a.detail ? `, ${a.detail.toLowerCase()}` : ""}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {a.homeArea && (
              <Tag tone="info">
                <Car size={12} aria-hidden="true" /> Home visit · {a.homeArea}
              </Tag>
            )}
            {done ? (
              <>
                {a.paid!.kobo > 0 && (
                  <Tag tone="ok">
                    <CircleCheck size={12} aria-hidden="true" /> Paid {naira(a.paid!.kobo)} · {METHOD_LABEL[a.paid!.method]}
                  </Tag>
                )}
                {a.paid!.linkKobo ? (
                  <Tag tone="gold">
                    <Link2 size={12} aria-hidden="true" /> Pay link sent · {naira(a.paid!.linkKobo)}
                  </Tag>
                ) : a.paid!.owedKobo > 0 ? (
                  <Tag tone="bad">Owes {naira(a.paid!.owedKobo)}</Tag>
                ) : null}
              </>
            ) : a.status === "no_show" ? (
              <Tag tone="bad">Didn&apos;t come</Tag>
            ) : (
              <>
                {a.depositKobo ? <Tag tone="ok">Deposit paid {naira(a.depositKobo)}</Tag> : <Tag tone="gold">No deposit</Tag>}
                {a.priceKobo == null && !a.dueKobo ? <Tag tone="plain">No price yet</Tag> : <Tag tone="due">Collect {naira(a.dueKobo)}</Tag>}
                {a.status === "arrived" && <Tag tone="info">Here now</Tag>}
              </>
            )}
          </div>
        </div>
      </div>
      {done && (a.paid!.kobo > 0 || a.depositKobo > 0) && (
        <div className="flex flex-wrap gap-2 pl-20">
          <ReceiptButton saleId={a.paid!.saleId} name={a.first} phone={a.phone} item={a.service} businessName={businessName} />
        </div>
      )}
      {!done && a.status !== "no_show" && (
        <div className="flex flex-wrap gap-2">
          {a.status === "booked" ? (
            <button type="button" className={ACT_MAIN} disabled={busy} onClick={onArrived}>
              <UserCheck size={16} aria-hidden="true" /> Arrived
            </button>
          ) : (
            <button type="button" className={ACT_MAIN} onClick={onPaid}>
              <Banknote size={16} aria-hidden="true" /> Paid{a.priceKobo == null && !a.dueKobo ? "" : ` ${naira(a.dueKobo)}`}
            </button>
          )}
          {a.status === "booked" && (
            <button type="button" className={ACT} onClick={onRemind}>
              <Send size={16} aria-hidden="true" /> Remind
            </button>
          )}
          {a.homeArea && (
            <a className={ACT} href={`https://www.google.com/maps/search/${encodeURIComponent(a.homeArea)}`} target="_blank" rel="noreferrer">
              <MapPin size={16} aria-hidden="true" /> Directions
            </a>
          )}
          {a.status === "booked" && (
            <button type="button" className={ACT} onClick={onPaid}>
              Paid
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function PaidSheet({ appt, businessName, payLinks, onClose }: { appt: TodayAppt; businessName: string; payLinks: boolean; onClose: () => void }) {
  const router = useRouter();
  // What's left to pay: the booking's, or what the owner types. No price on the booking: the full
  // price ("How much was it?"), less the deposit. A price they agreed (less, or more than a "from"
  // price): what they pay now, as owners think of it ("we agreed ₦15,000"); nothing stays owed.
  const noPrice = appt.priceKobo == null && !appt.dueKobo;
  const [setPrice, setSetPrice] = useState(noPrice);
  const [priceNaira, setPriceNaira] = useState(0);
  const [agreedNaira, setAgreedNaira] = useState(Math.round(appt.dueKobo / 100));
  const counted = appt.depositCounts ? appt.depositKobo / 100 : 0;
  const baseDue = noPrice ? Math.max(0, priceNaira - counted) : setPrice ? agreedNaira : appt.dueKobo / 100;
  const [amount, setAmount] = useState(Math.round(appt.dueKobo / 100));
  const [part, setPart] = useState(false);
  // Asked for on the day ("Wash and beads, ₦4,500"): added to this visit, not a separate sale.
  const [adding, setAdding] = useState(false);
  const [addLabel, setAddLabel] = useState("");
  const [addNaira, setAddNaira] = useState(0);
  const [pending, start] = useTransition();
  const [link, setLink] = useState<{ url: string; kobo: number } | null>(null);
  const [error, setError] = useState("");
  const extra = adding && addLabel.trim() && addNaira > 0 ? Math.round(addNaira) : 0;
  const added = extra ? { label: addLabel.trim(), naira: extra } : undefined;
  const dueNaira = baseDue + extra;
  const note = extra ? `${appt.service} + ${addLabel.trim()}`.slice(0, 80) : appt.service;
  const pay = (method: PayMethod) =>
    start(async () => {
      if (noPrice && !(priceNaira > 0)) return setError("Say how much it was.");
      if (noPrice && priceNaira < counted) return setError(`The price can't be less than the ${naira(counted * 100)} deposit they paid.`);
      if (setPrice && !noPrice && !(agreedNaira > 0) && !counted) return setError("Say how much you agreed.");
      if (adding && !extra) return setError("Say what they added and how much, or tap Remove.");
      if (method === "pay_link") {
        // Saved as owed until they pay the link; the link is for all of it, or the part they'll pay now.
        const linkNaira = part ? amount : dueNaira;
        const r = await payLinkTodayAction({ booking: { bookingId: appt.id, name: appt.first, item: appt.service, totalNaira: dueNaira, phone: appt.phone, added }, linkNaira, note });
        if (!r.ok) return setError(r.error);
        setLink({ url: r.url, kobo: linkNaira * 100 });
        router.refresh();
        return;
      }
      await paidAction({ bookingId: appt.id, name: appt.first, item: appt.service, totalNaira: dueNaira, paidNaira: part ? amount : dueNaira, method, phone: appt.phone, added });
      router.refresh();
      onClose();
    });
  if (link)
    return (
      <Sheet title="Your pay link is ready" onClose={onClose}>
        <PayLinkReady url={link.url} message={payLinkMessage(appt.first, link.kobo, businessName, note, link.url)} amountKobo={link.kobo} note={note} first={appt.first} phone={appt.phone} />
      </Sheet>
    );
  return (
    <Sheet title={noPrice && !priceNaira && !part ? `${appt.first} paid` : `${appt.first} paid ${part ? naira(amount * 100) : naira(dueNaira * 100)}`} onClose={onClose}>
      {setPrice && (
        <div className="grid gap-2.5 rounded-card border border-line bg-surface-raised p-3.5">
          <div className="flex items-center justify-between">
            <label htmlFor="p-price" className="text-[15px] font-bold">
              {noPrice ? `How much was ${appt.service.toLowerCase()}?` : "How much did you agree they pay now?"}
            </label>
            {!noPrice && (
              <button
                type="button"
                className="text-label min-h-11 px-1 text-ink-muted"
                onClick={() => {
                  setSetPrice(false);
                  setAgreedNaira(Math.round(appt.dueKobo / 100));
                  setError("");
                }}
              >
                Undo
              </button>
            )}
          </div>
          {noPrice ? (
            <NairaInput id="p-price" value={priceNaira} onChange={setPriceNaira} label="Price for this visit" />
          ) : (
            <NairaInput id="p-price" value={agreedNaira} onChange={setAgreedNaira} label="What they pay now" />
          )}
          <p className="text-caption text-ink-muted">
            {noPrice
              ? `The full price, before any deposit.${counted > 0 ? ` ${naira(counted * 100)} deposit already paid · ${naira(baseDue * 100)} left.` : ""}`
              : `It was ${naira(appt.dueKobo)}${counted > 0 ? ` after the ${naira(counted * 100)} deposit` : ""}. Nothing stays owed.`}
          </p>
        </div>
      )}
      {adding ? (
        <div className="grid gap-2.5 rounded-card border border-line bg-surface-raised p-3.5">
          <div className="flex items-center justify-between">
            <b className="text-[15px]">They added something</b>
            <button
              type="button"
              className="text-label min-h-11 px-1 text-ink-muted"
              onClick={() => {
                setAdding(false);
                setAddLabel("");
                setAddNaira(0);
                setError("");
              }}
            >
              Remove
            </button>
          </div>
          <label className="grid gap-1.5">
            <span className="text-label">What did they add?</span>
            <input className="input" value={addLabel} maxLength={60} placeholder="e.g. Wash and beads" onChange={(e) => setAddLabel(e.target.value)} />
          </label>
          <div>
            <label htmlFor="p-added" className="text-label mb-1.5 block">
              How much is it?
            </label>
            <NairaInput id="p-added" value={addNaira} onChange={setAddNaira} label="Price of what they added" />
          </div>
          {extra > 0 && (
            <p className="text-caption text-ink-muted">
              {naira(baseDue * 100)} left on the booking + {naira(extra * 100)} = {naira(dueNaira * 100)}
            </p>
          )}
        </div>
      ) : (
        <button type="button" className="text-label inline-flex min-h-11 items-center gap-1.5 justify-self-start text-brand" onClick={() => setAdding(true)}>
          <Plus size={16} aria-hidden="true" /> They added something
        </button>
      )}
      {part && (
        <div>
          <label htmlFor="p-amount" className="text-label mb-1.5 block">
            How much did they pay?
          </label>
          <NairaInput id="p-amount" value={amount} onChange={setAmount} label="Amount paid" />
          <p className="text-caption mt-1.5 text-ink-muted">The rest shows under Still owed.</p>
        </div>
      )}
      <p className="text-body text-ink-muted">How did they pay?</p>
      <div className="grid gap-2.5">
        {PAY_CHOICES.filter(([m]) => payLinks || m !== "pay_link").map(([m, Icon]) => (
          <button key={m} type="button" disabled={pending} onClick={() => pay(m)} className="flex min-h-15 items-center gap-3.5 rounded-card border-2 border-line bg-surface-raised px-4 py-3 text-left">
            <span className="grid size-11 place-items-center rounded-pill bg-surface-sunken text-ink-muted">
              {pending && m === "pay_link" ? <Loader2 size={22} className="animate-spin" aria-hidden="true" /> : <Icon size={22} aria-hidden="true" />}
            </span>
            <span>
              <b className="block text-[17px]">{m === "pay_link" ? "Send a pay link" : METHOD_LABEL[m]}</b>
              {m === "pay_link" && <span className="text-caption text-ink-muted">They pay on their phone. It shows as owed until they do.</span>}
            </span>
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      )}
      {(!part || !setPrice) && (
        <div className="grid justify-items-start gap-1">
          {!setPrice && (
            <button type="button" className="text-label min-h-11 text-brand underline underline-offset-4" onClick={() => setSetPrice(true)}>
              You agreed a different price
            </button>
          )}
          {!part && (
            <button
              type="button"
              className="text-label min-h-11 text-brand underline underline-offset-4"
              onClick={() => {
                setAmount(Math.round(dueNaira));
                setPart(true);
              }}
            >
              They paid only part of it
            </button>
          )}
        </div>
      )}
    </Sheet>
  );
}

function RemindSheet({ first, phone, text, onClose }: { first: string; phone?: string; text: string; onClose: () => void }) {
  const [msg, setMsg] = useState(text);
  const link = waLink(phone, msg);
  return (
    <Sheet title={`Remind ${first}`} onClose={onClose}>
      <p className="text-body text-ink-muted">This opens your own WhatsApp with the message ready. Change anything before you send it.</p>
      <textarea aria-label="Message" className="input h-auto min-h-32 py-3 leading-6" value={msg} onChange={(e) => setMsg(e.target.value)} />
      {link ? (
        <a href={link} target="_blank" rel="noreferrer" className="btn btn-lg w-full rounded-pill" onClick={onClose}>
          <Send aria-hidden="true" /> Open WhatsApp
        </a>
      ) : (
        <p className="text-body text-ink-muted">There&apos;s no number for {first}. Copy the message and send it yourself.</p>
      )}
    </Sheet>
  );
}

function PayOwedSheet({ o, businessName, payLinks, onClose }: { o: TodayData["owed"][number]; businessName: string; payLinks: boolean; onClose: () => void }) {
  const router = useRouter();
  const [amount, setAmount] = useState(Math.round(o.owedKobo / 100));
  const [pending, start] = useTransition();
  const [link, setLink] = useState<{ url: string; kobo: number } | null>(null);
  const [error, setError] = useState("");
  const note = `Balance for ${o.item}`.slice(0, 80);
  const pay = (method: PayMethod) =>
    start(async () => {
      if (method === "pay_link") {
        const r = await payLinkTodayAction({ saleId: o.saleId, linkNaira: amount, note });
        if (!r.ok) return setError(r.error);
        setLink({ url: r.url, kobo: amount * 100 });
        router.refresh();
        return;
      }
      await payBalanceAction(o.saleId, amount, method);
      router.refresh();
      onClose();
    });
  if (link)
    return (
      <Sheet title="Your pay link is ready" onClose={onClose}>
        <PayLinkReady url={link.url} message={payLinkMessage(o.name.split(" ")[0], link.kobo, businessName, note, link.url)} amountKobo={link.kobo} note={note} first={o.name.split(" ")[0]} phone={o.phone} />
      </Sheet>
    );
  return (
    <Sheet title={`${o.name} paid`} onClose={onClose}>
      <div>
        <label htmlFor="o-amount" className="text-label mb-1.5 block">
          How much?
        </label>
        <NairaInput id="o-amount" value={amount} onChange={setAmount} label="Amount paid" />
        <p className="text-caption mt-1.5 text-ink-muted">They owe {naira(o.owedKobo)}. Less leaves the rest owed.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {PAY_CHOICES.filter(([m]) => payLinks || m !== "pay_link").map(([m]) => (
          <button key={m} type="button" className="btn btn-secondary rounded-pill" disabled={pending || !amount} onClick={() => pay(m)}>
            {m === "pay_link" ? "Send a pay link" : METHOD_LABEL[m]}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      )}
    </Sheet>
  );
}

function SaleSheet({ services, customers, businessName, payLinks, onClose }: { services: TodayData["services"]; customers: TodayData["customers"]; businessName: string; payLinks: boolean; onClose: () => void }) {
  const router = useRouter();
  const [svc, setSvc] = useState<{ label: string; naira: number } | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [picked, setPicked] = useState(false);
  const [askName, setAskName] = useState(true);
  const [paid, setPaid] = useState(0);
  const [method, setMethod] = useState<PayMethod>("cash");
  const [pending, start] = useTransition();
  const [link, setLink] = useState<{ url: string; kobo: number } | null>(null);
  const [error, setError] = useState("");

  if (link && svc) {
    const first = name.trim().split(/\s+/)[0] ?? "";
    return (
      <Sheet title="Your pay link is ready" onClose={onClose}>
        <PayLinkReady url={link.url} message={payLinkMessage(first, link.kobo, businessName, svc.label, link.url)} amountKobo={link.kobo} note={svc.label} first={first} phone={phone || undefined} />
      </Sheet>
    );
  }
  if (!svc)
    return (
      <Sheet title="New sale" onClose={onClose}>
        <p className="text-body text-ink-muted">What did they do?</p>
        <div className="divide-y divide-line rounded-card border border-line bg-surface-raised">
          {services.map((s) => (
            <button
              key={s.label}
              type="button"
              className="flex min-h-14 w-full items-center justify-between gap-3 px-4 text-left active:bg-surface-sunken"
              onClick={() => {
                setSvc(s);
                setPaid(s.naira);
              }}
            >
              <span className="font-semibold">{s.label}</span>
              <b className="text-code">₦{s.naira.toLocaleString("en-NG")}</b>
            </button>
          ))}
        </div>
      </Sheet>
    );
  if (askName)
    return (
      <Sheet title="Who was it?" onClose={onClose}>
        <p className="text-body text-ink-muted">
          {svc.label} · ₦{svc.naira.toLocaleString("en-NG")}
        </p>
        <input
          aria-label="Name"
          className="input h-13 text-[17px]"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (picked) setPhone("");
            setPicked(false);
          }}
          placeholder="e.g. Ngozi"
          autoComplete="off"
        />
        {(() => {
          const t = name.trim().toLowerCase();
          const list = customers.filter((c) => matchesSearch(c, t)).slice(0, 6);
          const twice = repeatedNames(customers);
          return list.length ? (
            <div>
              <span className="text-caption mb-1.5 block text-ink-muted">{t ? "Is it one of your customers?" : "Your customers"}</span>
              <div className="flex flex-wrap gap-2">
                {list.map((c) => (
                  <Chip
                    key={c.phone}
                    on={picked && phone === c.phone}
                    onClick={() => {
                      setName(c.name);
                      setPhone(c.phone);
                      setPicked(true);
                    }}
                  >
                    {c.name}
                    {twice.has(c.name.trim().split(/\s+/)[0].toLowerCase()) && <span className="ml-1 font-mono text-xs font-normal opacity-80">{phoneTail(c.phone)}</span>}
                  </Chip>
                ))}
              </div>
            </div>
          ) : null;
        })()}
        {!picked && (
          <div>
            <input aria-label="Their WhatsApp number" className="input h-12" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="Their WhatsApp number" autoComplete="off" />
            <p className="text-caption mt-1.5 text-ink-muted">
              {phone.trim() && !phoneKey(phone) ? "Type a Nigerian number, like 0803 123 4567." : "Like 0803 123 4567. For receipts, reminders and your next offer."}
            </p>
          </div>
        )}
        <button type="button" className="btn btn-lg w-full rounded-pill" disabled={name.trim().length < 2 || !phoneKey(phone)} onClick={() => setAskName(false)}>
          Next
        </button>
      </Sheet>
    );
  return (
    <Sheet title={method === "pay_link" ? "Send them a pay link" : "How much did they pay?"} onClose={onClose}>
      <p className="text-body text-ink-muted">
        {name} · {svc.label}
      </p>
      <NairaInput id="s-paid" value={paid} onChange={setPaid} label={method === "pay_link" ? "Pay link for" : "Amount paid"} />
      <div className="flex flex-wrap gap-2">
        {(["cash", "transfer", "card", ...(payLinks ? ["pay_link"] : [])] as PayMethod[]).map((m) => (
          <Chip key={m} on={method === m} onClick={() => setMethod(m)}>
            {METHOD_LABEL[m]}
          </Chip>
        ))}
      </div>
      {method === "pay_link" ? (
        <p className="text-caption text-ink-muted">They pay on their phone. It shows under Still owed until they do{paid < svc.naira ? `, and ₦${(svc.naira - paid).toLocaleString("en-NG")} stays owed after` : ""}.</p>
      ) : (
        paid < svc.naira && <p className="text-caption text-ink-muted">₦{(svc.naira - paid).toLocaleString("en-NG")} will show under Still owed.</p>
      )}
      <button
        type="button"
        className="btn btn-lg w-full rounded-pill"
        disabled={pending || (method === "pay_link" && !paid)}
        onClick={() =>
          start(async () => {
            if (method === "pay_link") {
              const r = await payLinkTodayAction({ booking: { name: name.trim(), item: svc.label, totalNaira: svc.naira, phone }, linkNaira: paid, note: svc.label });
              if (!r.ok) return setError(r.error);
              setLink({ url: r.url, kobo: paid * 100 });
              router.refresh();
              return;
            }
            const r = await paidAction({ name: name.trim(), item: svc.label, totalNaira: svc.naira, paidNaira: paid, method, phone });
            if (!r.ok) return setError("Add their name and WhatsApp number first.");
            router.refresh();
            onClose();
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : method === "pay_link" ? <Link2 aria-hidden="true" /> : <CircleCheck aria-hidden="true" />}{" "}
        {method === "pay_link" ? `Make a ₦${paid.toLocaleString("en-NG")} pay link` : "Save sale"}
      </button>
      {error && (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      )}
    </Sheet>
  );
}
