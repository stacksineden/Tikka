import { Check, MessageCircle, X } from "lucide-react";
import { count } from "@/lib/format";
import { lastDay, nudgeLink, stepsLeft, type LaunchRow, type LaunchStep } from "@/lib/launch-week";

// Launch week in /admin: how far each real business has got with the new version, and a WhatsApp
// nudge from Samuel for what's left (lib/launch-week.ts). Stacked rows, phone first.

const STEP_LABEL: Record<LaunchStep, string> = {
  setup: "Finish setting up",
  listing: "Listing terms",
  id: "ID",
  bookings: "Bookings on",
  deposits: "Deposits on",
};

function Mark({ ok, label, note }: { ok: boolean; label: string; note?: string }) {
  return (
    <li className={`inline-flex min-h-8 items-center gap-1 rounded-pill px-2.5 text-[13px] font-semibold ${ok ? "bg-success-soft text-success" : "bg-surface-sunken text-ink-muted"}`}>
      {ok ? <Check size={14} aria-hidden="true" /> : <X size={14} aria-hidden="true" />}
      {label}
      {note && <span className="font-normal">· {note}</span>}
    </li>
  );
}

export function LaunchWeek({ rows, now = new Date() }: { rows: LaunchRow[]; now?: Date }) {
  const live = rows.filter((r) => !r.suspended);
  const n = live.length;
  const totals = [
    ["Finished setting up", live.filter((r) => r.setupDone).length],
    ["Accepted listing terms", live.filter((r) => r.termsAt).length],
    ["Deposits on", live.filter((r) => r.depositsOn).length],
    ["ID approved", live.filter((r) => r.kycStatus === "approved").length],
  ] as const;
  const bookings = live.reduce((s, r) => s + r.bookings7d, 0);
  const fromSearch = live.reduce((s, r) => s + r.fromSearch7d, 0);
  // Most left to do first, so the team starts with who needs it most.
  const sorted = [...live].sort((a, b) => stepsLeft(b, now).length - stepsLeft(a, now).length || a.name.localeCompare(b.name));

  return (
    <div className="grid gap-4">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {totals.map(([label, v]) => (
          <div key={label} className="rounded-card border border-line bg-surface-raised p-4">
            <dt className="text-caption text-ink-muted">{label}</dt>
            <dd className="text-title tabular-nums">
              {count(v)} <span className="text-caption font-normal text-ink-muted">of {count(n)}</span>
            </dd>
          </div>
        ))}
        <div className="rounded-card border border-line bg-surface-raised p-4">
          <dt className="text-caption text-ink-muted">Bookings, last 7 days</dt>
          <dd className="text-title tabular-nums">
            {count(bookings)} <span className="text-caption font-normal text-ink-muted">{count(fromSearch)} from search</span>
          </dd>
        </div>
      </dl>

      <ul className="grid gap-3">
        {sorted.map((r) => {
          const left = stepsLeft(r, now);
          const link = nudgeLink(r, now);
          return (
            <li key={r.id} className="grid gap-3 rounded-card border border-line bg-surface-raised p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <span>
                  <b className="block text-[16px]">{r.name}</b>
                  <span className="text-caption text-ink-muted">
                    {r.city} · {count(r.bookings7d)} booking{r.bookings7d === 1 ? "" : "s"} this week{r.fromSearch7d ? `, ${count(r.fromSearch7d)} from search` : ""}
                  </span>
                </span>
                <span className={`rounded-pill px-2.5 py-1 text-[12px] font-semibold ${left.length ? "bg-gold-soft text-gold-text" : "bg-success-soft text-success"}`}>
                  {left.length ? `${left.length} to do` : "All set"}
                </span>
              </div>
              <ul className="flex flex-wrap gap-1.5">
                <Mark ok={r.setupDone} label={STEP_LABEL.setup} />
                <Mark
                  ok={!!r.termsAt}
                  label={STEP_LABEL.listing}
                  note={r.termsAt ? undefined : r.graceUntil && new Date(r.graceUntil).getTime() > now.getTime() ? `by ${lastDay(r.graceUntil)}` : "not listed"}
                />
                <Mark ok={r.spacePhotos > 0} label="Space photo" />
                <Mark ok={r.bookingsOn} label={STEP_LABEL.bookings} />
                <Mark ok={r.depositsOn} label={STEP_LABEL.deposits} />
                <Mark
                  ok={r.kycStatus === "approved"}
                  label={STEP_LABEL.id}
                  note={r.kycStatus === "submitted" ? "waiting for review" : r.kycStatus === "again" ? "asked again" : r.kycGraceUntil ? `by ${lastDay(r.kycGraceUntil)}` : undefined}
                />
              </ul>
              {left.length > 0 &&
                (link ? (
                  <a href={link} target="_blank" rel="noopener noreferrer" className="btn btn-secondary min-h-11 justify-self-start rounded-pill px-4">
                    <MessageCircle size={18} aria-hidden="true" /> Nudge on WhatsApp
                  </a>
                ) : (
                  <p className="text-caption text-ink-muted">No owner WhatsApp number saved.</p>
                ))}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
