import { ArrowRight, Clock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";
import { StillStuck } from "@/components/site/StillStuck";
import { claimMode } from "@/lib/claim-mode";
import { helpGuide, helpGuides } from "@/lib/help";
import { HELP_SECTIONS, nextGuide, paragraphs } from "@/lib/help-shared";

/** While customers claim on the page (TIKKA_CLAIM_MODE=page), guides that describe WhatsApp claiming say so. Gone once WhatsApp is on. */
const PAGE_CLAIM_NOTES: Record<string, string> = {
  "what-customers-see":
    "For now, customers claim on the page: they type their first name and WhatsApp number, and their Tikka opens right there. Claiming on WhatsApp is switching on soon, and then their Tikka also arrives in their WhatsApp.",
  "create-your-first-drop": "For now, customers claim on the page with their WhatsApp number. Claiming on WhatsApp is switching on soon.",
  "follow-up-with-leads":
    "For now, customers claim on the page by typing their WhatsApp number, so some leads say \"Number not confirmed\": the number wasn't checked on WhatsApp. Tikka also can't remind them or ask for a review yet, so use Message today to remind them, and Ask for a review once they've been in.",
};

export function generateStaticParams() {
  return helpGuides().map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: PageProps<"/help/[slug]">): Promise<Metadata> {
  const g = helpGuide((await params).slug);
  if (!g) return { title: "Help" };
  return { title: `${g.title} · Help`, description: g.summary };
}

/** One Help guide: numbered steps, a way into the dashboard, tips, and the next guide. */
export default async function HelpGuidePage({ params }: PageProps<"/help/[slug]">) {
  const g = helpGuide((await params).slug);
  if (!g) notFound();
  const next = nextGuide(helpGuides(), g.slug);
  const section = HELP_SECTIONS.find((s) => s.id === g.section)?.label;

  return (
    <>
      <div className="stage bg-night">
        <SiteHeader />
      </div>
      <main className="mx-auto max-w-3xl px-5 pb-20 pt-8 sm:px-6 sm:pt-12">
        <nav aria-label="Breadcrumb" className="text-label flex flex-wrap items-center gap-1 text-ink-muted">
          <Link href="/help" className="inline-flex min-h-11 items-center text-brand">
            Help
          </Link>
          <span aria-hidden="true">/</span>
          <span>{section}</span>
        </nav>

        <h1 className="text-display-lg mt-2 text-balance">{g.title}</h1>
        <p className="text-body-lg mt-3 text-ink-muted">{g.summary}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="text-caption inline-flex items-center gap-1.5 text-ink-muted">
            <Clock size={16} aria-hidden="true" />
            About {g.minutes} {g.minutes === 1 ? "minute" : "minutes"}
          </span>
          {g.app && (
            <Link href={g.app.href} className="btn btn-secondary min-h-11 px-4">
              {g.app.label}
              <ArrowRight aria-hidden="true" />
            </Link>
          )}
        </div>

        {claimMode() === "page" && PAGE_CLAIM_NOTES[g.slug] && (
          <p role="note" className="text-body mt-8 rounded-card border border-dashed border-line-strong bg-surface-sunken p-4 text-ink">
            <strong>Right now: </strong>
            {PAGE_CLAIM_NOTES[g.slug]}
          </p>
        )}

        <ol className="mt-10 grid gap-8">
          {g.steps.map((s, i) => (
            <li key={s.title} className="grid grid-cols-[auto_minmax(0,1fr)] gap-4">
              <span className="grid size-9 place-items-center rounded-pill bg-brand-soft font-mono text-[15px] font-bold text-brand" aria-hidden="true">
                {i + 1}
              </span>
              <div>
                <h2 className="text-title">
                  <span className="sr-only">Step {i + 1}: </span>
                  {s.title}
                </h2>
                <div className="text-body mt-2 grid gap-3 text-ink">
                  {paragraphs(s.body).map((p) => (
                    <p key={p}>{p}</p>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ol>

        {g.tips && g.tips.length > 0 && (
          <aside aria-labelledby="tips-h" className="mt-10 rounded-card border border-line bg-surface-sunken p-5">
            <h2 id="tips-h" className="text-label text-ink">
              Good to know
            </h2>
            <ul className="text-body mt-2 grid gap-2 text-ink [&_li]:ml-5 [&_li]:list-disc">
              {g.tips.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </aside>
        )}

        {next && (
          <Link
            href={`/help/${next.slug}`}
            className="mt-10 flex min-h-11 items-center justify-between gap-3 rounded-card border border-line bg-surface-raised p-4 transition-colors hover:border-line-strong"
          >
            <span>
              <span className="text-caption block text-ink-muted">Next guide</span>
              <span className="text-body block font-semibold text-ink">{next.title}</span>
            </span>
            <ArrowRight size={20} className="shrink-0 text-brand" aria-hidden="true" />
          </Link>
        )}

        <StillStuck />
      </main>
      <SiteFooter />
    </>
  );
}
