import "server-only";

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  caseStudyProblems,
  pieceProblems,
  studioWhatsApp,
  testimonialShows,
  type CaseStudy,
  type StudioPiece,
  type Testimonial,
  type WorkItem,
} from "./studio-shared";

// Tikka Studio's content (PRD B11, TECH_PLAN §19): JSON files in content/studio/, read on the
// server. Only published items show; a file that fails its checks is left out (and fails the
// unit test, so it never reaches a deploy unnoticed).

const ROOT = join(process.cwd(), "content", "studio");
const json = (path: string) => JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;

export function caseStudies(): CaseStudy[] {
  return readdirSync(join(ROOT, "work"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => json(join(ROOT, "work", f)))
    .filter((c) => caseStudyProblems(c).length === 0)
    .map((c) => c as unknown as CaseStudy)
    .filter((c) => c.published)
    .sort((a, b) => a.order - b.order);
}

export function caseStudy(slug: string): CaseStudy | null {
  return caseStudies().find((c) => c.slug === slug) ?? null;
}

export function pieces(): StudioPiece[] {
  const all = (json(join(ROOT, "pieces.json")).pieces ?? []) as Record<string, unknown>[];
  return all.filter((p) => pieceProblems(p).length === 0).map((p) => p as unknown as StudioPiece).filter((p) => p.published);
}

export function clients(): string[] {
  const all = (json(join(ROOT, "clients.json")).clients ?? []) as { name: string; published: boolean }[];
  return all.filter((c) => c.published).map((c) => c.name);
}

export function testimonials(): Testimonial[] {
  return readdirSync(join(ROOT, "testimonials"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => json(join(ROOT, "testimonials", f)) as unknown as Testimonial)
    .filter(testimonialShows);
}

export function testimonial(id: string | null): Testimonial | null {
  return id ? (testimonials().find((t) => t.id === id) ?? null) : null;
}

/** Everything in /studio/work. */
export function allWork(): WorkItem[] {
  return [...caseStudies().map((item) => ({ kind: "case" as const, item })), ...pieces().map((item) => ({ kind: "piece" as const, item }))];
}

/** Three other pieces of work like this one: same category or industry first. */
export function relatedWork(c: CaseStudy): WorkItem[] {
  const score = (w: WorkItem) =>
    (w.item.categories.some((x) => c.categories.includes(x)) ? 2 : 0) + (w.item.industry === c.industry ? 1 : 0) + (w.kind === "case" ? 1 : 0);
  return allWork()
    .filter((w) => !(w.kind === "case" && w.item.slug === c.slug))
    .sort((a, b) => score(b) - score(a))
    .slice(0, 3);
}

export const STUDIO_EMAIL = process.env.STUDIO_EMAIL ?? "studio@usetikka.com";

/** The Studio team's WhatsApp link (STUDIO_WA_NUMBER), naming the case study's client if any. */
export function studioWhatsAppLink(client?: string): string {
  return studioWhatsApp(client, process.env.STUDIO_WA_NUMBER || undefined);
}
