import { Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { WorkCard } from "@/components/studio/WorkCard";
import { allWork } from "@/lib/studio";
import { filterWork, parseWorkFilters, STUDIO_CATEGORIES, STUDIO_INDUSTRIES, WORK_FILTER_CATEGORIES, workHref, type WorkFilters } from "@/lib/studio-shared";

export const metadata: Metadata = {
  title: { absolute: "Our work · Tikka Studio" },
  description: "Websites, WhatsApp systems, ads and content Tikka Studio has made for businesses.",
};

/** A first screenful on mobile data; the rest on request. */
const FIRST = 24;

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`text-label inline-flex min-h-11 items-center whitespace-nowrap rounded-pill border px-4 ${active ? "border-brand bg-brand text-on-brand" : "border-line-strong bg-surface-raised text-ink"}`}
    >
      {children}
    </Link>
  );
}

async function Work({ searchParams }: { searchParams: PageProps<"/studio/work">["searchParams"] }) {
  const sp = await searchParams;
  const f: WorkFilters = parseWorkFilters(sp);
  const showAll = sp.show === "all";
  const results = filterWork(allWork(), f);
  const shown = showAll ? results : results.slice(0, FIRST);
  const filtered = !!(f.category || f.industry || f.search);

  return (
    <>
      <form action="/studio/work" className="flex gap-2" role="search">
        {f.category && <input type="hidden" name="category" value={f.category} />}
        {f.industry && <input type="hidden" name="industry" value={f.industry} />}
        <label className="flex min-h-11 flex-1 items-center gap-2 rounded-md border border-line-strong bg-surface-raised px-3">
          <Search size={18} className="shrink-0 text-ink-muted" aria-hidden="true" />
          <span className="sr-only">Search our work</span>
          <input id="studio-search" name="search" defaultValue={f.search} placeholder="Search, e.g. skin care, website" enterKeyHint="search" className="h-11 min-w-0 flex-1 bg-transparent text-[16px] outline-none" />
        </label>
        <button type="submit" className="btn btn-secondary min-h-11 px-4 text-label">
          Search
        </button>
      </form>

      <nav aria-label="What we did" className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
        <ul className="flex gap-2 sm:flex-wrap">
          <li><Chip href={workHref(f, { category: undefined })} active={!f.category}>All work</Chip></li>
          {WORK_FILTER_CATEGORIES.map((id) => (
            <li key={id}>
              <Chip href={workHref(f, { category: id })} active={f.category === id}>
                {id === "drops" ? "Drops" : STUDIO_CATEGORIES.find((c) => c.id === id)?.label}
              </Chip>
            </li>
          ))}
        </ul>
      </nav>
      <nav aria-label="Industry" className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
        <ul className="flex gap-2 sm:flex-wrap">
          <li><Chip href={workHref(f, { industry: undefined })} active={!f.industry}>Every industry</Chip></li>
          {STUDIO_INDUSTRIES.map((i) => (
            <li key={i.id}>
              <Chip href={workHref(f, { industry: i.id })} active={f.industry === i.id}>
                {i.label}
              </Chip>
            </li>
          ))}
        </ul>
      </nav>

      {results.length === 0 ? (
        <div className="grid justify-items-start gap-3 rounded-card border border-dashed border-line-strong bg-surface-raised p-6">
          <p className="text-body-lg">Nothing matches that yet.</p>
          <p className="text-body text-ink-muted">Tell us what you need anyway: we may have done it for a business we can&apos;t show here.</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/studio/work" className="btn btn-secondary min-h-11 text-label">Show all work</Link>
            <Link href="/studio/contact" className="btn min-h-11 text-label">Tell us what you need</Link>
          </div>
        </div>
      ) : (
        <>
          <p className="text-caption text-ink-muted" aria-live="polite">
            {filtered ? `${results.length} ${results.length === 1 ? "piece" : "pieces"} of work` : `${results.length} pieces of work`}
          </p>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((w) => (
              <WorkCard key={w.kind === "case" ? `c-${w.item.slug}` : `p-${w.item.key}`} work={w} />
            ))}
          </ul>
          {shown.length < results.length && (
            <Link href={`${workHref(f)}${workHref(f).includes("?") ? "&" : "?"}show=all`} className="btn btn-secondary min-h-11 justify-self-center text-label">
              Show all {results.length}
            </Link>
          )}
        </>
      )}
    </>
  );
}

export default function WorkPage(props: PageProps<"/studio/work">) {
  return (
    <div className="mx-auto grid max-w-6xl gap-5 px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
      <div className="grid gap-2">
        <p className="text-serial font-mono uppercase text-brand">Tikka Studio</p>
        <h1 className="text-display-lg text-balance">Our work</h1>
        <p className="text-body-lg max-w-2xl text-ink-muted">Websites, WhatsApp systems, ads and content we&apos;ve made for businesses. Tap a video to play it.</p>
      </div>
      <Suspense fallback={<div className="h-96 rounded-card bg-surface-sunken" />}>
        <Work searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}
