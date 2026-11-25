import { Bell, CircleAlert, Moon } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { getBookings } from "@/lib/bookings-data";
import { todayKey, watInstant } from "@/lib/bookings";
import { getLedger } from "@/lib/ledger-data";
import { moneyBetween, weekStart, type MoneyLine } from "@/lib/ledger";
import type { SessionUser } from "@/lib/types";
import { AddExpenseButton, HowWeCount } from "./MoneyActions";
import { SourceTag } from "./SourceTag";

// NEW DIRECTION, stage 2 (docs/OWNER_JOURNEYS.md journey 6): "Am I making money?" for businesses
// from the new setup. This week, Monday to today.

const naira = (kobo: number) => "₦" + Math.round(kobo / 100).toLocaleString("en-NG");

export async function MoneyWeek({ user }: { user: SessionUser }) {
  await connection();
  const now = new Date();
  const from = weekStart(now);
  const to = new Date(from.getTime() + 7 * 86_400_000);
  const [ledger, bookings] = await Promise.all([getLedger(user), getBookings(user, new Date(from.getTime() - 60 * 86_400_000), new Date(now.getTime() + 120 * 86_400_000))]);
  const deposits = bookings.filter((b) => b.depositPaidKobo).map((b) => ({ at: b.createdAt, kobo: b.depositPaidKobo!, name: b.firstName, item: b.service }));
  const m = moneyBetween(ledger, deposits, from, to);
  const today = todayKey(now);
  const paidIds = new Set(ledger.sales.map((s) => s.bookingId).filter(Boolean));
  const unpaid = bookings.filter((b) => b.status !== "cancelled" && b.status !== "no_show" && new Date(b.startsAt) >= new Date(watInstant(today, 0)) && new Date(b.startsAt) < now && !paidIds.has(b.id)).length;

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-heading">Money</h1>
        <p className="text-body-lg mt-1 text-ink-muted">This week, Monday to today.</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Money in" kobo={m.inKobo} />
        <Stat label="Spent" kobo={m.spentKobo} />
        <Stat label="You kept" kobo={m.keptKobo} kept />
      </div>
      <HowWeCount />
      {unpaid > 0 && (
        <Link href="/app" className="flex items-start gap-3 rounded-md bg-gold-soft px-4 py-3.5">
          <CircleAlert size={22} className="shrink-0 text-gold-text" aria-hidden="true" />
          <span className="text-body">
            <b>
              {unpaid} {unpaid === 1 ? "customer" : "customers"} today not marked paid.
            </b>{" "}
            Their money isn&apos;t counted yet. Tap to mark them on Today.
          </span>
        </Link>
      )}
      <AddExpenseButton />
      <Section title="Where it came from" lines={m.came} />
      <Section title="What you spent" lines={m.spent} empty="Nothing added this week." />
      <section className="grid gap-2.5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-title">Regular costs</h2>
          <span className="text-caption text-ink-muted">Counted for you</span>
        </div>
        <div className="divide-y divide-line rounded-card border border-line bg-surface-raised">
          {ledger.regular.length === 0 && <p className="text-body px-4 py-3.5 text-ink-muted">Rent, a helper, a shop fee: add them once.</p>}
          {ledger.regular.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <span>
                <b>{r.kind}</b>
                <span className="text-caption block text-ink-muted">{r.every === "week" ? "Every week" : "Every month"}</span>
              </span>
              <b className="text-code">{naira(r.kobo)}</b>
            </div>
          ))}
        </div>
        <AddExpenseButton regular />
      </section>
      {(m.best || m.busiestDay || m.topCustomer) && (
        <section className="grid gap-2.5">
          <h2 className="text-title">This week at a glance</h2>
          <div className="divide-y divide-line rounded-card border border-line bg-surface-raised">
            {m.best && <Row label="Best service" value={m.best.service} />}
            {m.busiestDay && <Row label="Busiest day" value={m.busiestDay} />}
            {m.topCustomer && <Row label="Top customer" value={m.topCustomer.name} />}
          </div>
        </section>
      )}
      <section className="grid gap-2.5">
        <h2 className="text-title">On your phone</h2>
        <div className="divide-y divide-line rounded-card border border-line bg-surface-raised">
          <div className="flex gap-3 px-4 py-3">
            <Moon size={20} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden="true" />
            <span>
              <b>Every evening, 8pm</b>
              <span className="text-caption block text-ink-muted">&quot;Anything you spent today?&quot; Tap a type and the amount, or Nothing today.</span>
            </span>
          </div>
          <div className="flex gap-3 px-4 py-3">
            <Bell size={20} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden="true" />
            <span>
              <b>Every Sunday evening</b>
              <span className="text-caption block text-ink-muted">
                &quot;This week: {naira(m.inKobo)} in, {naira(m.spentKobo)} spent, you kept {naira(m.keptKobo)}.&quot;
              </span>
            </span>
          </div>
        </div>
        <p className="text-caption text-ink-muted">Coming with phone alerts: not sent in the demo yet.</p>
      </section>
    </div>
  );
}

function Stat({ label, kobo, kept }: { label: string; kobo: number; kept?: boolean }) {
  return (
    <div className={`rounded-md border p-3 ${kept ? "border-transparent bg-success-soft" : "border-line bg-surface-raised"}`}>
      <span className={`text-caption ${kept ? "" : "text-ink-muted"}`}>{label}</span>
      <b className={`text-code block text-[16px] ${kept ? "text-success" : ""}`}>{naira(kobo)}</b>
    </div>
  );
}

function Section({ title, lines, empty }: { title: string; lines: MoneyLine[]; empty?: string }) {
  return (
    <section className="grid gap-2.5">
      <h2 className="text-title">{title}</h2>
      <div className="divide-y divide-line rounded-card border border-line bg-surface-raised">
        {lines.length === 0 && empty && <p className="text-body px-4 py-3.5 text-ink-muted">{empty}</p>}
        {lines.map((l) => (
          <div key={`${l.label}-${l.source}`} className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="grid min-w-0 gap-1">
              <span>
                {l.label}
                {l.note && <span className="text-caption block text-ink-muted">{l.note}</span>}
              </span>
              <SourceTag source={l.source} />
            </span>
            <b className="text-code shrink-0">{naira(l.kobo)}</b>
          </div>
        ))}
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}
