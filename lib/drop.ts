// The drop builder's rules (PRD B5, TECH_PLAN §4). Pure: shared by the builder, the server
// actions and the tests.

import { apportion } from "./deck";
import { count, naira, percent, shortDate } from "./format";
import type { BounceBack, DropTemplate, Goal } from "./templates";
import type { Finish, RewardType, Tier } from "./types";

export type MixId = "generous" | "balanced" | "mostly_thank_you" | "custom";
export type Eligibility = "once_per_drop" | "once_per_period" | "new_only";

export const MIXES: { id: Exclude<MixId, "custom">; label: string; pct: [number, number, number] }[] = [
  { id: "generous", label: "Generous", pct: [5, 25, 70] },
  { id: "balanced", label: "Balanced", pct: [2, 10, 88] },
  { id: "mostly_thank_you", label: "Mostly thank-you", pct: [1, 4, 95] },
];

export const TIERS: Tier[] = ["legendary", "rare", "thank_you"];

export const REWARD_TYPES: { type: RewardType; label: string }[] = [
  { type: "percent_off", label: "% off" },
  { type: "naira_off", label: "₦ off" },
  { type: "free_item", label: "Free item" },
  { type: "perk", label: "Perk" },
  { type: "action", label: "Action card" },
];

export const THANK_YOU_SUGGESTIONS = ["Priority booking", "Free consultation", "Early access to our next drop"];

export interface DraftReward {
  id: string;
  tier: Tier;
  type: RewardType;
  /** % for percent_off, ₦ for naira_off. */
  value: number | null;
  /** "any service" for % / ₦ off; the item for free_item; the perk; the reward after an action. */
  what: string;
  /** Action cards only: what to do, e.g. "Follow @glowstudio on Instagram". */
  action: string;
  terms: string;
  count: number;
  /** ₦, when the reward needs a minimum spend. */
  minSpend: number | null;
  /** Needs a purchase (a minimum spend, or a free extra with a paid service). */
  requiresPurchase: boolean;
}

export type Days = 7 | 14 | 30;
export const DAY_CHOICES: Days[] = [7, 14, 30];

export type AudienceBand = "under_300" | "300_1000" | "1000_5000" | "over_5000";
/** "About how many people see your WhatsApp status or Instagram posts?" → about 1 Tikka per 3 viewers. */
export const AUDIENCE: { id: AudienceBand; label: string; suggest: number }[] = [
  { id: "under_300", label: "Under 300", suggest: 100 },
  { id: "300_1000", label: "300–1,000", suggest: 300 },
  { id: "1000_5000", label: "1,000–5,000", suggest: 1000 },
  { id: "over_5000", label: "More than 5,000", suggest: 3000 },
];

export interface DraftBounceBack extends BounceBack {
  on: boolean;
}

export interface DropDraft {
  id?: string;
  goal: Goal;
  /** The ready-made offer it started from; none for "Make my own". */
  templateId?: string;
  name: string;
  total: number;
  startMode: "now" | "later";
  /** Local WAT date-time, "2026-10-21T09:00" (what <input type="datetime-local"> gives). */
  startsAt: string;
  endsAt: string;
  mix: MixId;
  rewards: DraftReward[];
  finish: Finish;
  eligibility: Eligibility;
  periodDays: number;
  newReservedPct: number;
  showOnMarketplace: boolean;
  marketplaceCap: number | null;
  /** "Drop runs for": the end date follows the start. */
  durationDays: Days;
  /** "Each Tikka lasts": days after it's claimed, even past the drop's end. */
  validityDays: Days;
  /** Quiet-day drops: codes only work on these days (1 = Monday … 7 = Sunday). */
  validWeekdays: number[] | null;
  bounceBack: DraftBounceBack;
  audienceBand: AudienceBand | null;
  /** Drop-check warnings still showing at publish (set by the server). */
  ignoredWarnings: string[];
  copiedFrom?: string;
}

/** maxTotal is the largest self-serve tier (drop_tiers); bigger drops are set up with Tikka. */
export const LIMITS = { name: 40, minTotal: 10, maxTotal: 3_000, maxDays: 30, terms: 60 } as const;

/* ------------------------------------------------------------- dates */

/** A WAT wall-clock string to an ISO instant ("…+01:00"). */
export function watToIso(local: string): string {
  return `${local}:00+01:00`;
}

