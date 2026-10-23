// Ready-made offers for the drop builder (PRD B5 screen 2, TECH_PLAN §3 drop_templates). The
// source of truth is docs/drop-templates.md; scripts/seed-templates.ts parses it with the
// functions here and writes the seed, so it can be rerun after edits.

import { apportion } from "./deck";
import type { RewardType, Tier } from "./types";

export type Goal = "new_customers" | "bring_back" | "quiet_days";
export type TemplateCategory =
  | "beauty_hair"
  | "spa_wellness"
  | "fitness"
  | "food_drinks"
  | "fashion"
  | "health_clinics"
  | "education"
  | "other_services";

export const GOALS: { id: Goal; label: string; note: string }[] = [
  { id: "new_customers", label: "Get new customers", note: "Bring in people who've never been to you." },
  { id: "bring_back", label: "Bring customers back", note: "Remind past customers you're here." },
  { id: "quiet_days", label: "Fill quiet days", note: "Get people in on your slow days." },
];

export function goalLabel(goal: Goal): string {
  return GOALS.find((g) => g.id === goal)?.label ?? goal;
}

/** Every template's share of the drop, legendary · rare · thank-you. */
export const TEMPLATE_SHARES: Record<Tier, number> = { legendary: 2, rare: 10, thank_you: 88 };

export interface TemplateReward {
  tier: Tier;
  /** Percent of the drop. */
  share: number;
  type: RewardType;
  /** % for percent_off, ₦ for naira_off. */
  value: number | null;
  /** "any service" for % / ₦ off; the whole reward otherwise. */
  what: string;
  /** ₦, when the reward needs a minimum spend. */
  minSpend: number | null;
  requiresPurchase: boolean;
}

export interface BounceBack {
  type: RewardType;
  value: number | null;
  what: string;
  minSpend: number | null;
  /** Days after the visit. */
  validityDays: number;
}

export interface DropTemplate {
  id: string;
  category: TemplateCategory;
  goal: Goal;
  name: string;
  why: string;
  rewards: TemplateReward[];
  bounceBack: BounceBack | null;
  validityDays: 7 | 14 | 30;
  /** Quiet-day drops: 1 = Monday … 7 = Sunday. */
  validWeekdays: number[] | null;
  sort: number;
}

/** Business categories (lib/nigeria CATEGORIES) to template categories. */
export function templateCategory(businessCategory: string): TemplateCategory {
  switch (businessCategory) {
    case "Beauty":
      return "beauty_hair";
    case "Wellness":
      return "spa_wellness";
    case "Fitness":
      return "fitness";
    case "Food & drinks":
      return "food_drinks";
    case "Fashion":
      return "fashion";
    case "Health":
      return "health_clinics";
    case "Education":
      return "education";
    default:
      return "other_services";
  }
}

/* ------------------------------------------------------------ parsing */

const money = (s: string) => Number(s.replace(/,/g, ""));

/**
 * One reward as written in the doc, e.g. "₦3,000 off any service over ₦10,000",
 * "Free wash & style (no purchase)", "2 months for the price of 1".
 */
