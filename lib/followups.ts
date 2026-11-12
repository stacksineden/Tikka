// "Message today" (PRD B8, TECH_PLAN §10 get_followups): who to message on WhatsApp today, and
// a prewritten message for each. Pure; owners only (the caller checks, rule 4).

import { dayLabel, dayName, VISIT_PARTS, watDate, type VisitPart } from "./visit";

export type FollowupKind = "today" | "ending" | "just_claimed" | "missed";

export const FOLLOWUP_LABEL: Record<FollowupKind, string> = {
  today: "Planning to come today",
  ending: "Ending soon, not used yet",
  just_claimed: "Just claimed",
  missed: "Expired, never came",
};

export interface FollowupLead {
  id: string;
  name: string;
  phone: string;
  reward: string;
  claimedAt: string;
  expiresAt: string;
  redeemed: boolean;
  plannedVisitDate?: string;
  lastFollowupAt?: string;
}

export interface Followup {
  kind: FollowupKind;
  lead: FollowupLead;
  message: string;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** "Expired, never came" stays on the list this long, then drops off. */
export const MISSED_FOR_DAYS = 7;

const first = (name: string) => name.trim().split(/\s+/)[0] || name;
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Which bucket a lead falls in today, if any. Most urgent first: today, ending, just claimed, missed. */
export function followupKind(l: FollowupLead, now: Date): FollowupKind | null {
  if (l.redeemed) return null;
  const t = now.getTime();
  const expires = new Date(l.expiresAt).getTime();
  if (expires > t && l.plannedVisitDate === watDate(now)) return "today";
  // "Ending in 2 days": by calendar day, so a Tikka ending Thursday night shows on Tuesday.
  if (expires > t && watDate(new Date(l.expiresAt)) <= watDate(new Date(t + 2 * DAY))) return "ending";
  if (t - new Date(l.claimedAt).getTime() <= DAY) return "just_claimed";
  if (expires <= t && t - expires <= MISSED_FOR_DAYS * DAY) return "missed";
  return null;
}

export function followupMessage(kind: FollowupKind, l: Pick<FollowupLead, "name" | "reward" | "expiresAt">, businessName: string, now: Date): string {
  const name = first(l.name);
  const reward = lower(l.reward);
  switch (kind) {
    case "just_claimed":
      return `Hi ${name}, welcome! Your ${reward} at ${businessName} is ready. Want to book a slot this week?`;
    case "today":
      return `Hi ${name}, see you today! Your ${reward} is ready at the counter.`;
    case "ending": {
      const end = watDate(new Date(l.expiresAt));
      const when = dayLabel(end, watDate(now));
      const day = when === "Today" ? "today" : when === "Tomorrow" ? "tomorrow" : WEEKDAY_FULL[dayName(end).slice(0, 3)];
      return `Hi ${name}, your ${reward} ends ${day}. Shall we book you in?`;
    }
    case "missed":
      return `Hi ${name}, we missed you! Our next drop is coming soon.`;
  }
}

const WEEKDAY_FULL: Record<string, string> = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };

/**
 * Today's list. Someone the owner already messaged in the last day is left off, so the list
 * shrinks as they work through it.
 */
export function followups(leads: FollowupLead[], businessName: string, now: Date): Followup[] {
  const order: FollowupKind[] = ["today", "ending", "just_claimed", "missed"];
  return leads
    .filter((l) => !l.lastFollowupAt || now.getTime() - new Date(l.lastFollowupAt).getTime() > DAY)
    .map((lead) => ({ lead, kind: followupKind(lead, now) }))
    .filter((x): x is { lead: FollowupLead; kind: FollowupKind } => x.kind !== null)
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || b.lead.claimedAt.localeCompare(a.lead.claimedAt))
    .map(({ lead, kind }) => ({ kind, lead, message: followupMessage(kind, lead, businessName, now) }));
}

/** "this afternoon" / "tomorrow evening" / "Sat morning": when they said they'd come. */
export function visitWhen(date: string, part: string | undefined, now: Date): string {
  const when = dayLabel(date, watDate(now));
  if (when === "Today") return part ? `this ${part}` : "today";
  const day = when === "Tomorrow" ? "tomorrow" : when.slice(0, 3);
  return `${day}${part ? ` ${part}` : ""}`;
}

/** "Plans to come this afternoon" / "Plans to come tomorrow evening" / "Plans to come Sat morning". */
export function visitPlanLabel(date: string | undefined, part: string | undefined, now: Date): string | null {
  return date ? `Plans to come ${visitWhen(date, part, now)}` : null;
}

export interface ComingInLead {
  id: string;
  name: string;
  reward: string;
  status: "claimed" | "redeemed";
  expiresAt?: string;
  plannedVisitDate?: string;
  plannedVisitPart?: VisitPart;
}

export interface ComingInDay {
  date: string;
  /** "Today", "Tomorrow", "Sat 24 Oct". */
  label: string;
  count: number;
  /** Morning, afternoon, evening, then anyone who didn't pick a time; empty parts left out. */
  parts: { part: VisitPart | null; leads: ComingInLead[] }[];
}

/**
 * "Coming in": everyone who said when they'd come, from today for `days` days, by day and time
 * of day. Used or expired Tikkas and past days are left out.
 */
export function comingIn(leads: ComingInLead[], now: Date, days = 7): ComingInDay[] {
  const today = watDate(now);
  const last = watDate(new Date(now.getTime() + (days - 1) * DAY));
  const open = leads.filter(
    (l) =>
      l.status === "claimed" &&
      l.plannedVisitDate &&
      l.plannedVisitDate >= today &&
      l.plannedVisitDate <= last &&
      (!l.expiresAt || new Date(l.expiresAt).getTime() > now.getTime()),
  );
  const dates = [...new Set(open.map((l) => l.plannedVisitDate!))].sort();
  const order: (VisitPart | null)[] = [...VISIT_PARTS.map((p) => p.id), null];
  return dates.map((date) => {
    const mine = open.filter((l) => l.plannedVisitDate === date);
    return {
      date,
      label: dayLabel(date, today),
      count: mine.length,
      parts: order
        .map((part) => ({ part, leads: mine.filter((l) => (l.plannedVisitPart ?? null) === part).sort((a, b) => a.name.localeCompare(b.name)) }))
        .filter((g) => g.leads.length > 0),
    };
  });
}
