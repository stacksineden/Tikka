import { ChevronRight, Clock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";
import { StillStuck } from "@/components/site/StillStuck";
import { helpGuides } from "@/lib/help";
import { bySection } from "@/lib/help-shared";

export const metadata: Metadata = {
  title: "Help",
  description: "Short, step-by-step guides to running Tikka drops: set up your card, create a drop, share it, redeem at the counter and follow up.",
};

/** The Help centre (/help): every guide, grouped the way an owner's first week goes. */
export default function HelpPage() {
  const sections = bySection(helpGuides());
  return (
    <>
      <div className="stage bg-night">
        <SiteHeader />
      </div>
      <main className="mx-auto max-w-3xl px-5 pb-20 pt-8 sm:px-6 sm:pt-12">
        <h1 className="text-display-lg">Help</h1>
        <p className="text-body-lg mt-3 text-ink-muted">Short guides to running Tikka, one task at a time. Most take two or three minutes.</p>

        {sections.map((s) => (
          <section key={s.id} aria-labelledby={`${s.id}-h`} className="mt-10">
            <h2 id={`${s.id}-h`} className="text-title">
              {s.label}
            </h2>
            <ul className="mt-3 grid gap-2">
              {s.guides.map((g) => (
                <li key={g.slug}>
                  <Link
                    href={`/help/${g.slug}`}
                    className="flex min-h-11 items-center gap-3 rounded-card border border-line bg-surface-raised p-4 transition-colors hover:border-line-strong"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="text-body block font-semibold text-ink">{g.title}</span>
                      <span className="text-caption mt-0.5 block text-ink-muted">{g.summary}</span>
                    </span>
                    <span className="text-caption hidden shrink-0 items-center gap-1 text-ink-muted sm:flex">
                      <Clock size={14} aria-hidden="true" />
                      {g.minutes} min
                    </span>
                    <ChevronRight size={20} className="shrink-0 text-ink-muted" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <StillStuck />
      </main>
      <SiteFooter />
    </>
  );
}
