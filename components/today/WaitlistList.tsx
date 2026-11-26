"use client";

// NEW DIRECTION: who's waiting for a full day. When a place opens, the owner tells them from their
// own WhatsApp with the booking link, then takes them off the list.

import { Check, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { removeWaitlistAction } from "@/app/app/booking-settings-actions";
import { waLink } from "@/lib/ledger";

export interface WaitRow {
  id: string;
  day: string;
  dayLabel: string;
  service: string;
  name: string;
  phone: string;
  freeNow: boolean;
}

export function WaitlistList({ rows, business, link }: { rows: WaitRow[]; business: string; link: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!rows.length) return null;
  return (
    <section className="grid gap-2.5" aria-labelledby="wl">
      <div className="flex items-baseline justify-between">
        <h2 id="wl" className="text-title">
          Waitlist
        </h2>
        <span className="text-caption text-ink-muted">Waiting for a full day</span>
      </div>
      <ul className="divide-y divide-line rounded-card border border-line bg-surface-raised">
        {rows.map((w) => {
          const text = `Hi ${w.name}, a place has opened at ${business} on ${w.dayLabel}. Book it here before it goes: ${link}`;
          const href = waLink(w.phone, text);
          return (
            <li key={w.id} className="grid gap-2 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <b className="block">{w.name}</b>
                  <span className="text-caption text-ink-muted">
                    {w.service} · wants {w.dayLabel}
                  </span>
                </span>
                {w.freeNow && <span className="text-caption shrink-0 rounded-pill bg-success-soft px-2 py-0.5 font-semibold text-success">A place is free now</span>}
              </div>
              <div className="flex flex-wrap gap-2">
                {href && (
                  <a href={href} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1.5 rounded-pill border border-brand bg-brand px-3.5 text-sm font-semibold text-on-brand">
                    <Send size={16} aria-hidden="true" /> Tell {w.name}
                  </a>
                )}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      await removeWaitlistAction(w.id);
                      router.refresh();
                    })
                  }
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-pill border border-line bg-surface px-3.5 text-sm font-semibold text-ink disabled:opacity-50"
                >
                  <Check size={16} aria-hidden="true" /> Done, remove
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
