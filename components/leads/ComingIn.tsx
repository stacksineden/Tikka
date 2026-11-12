import { CalendarDays } from "lucide-react";
import Link from "next/link";
import type { ComingInDay } from "@/lib/followups";
import { VISIT_PARTS } from "@/lib/visit";

const PART_LABEL = Object.fromEntries(VISIT_PARTS.map((p) => [p.id, p.label]));

/**
 * "Coming in": who said they'd come, by day and time of day, from their Tikka's
 * "When will you come in?". Owners only (it comes from the lead list, rule 4). No phone numbers.
 * `more` links to the full week on Leads; without it, every day is shown.
 */
export function ComingIn({ days, more }: { days: ComingInDay[]; more?: string }) {
  if (days.length === 0) return null;
  const total = days.reduce((n, d) => n + d.count, 0);
  return (
    <section id="coming-in" className="grid scroll-mt-20 gap-3 rounded-card border border-line bg-surface-raised p-4 sm:p-5" aria-labelledby="coming-in-h">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="coming-in-h" className="text-title flex items-center gap-2 text-[17px] leading-6">
            <CalendarDays size={20} aria-hidden="true" className="text-brand" />
            Coming in · {total}
          </h2>
          <p className="text-caption text-ink-muted">When people said they&apos;d come to use their Tikka.</p>
        </div>
        {more && (
          <Link href={more} className="text-label inline-flex min-h-11 shrink-0 items-center text-brand hover:underline">
            See the week
          </Link>
        )}
      </div>
      <ul className="grid gap-3 lg:grid-cols-2">
        {days.map((d) => (
          <li key={d.date} className="grid gap-2 rounded-md border border-line p-3">
            <h3 className="text-body font-semibold">
              {d.label} · {d.count}
            </h3>
            {d.parts.map((g) => (
              <div key={g.part ?? "any"} className="grid gap-1">
                <p className="text-caption font-semibold text-ink-muted">{g.part ? PART_LABEL[g.part] : "Any time"}</p>
                <ul className="grid gap-1">
                  {g.leads.map((l) => (
                    <li key={l.id} className="text-body flex min-w-0 gap-1.5">
                      <span className="shrink-0 font-semibold">{l.name}</span>
                      <span className="truncate text-ink-muted">· {l.reward}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </li>
        ))}
      </ul>
    </section>
  );
}
