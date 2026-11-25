"use client";

// NEW DIRECTION: one customer's page in the client book. Their visits, what they've spent and owe,
// notes and birthday, and the quick things an owner does next. Owners only.

import { ArrowLeft, CalendarPlus, Cake, Check, Loader2, MessageCircle, Send, UserCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { matchWalkInAction, saveClientNoteAction } from "@/app/app/client-actions";
import { PayLinkSheet } from "@/components/payments/PayLinkSheet";
import { ReceiptButton } from "@/components/payments/ReceiptButton";
import { payLinkReasons, relativeDay, type Client } from "@/lib/clients";
import { METHOD_LABEL, reminderText, waLink } from "@/lib/ledger";
import { initials, Tag } from "./ClientList";

const naira = (kobo: number) => "₦" + Math.round(kobo / 100).toLocaleString("en-NG");
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const STATUS: Record<Client["history"][number]["status"], [string, "ok" | "bad" | "gold" | "plain" | "info"]> = {
  came: ["Came", "ok"],
  paid: ["Paid", "ok"],
  used: ["Used", "ok"],
  booked: ["Booked", "info"],
  claimed: ["Claimed", "plain"],
  no_show: ["Didn't come", "bad"],
  cancelled: ["Cancelled", "plain"],
};

export function ClientDetail({
  client: c,
  matches,
  businessName,
  now,
  payMaxKobo,
}: {
  client: Client;
  matches: { key: string; name: string; phone: string; visits: number }[];
  businessName: string;
  now: string;
  /** Pay links are open for this business, up to this much per payment. */
  payMaxKobo?: number;
}) {
  const router = useRouter();
  const at = new Date(now);
  const [notes, setNotes] = useState(c.note.notes ?? "");
  const [month, setMonth] = useState(c.note.birthday?.slice(0, 2) ?? "");
  const [day, setDay] = useState(c.note.birthday?.slice(3, 5) ?? "");
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const first = c.name.split(" ")[0];
  const message = waLink(c.phone, `Hi ${first}, `);
  const remind = c.owedKobo > 0 ? waLink(c.phone, reminderText("balance", { first, business: businessName, dueKobo: c.owedKobo })) : null;

  function save() {
    start(async () => {
      await saveClientNoteAction(c.key, { notes, birthday: month && day ? `${month}-${day.padStart(2, "0")}` : undefined });
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-5">
      <Link href="/app/leads" className="text-label inline-flex min-h-11 items-center gap-1.5 justify-self-start text-ink-muted">
        <ArrowLeft size={18} aria-hidden="true" /> Customers
      </Link>

      <div className="flex items-center gap-3.5">
        <span className="grid size-16 shrink-0 place-items-center rounded-pill bg-brand-soft text-xl font-extrabold text-brand" aria-hidden="true">
          {initials(c.name)}
        </span>
        <div className="min-w-0">
          <h1 className="text-heading truncate">{c.name}</h1>
          <p className="text-body text-ink-muted">{c.phone ? formatPhone(c.phone) : "No number saved"}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {c.visits >= 5 && <Tag tone="ok">Regular</Tag>}
            {c.noShows >= 2 && <Tag tone="gold">Didn&apos;t come {c.noShows}× · ask for a full deposit</Tag>}
            {c.owedKobo > 0 && <Tag tone="bad">Owes {naira(c.owedKobo)}</Tag>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Visits" value={String(c.visits)} />
        <Stat label="Spent" value={naira(c.spentKobo)} />
        <Stat label={c.next ? "Next" : "Last came"} value={c.next ? relativeDay(c.next.at, at) : c.lastVisit ? relativeDay(c.lastVisit, at) : "Not yet"} small />
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:flex sm:flex-wrap">
        {message && (
          <a href={message} target="_blank" rel="noreferrer" className="btn btn-lg rounded-pill">
            <MessageCircle aria-hidden="true" /> Message
          </a>
        )}
        <Link href="/app/bookings" className="btn btn-secondary btn-lg rounded-pill">
          <CalendarPlus aria-hidden="true" /> Book them in
        </Link>
        {remind && (
          <a href={remind} target="_blank" rel="noreferrer" className="btn btn-secondary btn-lg col-span-2 rounded-pill">
            <Send aria-hidden="true" /> Remind about {naira(c.owedKobo)}
          </a>
        )}
        {payMaxKobo ? (
          <PayLinkSheet businessName={businessName} maxKobo={payMaxKobo} customer={{ name: c.name, phone: c.phone }} reasons={payLinkReasons(c)} className="btn btn-secondary btn-lg col-span-2 rounded-pill" />
        ) : null}
      </div>

      {matches.length > 0 && (
        <section className="grid gap-2.5 rounded-card border border-line bg-gold-soft p-4">
          <h2 className="text-title">Is this the same person?</h2>
          <p className="text-body">{c.name} was saved without a number. If they&apos;re one of these customers, their visits join up.</p>
          {matches.map((m) => (
            <button
              key={m.key}
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await matchWalkInAction(c.key, c.name, m.phone);
                  if (r.ok) router.replace(`/app/leads/${encodeURIComponent(r.key)}`);
                })
              }
              className="flex min-h-14 items-center gap-3 rounded-md border border-line bg-surface-raised px-4 text-left"
            >
              <UserCheck size={20} className="shrink-0 text-ink-muted" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <b className="block">Yes, it&apos;s {m.name}</b>
                <span className="text-caption text-ink-muted">
                  {formatPhone(m.phone)} · {m.visits} {m.visits === 1 ? "visit" : "visits"}
                </span>
              </span>
            </button>
          ))}
        </section>
      )}

      <section className="grid gap-3 rounded-card border border-line bg-surface-raised p-4">
        <h2 className="text-title">Notes</h2>
        <textarea aria-label={`Notes about ${first}`} className="input h-auto min-h-24 py-3 leading-6" value={notes} maxLength={500} onChange={(e) => (setNotes(e.target.value), setSaved(false))} placeholder="e.g. sensitive scalp, likes medium length, comes with her sister" />
        <div>
          <span className="text-label mb-1.5 flex items-center gap-1.5">
            <Cake size={16} aria-hidden="true" /> Birthday
          </span>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <select aria-label="Birthday month" className="input" value={month} onChange={(e) => (setMonth(e.target.value), setSaved(false))}>
              <option value="">Month</option>
              {MONTHS.map((m, i) => (
                <option key={m} value={String(i + 1).padStart(2, "0")}>
                  {m}
                </option>
              ))}
            </select>
            <select aria-label="Birthday day" className="input w-24" value={day} onChange={(e) => (setDay(e.target.value), setSaved(false))}>
              <option value="">Day</option>
              {Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, "0")).map((d) => (
                <option key={d} value={d}>
                  {Number(d)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button type="button" className="btn rounded-pill justify-self-start" disabled={pending} onClick={save}>
          {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />} {saved ? "Saved" : "Save"}
        </button>
      </section>

      <section className="grid gap-2.5">
        <h2 className="text-title">Visits</h2>
        <ul className="divide-y divide-line rounded-card border border-line bg-surface-raised">
          {c.history.map((h, i) => (
            <li key={i} className="grid gap-1 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <b className="block">{h.title}</b>
                  <span className="text-caption text-ink-muted">
                    {new Date(h.at).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" })}
                    {h.detail ? ` · ${h.detail}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  {h.paidKobo > 0 && <b className="text-code block">{naira(h.paidKobo)}</b>}
                  {h.methods.length > 0 && <span className="text-caption text-ink-muted">{h.methods.map((m) => METHOD_LABEL[m]).join(" + ")}</span>}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Tag tone={STATUS[h.status][1]}>{STATUS[h.status][0]}</Tag>
                {h.owedKobo > 0 && <Tag tone="bad">Owes {naira(h.owedKobo)}</Tag>}
              </div>
              {h.saleId && h.paidKobo > 0 && (
                <div className="mt-1">
                  <ReceiptButton saleId={h.saleId} name={c.name} phone={c.phone} item={h.title} businessName={businessName} />
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function formatPhone(e164: string) {
  const d = e164.replace(/^\+234/, "0");
  return d.length === 11 ? `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}` : e164;
}

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded-md border border-line bg-surface-raised p-3">
      <span className="text-caption text-ink-muted">{label}</span>
      <b className={`block ${small ? "text-[15px]" : "text-code text-[16px]"}`}>{value}</b>
    </div>
  );
}
