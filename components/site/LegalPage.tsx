import Link from "next/link";
import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "./SiteChrome";

/** A fact still to fill in ("[privacy email]"). The production build refuses a page that has one. */
export function Blank({ children }: { children: ReactNode }) {
  return <mark className="rounded-sm bg-brand-soft px-1 text-ink">[{children}]</mark>;
}

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

/**
 * The privacy policy and terms (PRD C1): plain words, one section each, a contents list for
 * phones. While `draft` is on, a note says the text is waiting on legal review; the production
 * build refuses to ship either page while it still carries the LEGAL_PLACEHOLDER marker.
 */
export function LegalPage({ title, intro, updated, draft, sections, other }: { title: string; intro: ReactNode; updated: ReactNode; draft: boolean; sections: LegalSection[]; other: { href: string; label: string } }) {
  return (
    <>
      <div className="stage bg-night">
        <SiteHeader />
      </div>
      <main className="mx-auto max-w-3xl px-5 pb-20 pt-8 sm:px-6 sm:pt-12">
        {draft && (
          <p role="note" className="text-body mb-6 rounded-card border border-dashed border-line-strong bg-surface-sunken p-4 text-ink">
            <strong>Draft.</strong> This text is being checked by our lawyer and may change before Tikka opens to the public. Blanks in [brackets] are still to be filled in.
          </p>
        )}
        <h1 className="text-display-lg">{title}</h1>
        <p className="text-caption mt-2 text-ink-muted">Last updated {updated}</p>
        <div className="text-body-lg mt-6 grid gap-3 text-ink">{intro}</div>

        <nav aria-label="On this page" className="mt-8 rounded-card border border-line bg-surface-raised p-4">
          <h2 className="text-label text-ink-muted">On this page</h2>
          <ol className="text-body mt-2 grid gap-1">
            {sections.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="inline-flex min-h-11 items-center text-brand">
                  {i + 1}. {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {sections.map((s, i) => (
          <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="mt-10 scroll-mt-20">
            <h2 id={`${s.id}-h`} className="text-title">
              {i + 1}. {s.title}
            </h2>
            <div className="text-body mt-3 grid gap-3 text-ink [&_li]:ml-5 [&_li]:list-disc [&_ul]:grid [&_ul]:gap-1.5">{s.body}</div>
          </section>
        ))}

        <p className="text-body mt-12 text-ink-muted">
          See also our <Link href={other.href} className="text-brand underline">{other.label}</Link>.
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
