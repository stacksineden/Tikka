import { pageChecklist } from "@/lib/page";
import {
  ArrowRight,
  CalendarClock,
  Check,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { FollowUpButton } from "@/components/leads/LeadBits";
import { RarityBadge, TIER_LABEL } from "@/components/tikka/RarityBadge";
import { clockTime, count, left, naira, nairaShort, percent, shortDate, timeAgo, timeLeft, WAT } from "@/lib/format";
import { followUpLink } from "@/lib/leads";
import type { ActivityEvent, Business, Drop, Lead, Tier } from "@/lib/types";
import { ActivityList } from "./ActivityList";
import { CopyLink } from "./CopyLink";

/* ------------------------------------------------------------- pieces */

export function Panel({
  title,
  action,
  children,
  className = "",
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-card border border-line bg-surface-raised ${className}`}>
      {title && (
        <div className="flex items-center justify-between gap-3 px-5 pb-1 pt-4">
          <h2 className="text-title text-[17px] leading-6">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

function Stat({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: "gold" }) {
  return (
    <div className={`rounded-card border border-line p-4 sm:p-5 ${tone === "gold" ? "bg-gold-soft" : "bg-surface-raised"}`}>
      <div className="text-label text-ink-muted">{label}</div>
      <div className="mt-1 text-heading tabular-nums sm:text-[32px] sm:leading-9">{value}</div>
      {note && <div className="text-caption mt-1 text-ink-muted">{note}</div>}
    </div>
  );
}

/* --------------------------------------------------------- live drop */

function tierTotals(drop: Drop) {
  const t: Record<Tier, number> = { legendary: 0, rare: 0, thank_you: 0 };
  for (const r of drop.rewards) t[r.tier] += r.count;
  return t;
}

export function LiveDropPanel({ drop, business, now }: { drop: Drop; business: Business; now: Date }) {
  const remaining = drop.total - drop.claimed;
  const low = remaining / drop.total < 0.1;
  const tiers = tierTotals(drop);
  const url = `usetikka.com/d/${business.slug}/${drop.slug}`;
  return (
    <Panel>
      <div className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-caption inline-flex items-center gap-1.5 rounded-pill bg-success-soft px-2 py-0.5 font-semibold text-success">
                <span className="size-1.5 rounded-pill bg-success" aria-hidden="true" />
                Live
              </span>
              <span className="text-caption text-ink-muted">
                Ends {shortDate(drop.endsAt)}, {clockTime(drop.endsAt)} · {timeLeft(drop.endsAt, now)}
              </span>
            </div>
            <h2 className="text-title mt-2">{drop.name}</h2>
          </div>
          <span
            className={`font-mono text-[11px] uppercase leading-[14px] tracking-[0.12em] rounded-pill px-3 py-[7px] ${
              low ? "bg-gold text-on-gold" : "bg-surface-sunken text-ink"
            }`}
          >
            <b>{count(remaining)}</b> of {count(drop.total)} left
          </span>
        </div>

        {/* claims and redemptions against the drop size */}
        <div className="mt-5">
          <div className="flex h-2.5 overflow-hidden rounded-pill bg-surface-sunken" aria-hidden="true">
            <div className="bg-success" style={{ width: percent(drop.redeemed, drop.total, 2) }} />
            <div className="bg-brand" style={{ width: percent(drop.claimed - drop.redeemed, drop.total, 2) }} />
          </div>
          <dl className="text-caption mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-ink-muted">
            <div className="flex items-center gap-1.5">
              <span className="size-2 rounded-pill bg-brand" aria-hidden="true" />
              <dt>Claimed</dt>
              <dd className="font-semibold text-ink">{count(drop.claimed)}</dd>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-2 rounded-pill bg-success" aria-hidden="true" />
              <dt>Redeemed</dt>
              <dd className="font-semibold text-ink">{count(drop.redeemed)}</dd>
            </div>
            <div className="flex items-center gap-1.5">
              <dt>Claim to redeem</dt>
              <dd className="font-semibold text-ink">{percent(drop.redeemed, drop.claimed)}</dd>
            </div>
          </dl>
        </div>

        <h3 className="text-label mt-5 text-ink-muted">What&apos;s inside</h3>
        <ul className="mt-2 grid gap-2 sm:grid-cols-3">
          {(["legendary", "rare", "thank_you"] as const).map((t) => (
            <li key={t} className="flex items-center justify-between gap-2 rounded-md bg-surface-sunken px-3 py-2.5">
              <RarityBadge tier={t} />
              <span className="text-label tabular-nums">{count(tiers[t])}</span>
            </li>
          ))}
        </ul>

        <div className="mt-5 grid gap-2 sm:grid-cols-[1fr_auto]">
          <CopyLink url={url} />
          <Link href={`/app/drops/${drop.id}`} className="btn btn-secondary min-h-[42px]">
            Drop dashboard
            <ArrowRight />
          </Link>
        </div>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------- leads */

export function NewLeads({ leads, businessName, now }: { leads: Lead[]; businessName: string; now: Date }) {
  const waiting = leads.filter((l) => l.status === "claimed").length;
  return (
    <Panel
      title="New leads"
      action={
        <Link href="/app/leads" className="text-label text-brand hover:underline">
          View all
        </Link>
      }
    >
      <p className="text-caption px-5 text-ink-muted">Everyone who claims is yours to follow up.</p>
      {leads.length === 0 && (
        <p className="text-body border-t border-line px-5 py-6 text-ink-muted">
          No claims yet. Everyone who claims shows up here the moment they do, so share your drop link.
        </p>
      )}
      <ul className="mt-3 divide-y divide-line border-t border-line empty:hidden">
        {leads.slice(0, 6).map((l) => {
          const wa = followUpLink(l, businessName);
          return (
            <li key={l.id} className="flex items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-body truncate font-semibold">{l.name}</span>
                  {l.isNew && <span className="tag tag--new">New</span>}
                  {l.status === "redeemed" && (
                    <span className="tag tag--redeemed">
                      <Check strokeWidth={2.4} />
                      Redeemed{l.spent ? ` · ${naira(l.spent)}` : ""}
                    </span>
                  )}
                </div>
                <div className="text-caption mt-0.5 flex flex-wrap items-center gap-x-1.5 text-ink-muted">
                  <span className="font-mono font-normal tracking-[0.02em] text-ink">{l.phone}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {TIER_LABEL[l.tier]}: {l.reward}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{timeAgo(l.claimedAt, now)}</span>
                </div>
              </div>
              {wa && <FollowUpButton href={wa} leadId={l.id} name={l.name} compact />}
            </li>
          );
        })}
      </ul>
      {waiting > 0 && (
        <p className="text-caption border-t border-line px-5 py-3 text-ink-muted">
          {waiting} of these haven&apos;t come in yet. A quick WhatsApp message brings people back.
        </p>
      )}
    </Panel>
  );
}

/* ---------------------------------------------------------- activity */

export function ActivityFeed({ events, now, live = true }: { events: ActivityEvent[]; now: Date; live?: boolean }) {
  return (
    <Panel
      title={live ? "Live activity" : "Activity"}
      action={
        live ? (
          <span className="text-caption flex items-center gap-1.5 text-ink-muted">
            <span className="counter__dot" aria-hidden="true" />
            Live
          </span>
        ) : undefined
      }
    >
      {events.length === 0 && (
        <p className="text-body px-5 pb-5 pt-2 text-ink-muted">
          {live ? "Quiet so far. Opens, claims and redemptions appear here as they happen." : "Nothing recorded here for this drop."}
        </p>
      )}
      <ActivityList events={events} now={now.toISOString()} />
    </Panel>
  );
}

/* --------------------------------------------------------- coming up */

export function ComingUp({ drop }: { drop: Drop }) {
  return (
    <Panel>
      <div className="flex items-start gap-4 p-5">
        <span className="grid size-10 shrink-0 place-items-center rounded-md bg-brand-soft text-brand">
          <CalendarClock size={20} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-caption text-ink-muted">Scheduled</div>
          <h2 className="text-title text-[17px] leading-6">{drop.name}</h2>
          <p className="text-body mt-1 text-ink-muted">
            Opens {shortDate(drop.startsAt)}, {clockTime(drop.startsAt)} · {count(drop.total)} Tikkas
          </p>
          {drop.notifyWaiting ? (
            <p className="text-label mt-3 rounded-md bg-surface-sunken px-3 py-2">
              {drop.notifyWaiting === 1 ? "1 person is" : `${count(drop.notifyWaiting)} people are`} waiting for this drop
            </p>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}

/* ---------------------------------------------- make your card richer */

export function FinishPageChecklist({ business }: { business: Business }) {
  // "Finish your page" (PRD B3): four steps, all in Your page; never blocks a drop.
  const items = pageChecklist(business).map((i) => ({ ...i, href: "/app/page" }));
  const done = items.filter((i) => i.done).length;
  if (done === items.length) return null;
  return (
    <Panel title="Finish your page" action={<span className="text-caption text-ink-muted">{done} of {items.length}</span>}>
      <div className="px-5 pb-1 pt-1">
        <div className="h-1.5 overflow-hidden rounded-pill bg-surface-sunken" aria-hidden="true">
          <div className="h-full bg-brand" style={{ width: percent(done, items.length) }} />
        </div>
      </div>
      <ul className="grid gap-0.5 p-3">
        {items.map((i) => (
          <li key={i.label} className="flex items-center gap-3 rounded-md px-2 py-2">
            <span
              className={`grid size-6 shrink-0 place-items-center rounded-pill ${
                i.done ? "bg-success text-on-success" : "border-[1.5px] border-dashed border-line-strong text-ink-muted"
              }`}
            >
              {i.done ? <Check size={14} strokeWidth={3} aria-hidden="true" /> : null}
            </span>
            <span className={`text-body ${i.done ? "text-ink-muted line-through decoration-line-strong" : ""}`}>
              {i.label}
              <span className="sr-only">{i.done ? " (done)" : " (to do)"}</span>
            </span>
            {!i.done && (
              <Link href={i.href} className="text-label ml-auto flex min-h-11 items-center px-1 text-brand hover:underline">
                Add
              </Link>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/* ----------------------------------------------------- the whole home */

export function HomeHeader({ name, now }: { name: string; now: Date }) {
  const hour = Number(now.toLocaleString("en-GB", { hour: "numeric", hour12: false, timeZone: WAT }));
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-label text-ink-muted">{shortDate(now.toISOString())}</p>
        <h1 className="text-heading mt-1">
          {greet}, {name}
        </h1>
      </div>
      <Link href="/app/drops/new" className="btn">
        <Plus />
        Create a drop
      </Link>
    </div>
  );
}

export function TopStats({ drop, newToday, leadsTotal }: { drop?: Drop; newToday: number; leadsTotal: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat label="New leads today" value={count(newToday)} note={`${count(leadsTotal)} leads in total`} />
      <Stat
        label="This drop brought in"
        value={drop && drop.redeemed > 0 ? nairaShort(drop.revenue) : "₦0"}
        note={drop ? `from ${count(drop.redeemed)} redemptions` : undefined}
        tone="gold"
      />
      <Stat label="Claims" value={drop ? count(drop.claimed) : "0"} note={drop ? left(drop.total - drop.claimed, drop.total) : undefined} />
      <Stat
        label="Redeemed"
        value={drop ? count(drop.redeemed) : "0"}
        note={drop ? `${percent(drop.redeemed, drop.claimed)} of claims` : undefined}
      />
    </div>
  );
}
