import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { STUDIO_CATEGORIES, STUDIO_INDUSTRIES, type WorkItem } from "@/lib/studio-shared";
import { StudioImage, StudioVideo } from "./StudioMedia";

const categoryLabel = (id: string) => STUDIO_CATEGORIES.find((c) => c.id === id)?.label ?? id;
const industryLabel = (id: string) => STUDIO_INDUSTRIES.find((i) => i.id === id)?.label ?? id;
const SIZES = "(min-width: 1024px) 360px, (min-width: 640px) 45vw, 92vw";

/** One tile of Studio work: a case study (links to it) or an ad or content piece (plays in place). */
export function WorkCard({ work }: { work: WorkItem }) {
  if (work.kind === "case") {
    const c = work.item;
    const cover = c.cover ?? c.media.find((m) => m.type === "image")?.src;
    return (
      <li className="overflow-hidden rounded-card border border-line bg-surface-raised">
        <Link href={`/studio/work/${c.slug}`} className="group grid h-full">
          <div className="aspect-[4/3] overflow-hidden bg-surface-sunken">
            {cover && <StudioImage src={cover} alt="" sizes={SIZES} className="size-full object-cover object-top transition-transform group-hover:scale-[1.02]" />}
          </div>
          <div className="grid gap-1 p-4">
            <p className="text-caption text-ink-muted">
              {c.categories.map(categoryLabel).join(" · ")} · {industryLabel(c.industry)}
            </p>
            <h3 className="text-title flex items-start justify-between gap-2">
              {c.client}
              <ArrowUpRight size={20} className="mt-0.5 shrink-0 text-ink-muted group-hover:text-brand" aria-hidden="true" />
            </h3>
            <p className="text-body text-ink-muted">{c.results[0] ?? c.what_we_did ?? c.title}</p>
          </div>
        </Link>
      </li>
    );
  }
  const p = work.item;
  return (
    <li className="overflow-hidden rounded-card border border-line bg-surface-raised">
      <div className="aspect-[4/5] bg-surface-sunken">
        {p.type === "video" ? (
          <StudioVideo src={p.src} alt={p.title} className="size-full object-cover" />
        ) : (
          <StudioImage src={p.src} alt={p.title} sizes={SIZES} className="size-full object-cover" />
        )}
      </div>
      <div className="grid gap-0.5 p-4">
        <p className="text-caption text-ink-muted">
          {p.categories.map(categoryLabel).join(" · ")} · {industryLabel(p.industry)}
        </p>
        <h3 className="text-body font-semibold">{p.client ? `${p.client} · ${p.title}` : p.title}</h3>
      </div>
    </li>
  );
}