/** An instant to the WAT wall-clock string a datetime-local input wants. */
export function isoToWat(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 60 * 60 * 1000);
  return d.toISOString().slice(0, 16);
}

function addDays(now: Date, days: number, hour: number): string {
  const wat = isoToWat(now.toISOString()).slice(0, 10);
  const d = new Date(`${wat}T00:00:00+01:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return `${isoToWat(d.toISOString()).slice(0, 10)}T${String(hour).padStart(2, "0")}:00`;
}

/* ----------------------------------------------------------- rewards */

let seq = 0;
export function newReward(tier: Tier, p: Partial<DraftReward> = {}): DraftReward {
  seq += 1;
  return {
    id: `r${Date.now().toString(36)}${seq}`,
    tier,
    type: tier === "thank_you" ? "perk" : tier === "legendary" ? "free_item" : "percent_off",
    value: tier === "rare" ? 20 : null,
    what: tier === "rare" ? "any service" : "",
    action: "",
    terms: "",
    count: 0,
    minSpend: null,
    requiresPurchase: tier === "rare",
    ...p,
  };
}

/** How the reward reads on the card and in "What's in this drop": "₦3,000 off any service over ₦10,000". */
export function rewardLabel(r: Pick<DraftReward, "type" | "value" | "what"> & { minSpend?: number | null }): string {
  const base = baseLabel(r);
  return r.minSpend && !/ over ₦/.test(base) ? `${base} over ${naira(r.minSpend)}` : base;
}

/** "10% off your next visit", "₦2,000 off your next visit over ₦8,000". */
export function bounceBackLabel(b: Pick<DraftBounceBack, "type" | "value" | "what" | "minSpend">): string {
  return rewardLabel(b);
}

/** "Free pedicure with any service": a free extra that still needs a paid service. */
export const WITH_PURCHASE = /\b(with any|with a|on any|when you book|over ₦|price of)\b/i;

/** After an edit: does this reward still need a purchase? */
export function purchaseFor(r: Pick<DraftReward, "type" | "what" | "minSpend">): boolean {
  return !!r.minSpend || r.type === "percent_off" || r.type === "naira_off" || WITH_PURCHASE.test(r.what);
}

/** % and ₦ off, and minimum spends, always need a purchase. */
export function needsPurchase(r: Pick<DraftReward, "type" | "minSpend" | "requiresPurchase">): boolean {
  return r.requiresPurchase || !!r.minSpend || r.type === "percent_off" || r.type === "naira_off";
}

function baseLabel(r: Pick<DraftReward, "type" | "value" | "what">): string {
  const what = r.what.trim();
  switch (r.type) {
    case "percent_off":
      return `${r.value ?? "…"}% off ${what || "any service"}`;
    case "naira_off":
      return `${r.value ? naira(r.value) : "₦…"} off ${what || "any service"}`;
    case "free_item":
      return what ? (/^free\b/i.test(what) ? what : `Free ${what.charAt(0).toLowerCase()}${what.slice(1)}`) : "Free …";
    case "perk":
    case "action":
      return what || "…";
  }
}

export function tierCount(d: Pick<DropDraft, "rewards">, tier: Tier): number {
  return d.rewards.filter((r) => r.tier === tier).reduce((a, r) => a + r.count, 0);
}

/** Thank-you takes whatever legendary and rare leave. */
export function withThankYouFilled(d: DropDraft): DropDraft {
  const rest = Math.max(0, d.total - tierCount(d, "legendary") - tierCount(d, "rare"));
  let filled = false;
  const rewards = d.rewards.map((r) => {
    if (r.tier !== "thank_you") return r;
    if (filled) return { ...r, count: 0 };
    filled = true;
    return { ...r, count: rest };
  });
  return { ...d, rewards };
}

/** Tier counts for a quick-start mix; legendary and rare get at least 1 when the total allows. */
export function mixCounts(total: number, pct: [number, number, number]): [number, number, number] {
  let legendary = Math.round((total * pct[0]) / 100);
  let rare = Math.round((total * pct[1]) / 100);
  if (total >= 3) {
    legendary = Math.max(1, legendary);
    rare = Math.max(1, rare);
  }
  return [legendary, rare, Math.max(0, total - legendary - rare)];
}

/** Sets a tier's total, split across its rewards in their current proportions. */
export function setTierCount(d: DropDraft, tier: Tier, n: number): DropDraft {
  const inTier = d.rewards.filter((r) => r.tier === tier);
  if (inTier.length === 0) return d;
  const weights = inTier.map((r) => r.count);
  const split = apportion(n, weights.some((w) => w > 0) ? weights : inTier.map(() => 1));
  let i = 0;
  return { ...d, rewards: d.rewards.map((r) => (r.tier === tier ? { ...r, count: split[i++] } : r)) };
}

export function applyMix(d: DropDraft, mix: MixId): DropDraft {
  const m = MIXES.find((x) => x.id === mix);
  if (!m) return { ...d, mix };
  const [legendary, rare] = mixCounts(d.total, m.pct);
  return withThankYouFilled(setTierCount(setTierCount({ ...d, mix }, "legendary", legendary), "rare", rare));
}

/** When the total changes: keep the mix's percentages, or keep custom counts and refill thank-you. */
export function setTotal(d: DropDraft, total: number): DropDraft {
  const next = { ...d, total };
  return d.mix === "custom" ? withThankYouFilled(next) : applyMix(next, d.mix);
}

/** "600 Tikkas · 10 legendary (1.7%) · 50 rare (8.3%) · 540 thank-you (90%)" */
export function summary(d: DropDraft): string {
  const t = d.total;
  const part = (tier: Tier, label: string) => {
    const n = tierCount(d, tier);
    return `${count(n)} ${label} (${percent(n, t, 1)})`;
  };
  return [`${count(t)} Tikkas`, part("legendary", "legendary"), part("rare", "rare"), part("thank_you", "thank-you")].join(" · ");
}

/** "What's in this drop", legendary first, empty rewards left out. */
export function dropItems(d: DropDraft) {
  return TIERS.flatMap((tier) =>
    d.rewards.filter((r) => r.tier === tier && r.count > 0).map((r) => ({ tier, count: r.count, reward: rewardLabel(r) })),
  );
}

/* --------------------------------------------------------- the draft */

export const DEFAULT_BOUNCE_BACK: DraftBounceBack = { on: true, type: "percent_off", value: 10, what: "your next visit", minSpend: null, validityDays: 30 };

export function blankDraft(now: Date): DropDraft {
  const base: DropDraft = {
    goal: "new_customers",
    name: "",
    total: 500,
    startMode: "now",
    startsAt: addDays(now, 1, 9),
    endsAt: addDays(now, 14, 21),
    mix: "balanced",
    rewards: [newReward("legendary"), newReward("rare"), newReward("thank_you", { what: "Priority booking" })],
    finish: "foil",
    eligibility: "new_only",
    periodDays: 30,
    newReservedPct: 70,
    showOnMarketplace: true,
    marketplaceCap: null,
    durationDays: 14,
    validityDays: 14,
    validWeekdays: null,
    bounceBack: { ...DEFAULT_BOUNCE_BACK },
    audienceBand: null,
    ignoredWarnings: [],
  };
  return applyMix(base, "balanced");
}

/** Who can claim follows the goal: new customers only for "Get new customers". */
export function withGoal(d: DropDraft, goal: Goal): DropDraft {
  return {
    ...d,
    goal,
    eligibility: goal === "new_customers" ? "new_only" : d.eligibility === "new_only" ? "once_per_drop" : d.eligibility,
    validWeekdays: goal === "quiet_days" ? (d.validWeekdays ?? [1, 2, 3]) : null,
  };
}

/** A ready-made offer: its rewards at 2/10/88 of the drop, its bounce-back, days and how long each Tikka lasts. */
export function draftFromTemplate(d: DropDraft, t: DropTemplate): DropDraft {
  const rewards = t.rewards.map((r) =>
    newReward(r.tier, { type: r.type, value: r.value, what: r.what, minSpend: r.minSpend, requiresPurchase: r.requiresPurchase }),
  );
  const next: DropDraft = {
    ...withGoal(d, t.goal),
    templateId: t.id,
    name: !d.name.trim() || d.templateId ? t.name : d.name,
    rewards,
    validityDays: t.validityDays,
    validWeekdays: t.goal === "quiet_days" ? t.validWeekdays : null,
    bounceBack: t.bounceBack ? { ...t.bounceBack, on: true } : { ...DEFAULT_BOUNCE_BACK },
  };
  return applyMix(next, "balanced");
}

/** "Make my own": the full tier editor, starting from a plain mix. */
export function ownOffer(d: DropDraft): DropDraft {
  const base = blankDraft(new Date());
  return applyMix({ ...d, templateId: undefined, rewards: base.rewards }, "balanced");
}

/** The end follows the start and "Drop runs for". */
export function withDuration(d: DropDraft, days: Days, now: Date): DropDraft {
  const start = d.startMode === "now" ? isoToWat(now.toISOString()) : d.startsAt;
  const startDate = new Date(watToIso(start || isoToWat(now.toISOString())));
  return { ...d, durationDays: days, endsAt: addDays(startDate, days, 21) };
}

/** "Run it again": same rewards and rules, fresh name and dates. */
export function copyDraft(from: DropDraft, now: Date, fromId: string): DropDraft {
  const fresh = blankDraft(now);
  return {
    ...from,
    id: undefined,
    name: `${from.name} (again)`.slice(0, LIMITS.name),
    startMode: "now",
    startsAt: fresh.startsAt,
    endsAt: addDays(now, from.durationDays ?? 14, 21),
    rewards: from.rewards.map((r) => newReward(r.tier, { ...r, id: undefined })),
    ignoredWarnings: [],
    copiedFrom: fromId,
  };
}

/* -------------------------------------------------------- validation */

export type Errors = Partial<Record<string, string>>;

export function validateStep1(d: DropDraft, now: Date): Errors {
  const e: Errors = {};
  if (!d.name.trim()) e.name = "Name your drop, e.g. December Glow.";
  else if (d.name.trim().length > LIMITS.name) e.name = `Keep it under ${LIMITS.name} characters.`;
  if (!Number.isInteger(d.total) || d.total < LIMITS.minTotal) e.total = `A drop needs at least ${LIMITS.minTotal} Tikkas.`;
  else if (d.total > LIMITS.maxTotal) e.total = `For drops over ${count(LIMITS.maxTotal)} Tikkas, talk to us.`;

  const start = d.startMode === "now" ? now : new Date(watToIso(d.startsAt));
  if (d.startMode === "later") {
    if (!d.startsAt || Number.isNaN(start.getTime())) e.startsAt = "Pick when it opens.";
    else if (start.getTime() < now.getTime() + 5 * 60_000) e.startsAt = "Pick a time in the future, or start now.";
  }
  const end = new Date(watToIso(d.endsAt));
  if (!d.endsAt || Number.isNaN(end.getTime())) e.endsAt = "Pick when it ends.";
  else if (end.getTime() < start.getTime() + 60 * 60_000) e.endsAt = "End it at least an hour after it opens.";
  else if (end.getTime() > start.getTime() + LIMITS.maxDays * 86_400_000) e.endsAt = `A drop can run for up to ${LIMITS.maxDays} days.`;
  return e;
}

export function validateStep2(d: DropDraft): Errors {
  const e: Errors = {};
  const taken = tierCount(d, "legendary") + tierCount(d, "rare");
  if (taken > d.total) e.counts = `Legendary and rare add up to ${count(taken)}, more than the ${count(d.total)} Tikkas in the drop.`;
  for (const r of d.rewards) {
    if (r.count < 0 || !Number.isInteger(r.count)) e[`count-${r.id}`] = "Use a whole number.";
    if (r.count === 0 && r.tier !== "thank_you") continue;
    if (r.tier === "thank_you" && r.count === 0) continue;
    const key = `reward-${r.id}`;
    if (r.type === "percent_off" && (!r.value || r.value < 1 || r.value > 100)) e[key] = "Enter a percentage from 1 to 100.";
    else if (r.type === "naira_off" && (!r.value || r.value < 100)) e[key] = "Enter an amount in naira, at least ₦100.";
    else if ((r.type === "free_item" || r.type === "perk") && !r.what.trim())
      e[key] = r.tier === "thank_you" ? "Name the small benefit everyone else gets." : "Say what they get.";
    else if (r.type === "action" && (!r.action.trim() || !r.what.trim())) e[key] = "Say what they do, and what they get for it.";
    if (r.terms.length > LIMITS.terms) e[`terms-${r.id}`] = `Keep terms under ${LIMITS.terms} characters.`;
  }
  return e;
}

export function validateStep3(d: DropDraft): Errors {
  const e: Errors = {};
  if (d.goal === "quiet_days" && !d.validWeekdays?.length) e.validWeekdays = "Pick at least one day people can use it.";
  if (!DAY_CHOICES.includes(d.validityDays)) e.validityDays = "Pick 7, 14 or 30 days.";
  if (d.bounceBack.on) {
    const b = d.bounceBack;
    if (b.type === "percent_off" && (!b.value || b.value < 1 || b.value > 100)) e.bounceBack = "Enter a percentage from 1 to 100.";
    else if (b.type === "naira_off" && (!b.value || b.value < 100)) e.bounceBack = "Enter an amount in naira, at least ₦100.";
    else if (!b.what.trim()) e.bounceBack = "Say what they get on their next visit.";
  }
  if (d.eligibility === "once_per_period" && (!Number.isInteger(d.periodDays) || d.periodDays < 1 || d.periodDays > 365))
    e.periodDays = "Pick between 1 and 365 days.";
  if (d.newReservedPct < 0 || d.newReservedPct > 100) e.newReservedPct = "Use 0 to 100%.";
  if (d.marketplaceCap !== null && (d.marketplaceCap < 1 || d.marketplaceCap > d.total))
    e.marketplaceCap = `Use a number from 1 to ${count(d.total)}, or turn the limit off.`;
  return e;
}

export function validateDraft(d: DropDraft, now: Date): Errors {
  return { ...validateStep1(d, now), ...validateStep2(d), ...validateStep3(d) };
}

/* ------------------------------------------------------- size advice */

export interface PastDrop {
  name: string;
  total: number;
  claimed: number;
}

/** "Your last drop, September Reset, ran out: 400 of 400 claimed. Try 500." */
export function sizeAdvice(last: PastDrop | undefined): { text: string; suggest: number } | null {
  if (!last || last.total === 0) return null;
  const round = (n: number) => Math.max(LIMITS.minTotal, Math.ceil(n / 50) * 50);
  const rate = last.claimed / last.total;
  if (rate >= 0.9) {
    const suggest = round(last.claimed * 1.25);
    const how = last.claimed >= last.total ? "ran out" : "nearly ran out";
    return { suggest, text: `${last.name} ${how} (${count(last.claimed)} of ${count(last.total)} claimed). Try ${count(suggest)}.` };
  }
  const suggest = round(last.claimed * 1.15);
  return {
    suggest,
    text: `${last.name}: ${count(last.claimed)} of ${count(last.total)} claimed. Around ${count(suggest)} should be enough.`,
  };
}

export const FINISHES: { id: Finish; label: string; note: string }[] = [
  { id: "matte", label: "Matte", note: "Clean and calm" },
  { id: "foil", label: "Foil", note: "A light that sweeps across" },
  { id: "holo", label: "Holo", note: "Rainbow shimmer · free in the pilot" },
];

export const ELIGIBILITY: { id: Eligibility; label: string; note: string }[] = [
  { id: "once_per_drop", label: "Once per drop", note: "One Tikka per WhatsApp number" },
  { id: "once_per_period", label: "Once every few days", note: "Stops the same people claiming every drop" },
  { id: "new_only", label: "New customers only", note: "People already on your list can't claim" },
];

/* ------------------------------------------------- one live, one next */

export interface PublishedWindow {
  id: string;
  status: "draft" | "scheduled" | "live" | "sold_out" | "ended";
  startsAt: string;
  endsAt: string;
}

/**
 * One live drop at a time, plus at most one scheduled next drop (PRD B5). Returns a plain reason
 * when the new drop doesn't fit, or null. `startsAt` is the new drop's start (now for "start now").
 */
export function publishWindowProblem(existing: PublishedWindow[], candidate: { id?: string; startsAt: string }, now: Date): string | null {
  const others = existing.filter((d) => d.id !== candidate.id);
  const running = others.filter((d) => d.status === "live" || d.status === "sold_out");
  const scheduled = others.filter((d) => d.status === "scheduled");
  const startsNow = new Date(candidate.startsAt) <= now;
  const live = running[0];
  if (scheduled.length > 0) {
    return live
      ? `You already have a live drop and one scheduled for ${shortDate(scheduled[0].startsAt)}. Save this as a draft and publish it once that one opens.`
      : `You already have a drop scheduled for ${shortDate(scheduled[0].startsAt)}. Publish this one after that drop starts.`;
  }
  if (startsNow && live) {
    return `You already have a live drop until ${shortDate(live.endsAt)}. Schedule this one to start after it ends, or end the live one first.`;
  }
  if (live && new Date(candidate.startsAt) < new Date(live.endsAt)) {
    return `Your live drop runs until ${shortDate(live.endsAt)}. Start this one on or after that day.`;
  }
  return null;
}
