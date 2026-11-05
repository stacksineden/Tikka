// The Help centre (/help): short, task-by-task guides for business owners and their staff. The
// guides are JSON files in content/help/; this file holds their shape and the checks every file
// must pass. Pure, so it's unit-tested; lib/help.ts reads the files.

export const HELP_SECTIONS = [
  { id: "start", label: "Getting started" },
  { id: "drops", label: "Running a drop" },
  { id: "counter", label: "At the counter" },
  { id: "followup", label: "After the drop" },
  { id: "money", label: "Paying for drops" },
] as const;
export type HelpSection = (typeof HELP_SECTIONS)[number]["id"];

export interface HelpStep {
  title: string;
  /** Plain text. A blank line starts a new paragraph. */
  body: string;
}

export interface HelpGuide {
  slug: string;
  title: string;
  /** One line under the title, and on the guide's card. */
  summary: string;
  section: HelpSection;
  /** Order inside its section. */
  order: number;
  /** About how long it takes, in minutes. */
  minutes: number;
  /** Where in the dashboard this happens ("Open Drops"). */
  app?: { href: string; label: string };
  steps: HelpStep[];
  /** Short extra advice, shown after the steps. */
  tips?: string[];
  published: boolean;
}

// Copy rules from CLAUDE.md: no gambling words, and naira is always ₦.
const GAMBLING = /\b(win|wins|winner|winners|winning|luck|lucky|jackpot|odds|bet|bets|stake|stakes|lottery|raffle|prize draw)\b/i;
const NAIRA_WRONG = /\bNGN\b|\bN\d/;

const isText = (v: unknown, max: number) => typeof v === "string" && v.trim().length > 0 && v.length <= max;

/** Everything wrong with a guide file; empty when it's fine. */
export function guideProblems(g: Record<string, unknown>): string[] {
  const p: string[] = [];
  if (typeof g.slug !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(g.slug)) p.push("slug: lowercase words joined by hyphens");
  if (!isText(g.title, 70)) p.push("title: 1–70 characters");
  if (!isText(g.summary, 160)) p.push("summary: 1–160 characters");
  if (!HELP_SECTIONS.some((s) => s.id === g.section)) p.push(`section: one of ${HELP_SECTIONS.map((s) => s.id).join(", ")}`);
  if (typeof g.order !== "number") p.push("order: a number");
  if (typeof g.minutes !== "number" || g.minutes < 1 || g.minutes > 15) p.push("minutes: 1–15");
  if (typeof g.published !== "boolean") p.push("published: true or false");
  if (g.app !== undefined) {
    const a = g.app as { href?: unknown; label?: unknown };
    if (typeof a.href !== "string" || !a.href.startsWith("/app")) p.push("app.href: a dashboard path starting /app");
    if (!isText(a.label, 40)) p.push("app.label: 1–40 characters");
  }
  const steps = g.steps as HelpStep[] | undefined;
  if (!Array.isArray(steps) || steps.length < 2 || steps.length > 10) p.push("steps: 2–10 steps");
  else
    steps.forEach((s, i) => {
      if (!isText(s?.title, 80)) p.push(`steps[${i}].title: 1–80 characters`);
      if (!isText(s?.body, 700)) p.push(`steps[${i}].body: 1–700 characters`);
    });
  if (g.tips !== undefined && (!Array.isArray(g.tips) || g.tips.some((t) => !isText(t, 300)))) p.push("tips: a list of short lines");

  const all = [g.title, g.summary, ...(Array.isArray(steps) ? steps.flatMap((s) => [s?.title, s?.body]) : []), ...(Array.isArray(g.tips) ? g.tips : [])]
    .filter((t): t is string => typeof t === "string")
    .join("\n");
  const word = all.match(GAMBLING);
  if (word) p.push(`copy: no gambling words ("${word[0]}")`);
  if (NAIRA_WRONG.test(all)) p.push("copy: write naira as ₦");
  return p;
}

/** Guides grouped by section, in section order, each sorted by `order`. Empty sections are left out. */
export function bySection(guides: HelpGuide[]): { id: HelpSection; label: string; guides: HelpGuide[] }[] {
  return HELP_SECTIONS.map((s) => ({ ...s, guides: guides.filter((g) => g.section === s.id).sort((a, b) => a.order - b.order) })).filter((s) => s.guides.length > 0);
}

/** Reading order across the whole Help centre, for "Next guide". */
export function nextGuide(guides: HelpGuide[], slug: string): HelpGuide | null {
  const flat = bySection(guides).flatMap((s) => s.guides);
  const i = flat.findIndex((g) => g.slug === slug);
  return i >= 0 && i < flat.length - 1 ? flat[i + 1] : null;
}

/** Paragraphs of a step's body. */
export function paragraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((t) => t.trim())
    .filter(Boolean);
}
