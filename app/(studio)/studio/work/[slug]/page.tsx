import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StudioWhatsApp } from "@/components/studio/StudioChrome";
import { StudioImage, StudioVideo } from "@/components/studio/StudioMedia";
import { WorkCard } from "@/components/studio/WorkCard";
import { caseStudies, caseStudy, relatedWork, testimonial } from "@/lib/studio";
import { STUDIO_CATEGORIES, STUDIO_INDUSTRIES } from "@/lib/studio-shared";

export function generateStaticParams() {
  return caseStudies().map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: PageProps<"/studio/work/[slug]">): Promise<Metadata> {
  const c = caseStudy((await params).slug);
  if (!c) return { title: "Tikka Studio" };
  const title = `${c.client} · Tikka Studio`;
  const description = c.results[0] ?? c.what_we_did ?? c.title;
  const image = `/api/og/studio?slug=${encodeURIComponent(c.slug)}`;
  return {
    title: { absolute: title },
    description,
    openGraph: { title, description, siteName: "Tikka", type: "article", images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

const label = (id: string) => STUDIO_CATEGORIES.find((c) => c.id === id)?.label ?? id;

function Part({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-2">
      <h2 className="text-title">{title}</h2>
      {children}
    </section>
  );
}

export default async function CaseStudyPage({ params }: PageProps<"/studio/work/[slug]">) {
  const c = caseStudy((await params).slug);
  if (!c) notFound();
  const quote = testimonial(c.quote);
  const related = relatedWork(c);
  const lead = c.media[0];

  return (
    <article className="mx-auto grid max-w-4xl gap-10 px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
      <header className="grid gap-3">
        <Link href="/studio/work" className="text-label min-h-11 content-center text-brand">
          ← All work
        </Link>
        <p className="text-serial font-mono uppercase text-brand">
          {c.categories.map(label).join(" · ")} · {STUDIO_INDUSTRIES.find((i) => i.id === c.industry)?.label}
        </p>
        <h1 className="text-display-lg text-balance">{c.client}</h1>
        <p className="text-body-lg text-ink-muted">{c.title}</p>
        <ul className="flex flex-wrap gap-2" aria-label="Services">
          {c.services.map((s) => (
            <li key={s} className="tag bg-surface-sunken text-ink">
              {s}
            </li>
          ))}
        </ul>
        {c.live_url && (
          <a href={c.live_url} target="_blank" rel="noopener noreferrer" className="text-label inline-flex min-h-11 items-center gap-1.5 justify-self-start text-brand">
            See it live <ExternalLink size={16} aria-hidden="true" />
          </a>
        )}
      </header>

      {lead && (
        <div className="overflow-hidden rounded-card border border-line bg-surface-sunken">
          {lead.type === "video" ? (
            <StudioVideo src={lead.src} alt={lead.alt} priority className="mx-auto aspect-[4/5] max-h-[640px] w-full object-cover" />
          ) : (
            <StudioImage src={lead.src} alt={lead.alt} sizes="(min-width: 900px) 860px, 92vw" priority className="w-full" />
          )}
        </div>
      )}

      <div className="grid gap-8">
        {c.challenge && (
          <Part title="The challenge">
            <p className="text-body-lg">{c.challenge}</p>
          </Part>
        )}
        {c.what_we_did && (
          <Part title="What we did">
            <p className="text-body-lg">{c.what_we_did}</p>
          </Part>
        )}
        {c.results.length > 0 && (
          <Part title="The result">
            <ul className="grid gap-2">
              {c.results.map((r) => (
                <li key={r} className="text-body-lg rounded-card border border-line bg-surface-raised p-4 font-semibold">
                  {r}
                </li>
              ))}
            </ul>
          </Part>
        )}
      </div>

      {c.media.length > 1 && (
        <section aria-label="More from this project" className="grid gap-4 sm:grid-cols-2">
          {c.media.slice(1).map((m) => (
            <figure key={m.src} className="grid content-start gap-2">
              <div className={`overflow-hidden rounded-card border border-line bg-surface-sunken ${m.frame === "phone" ? "mx-auto w-full max-w-[300px] rounded-[28px] border-4 border-ink" : ""}`}>
                {m.type === "video" ? (
                  <StudioVideo src={m.src} alt={m.alt} className="aspect-[9/16] w-full" />
                ) : (
                  <StudioImage src={m.src} alt={m.alt} sizes="(min-width: 640px) 420px, 92vw" className="w-full" />
                )}
              </div>
              {m.caption && <figcaption className="text-caption text-ink-muted">{m.caption}</figcaption>}
            </figure>
          ))}
        </section>
      )}

      {quote && (
        <figure className="grid gap-3 rounded-card border border-line bg-surface-raised p-6">
          <blockquote className="text-body-lg">&ldquo;{quote.quote}&rdquo;</blockquote>
          <figcaption className="text-body text-ink-muted">
            <span className="font-semibold text-ink">{quote.name}</span>
            {quote.role ? `, ${quote.role}` : ""}, {quote.business}
          </figcaption>
        </figure>
      )}

      <section aria-labelledby="similar-h" className="grid justify-items-start gap-4 rounded-card bg-surface-sunken p-6">
        <h2 id="similar-h" className="text-heading">Want something like this?</h2>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <StudioWhatsApp client={c.client} className="btn btn-lg" />
          <Link href={`/studio/contact?from=${c.slug}`} className="btn btn-lg btn-secondary">
            Send us your details
          </Link>
        </div>
      </section>

      {related.length > 0 && (
        <section aria-labelledby="related-h" className="grid gap-4">
          <h2 id="related-h" className="text-heading">More of our work</h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((w) => (
              <WorkCard key={w.kind === "case" ? `c-${w.item.slug}` : `p-${w.item.key}`} work={w} />
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