export function parseReward(text: string): Omit<TemplateReward, "tier" | "share"> {
  const noPurchase = /\(no purchase\)/i.test(text);
  let t = text.replace(/\s*\(no purchase\)/i, "").trim();
  const over = t.match(/ over ₦([\d,]+)/);
  const minSpend = over ? money(over[1]) : null;

  const pct = t.match(/^(\d+)% off (.+)$/);
  const off = t.match(/^₦([\d,]+) off (.+)$/);
  if (pct || off) {
    const what = (pct ?? off)![2].replace(/ over ₦[\d,]+/, "").trim();
    return { type: pct ? "percent_off" : "naira_off", value: Number(pct ? pct[1] : money(off![1])), what, minSpend, requiresPurchase: !noPurchase };
  }
  t = t.trim();
  const type: RewardType = /^free\b/i.test(t) ? "free_item" : "perk";
  const needsBuy = /\b(with any|with a|on any|when you book|over ₦|price of)\b/i.test(t);
  return { type, value: null, what: t, minSpend, requiresPurchase: !noPurchase && needsBuy };
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** "Mon–Wed" → [1, 2, 3]; "—" → null. */
export function parseDays(text: string): number[] | null {
  const m = text.trim().match(/^(\w{3})\s*[–-]\s*(\w{3})$/);
  if (!m) return null;
  const a = DAYS.indexOf(m[1]) + 1;
  const b = DAYS.indexOf(m[2]) + 1;
  if (!a || !b) return null;
  const out: number[] = [];
  for (let d = a; ; d = (d % 7) + 1) {
    out.push(d);
    if (d === b) break;
  }
  return out;
}

export function daysLabel(days: number[] | null): string {
  if (!days?.length) return "Any day";
  const sorted = [...days].sort((x, y) => x - y);
  const run = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
  return run && sorted.length > 2 ? `${DAYS[sorted[0] - 1]}–${DAYS[sorted.at(-1)! - 1]}` : sorted.map((d) => DAYS[d - 1]).join(", ");
}

const GOAL_TEXT: Record<string, Goal> = {
  "New customers": "new_customers",
  "Bring customers back": "bring_back",
  "Fill quiet days": "quiet_days",
};

/** Every template row in docs/drop-templates.md, under its `## Category (\`id\`)` heading. */
export function parseTemplatesMarkdown(md: string): DropTemplate[] {
  const out: DropTemplate[] = [];
  let category: TemplateCategory | null = null;
  for (const line of md.split("\n")) {
    const h = line.match(/^## .+\(`(\w+)`\)\s*$/);
    if (h) {
      category = h[1] as TemplateCategory;
      continue;
    }
    if (!category || !line.startsWith("| `")) continue;
    const c = line.split("|").slice(1, -1).map((x) => x.trim());
    if (c.length !== 10) throw new Error(`Template row needs 10 columns: ${line}`);
    const [id, goal, name, why, legendary, rare, thankYou, bounce, validity, days] = c;
    const reward = (tier: Tier, text: string): TemplateReward => ({ tier, share: TEMPLATE_SHARES[tier], ...parseReward(text) });
    const bb = bounce && bounce !== "—" ? parseReward(bounce) : null;
    out.push({
      id: id.replace(/`/g, ""),
      category,
      goal: GOAL_TEXT[goal] ?? (() => { throw new Error(`Unknown goal "${goal}"`); })(),
      name,
      why,
      rewards: [reward("legendary", legendary), reward("rare", rare), reward("thank_you", thankYou)],
      bounceBack: bb ? { type: bb.type, value: bb.value, what: bb.what, minSpend: bb.minSpend, validityDays: 30 } : null,
      validityDays: Number(validity) as 7 | 14 | 30,
      validWeekdays: parseDays(days),
      sort: out.filter((t) => t.category === category && t.goal === GOAL_TEXT[goal]).length + 1,
    });
  }
  return out;
}

/** The template rules (PRD B5). Returns the problems; an empty list means the template is fine. */
export function templateProblems(t: DropTemplate): string[] {
  const p: string[] = [];
  for (const r of t.rewards) {
    if (!r.what.trim()) p.push(`${t.id}: ${r.tier} is empty`);
    if (r.tier !== "thank_you" && !r.requiresPurchase && !(r.tier === "legendary" && r.share <= 2))
      p.push(`${t.id}: ${r.tier} needs a purchase`);
  }
  if (![7, 14, 30].includes(t.validityDays)) p.push(`${t.id}: Tikka lasts must be 7, 14 or 30`);
  if (t.goal === "quiet_days" && !t.validWeekdays?.length) p.push(`${t.id}: quiet-day drops need days`);
  return p;
}

/** Tier counts for a drop of `total` from the shares: largest remainder, at least 1 legendary and rare when it fits. */
export function shareCounts(total: number, shares: [number, number, number] = [TEMPLATE_SHARES.legendary, TEMPLATE_SHARES.rare, TEMPLATE_SHARES.thank_you]): [number, number, number] {
  const [l, r, t] = apportion(total, shares);
  if (total < 3) return [l, r, t];
  let legendary = l;
  let rare = r;
  if (legendary === 0) legendary = 1;
  if (rare === 0) rare = 1;
  return [legendary, rare, total - legendary - rare];
}
