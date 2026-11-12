// After the reveal (PRD A1, TECH_PLAN §6, §5): when a Tikka expires, which days a visit can be
// planned for, and the one expiry reminder. Pure, all in West Africa Time (UTC+1, no DST).

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const WAT_OFFSET = HOUR;

export type VisitPart = "morning" | "afternoon" | "evening";
export const VISIT_PARTS: { id: VisitPart; label: string }[] = [
  { id: "morning", label: "Morning" },
  { id: "afternoon", label: "Afternoon" },
  { id: "evening", label: "Evening" },
];

const WEEKDAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-21": the WAT calendar day of an instant. */
export function watDate(at: Date): string {
  return new Date(at.getTime() + WAT_OFFSET).toISOString().slice(0, 10);
}

/** A WAT day at a WAT hour, as an instant. */
export function watAt(date: string, hour: number, minute = 0): Date {
  return new Date(`${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+01:00`);
}

function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
}

/** 1 = Monday … 7 = Sunday. */
export function weekdayOf(date: string): number {
  const d = new Date(`${date}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

/**
 * claims.expires_at: the end of the WAT day `validityDays` after it's claimed, even past the
 * drop's end (a claim on the last day gets its full time).
 */
export function claimExpiry(claimedAt: Date, validityDays: number): string {
  return watAt(addDays(watDate(claimedAt), validityDays), 23, 59).toISOString();
}

/** Quiet-day drops: is a code usable on this day? Null days means any day. */
export function validOn(validWeekdays: number[] | null | undefined, at: Date): boolean {
  return !validWeekdays?.length || validWeekdays.includes(weekdayOf(watDate(at)));
}

/**
 * "When will you come in?": today through the expiry day, only the drop's valid weekdays,
 * at most `max` days. Labels read "Today", "Tomorrow", "Sat 24 Oct".
 */
export function visitOptions(now: Date, expiresAt: string, validWeekdays: number[] | null | undefined, max = 8): { date: string; label: string }[] {
  const today = watDate(now);
  const last = watDate(new Date(expiresAt));
  const out: { date: string; label: string }[] = [];
  for (let d = today; d <= last && out.length < max; d = addDays(d, 1)) {
    if (validWeekdays?.length && !validWeekdays.includes(weekdayOf(d))) continue;
    out.push({ date: d, label: dayLabel(d, today) });
  }
  return out;
}

export function dayLabel(date: string, today: string): string {
  if (date === today) return "Today";
  if (date === addDays(today, 1)) return "Tomorrow";
  return dayName(date);
}

/** "Sat 24 Oct". */
export function dayName(date: string): string {
  const [, m, day] = date.split("-").map(Number);
  return `${WEEKDAY[weekdayOf(date) - 1]} ${day} ${MONTH[m - 1]}`;
}

export function isPlannable(now: Date, expiresAt: string, validWeekdays: number[] | null | undefined, date: string): boolean {
  return visitOptions(now, expiresAt, validWeekdays, 400).some((o) => o.date === date);
}

/**
 * The one expiry reminder: 8:00 on the planned visit day, or 10:00 three days before it
 * expires, whichever is earlier. Times already past when it was claimed don't count.
 */
export function reminderAt(c: { claimedAt: string; expiresAt: string; plannedVisitDate?: string }): string | null {
  const claimed = new Date(c.claimedAt).getTime();
  const options = [watAt(addDays(watDate(new Date(c.expiresAt)), -3), 10)];
  if (c.plannedVisitDate) options.push(watAt(c.plannedVisitDate, 8));
  const next = options.filter((d) => d.getTime() > claimed && d.getTime() < new Date(c.expiresAt).getTime()).sort((a, b) => a.getTime() - b.getTime())[0];
  return next ? next.toISOString() : null;
}

/** Send it now? Once per Tikka; not if it's used, expired, or the person sent STOP. */
export function reminderDue(
  c: { claimedAt: string; expiresAt: string; plannedVisitDate?: string; redeemedAt?: string; reminderSentAt?: string; optedOut?: boolean },
  now: Date,
): boolean {
  if (c.redeemedAt || c.reminderSentAt || c.optedOut) return false;
  if (new Date(c.expiresAt) <= now) return false;
  const at = reminderAt(c);
  return !!at && new Date(at) <= now;
}

/** "Your 20% off any service at Glow Studio ends Sun 15 Dec. Show this at the counter: …" */
export function reminderText(reward: string, businessName: string, expiresAt: string, link: string): string {
  const date = watDate(new Date(expiresAt));
  return `Your ${reward.charAt(0).toLowerCase()}${reward.slice(1)} at ${businessName} ends ${dayName(date)}. Show this at the counter: ${link}`;
}

/** The reminder on the planned day: "this afternoon", or "today" when no time was picked. */
export function visitDayWords(part: string | undefined): string {
  return part && VISIT_PARTS.some((p) => p.id === part) ? `this ${part}` : "today";
}

/** "See you this afternoon at Glow Studio! Your 20% off any service is ready and ends Sun 15 Dec. Show this at the counter: …" */
export function visitReminderText(part: string | undefined, reward: string, businessName: string, expiresAt: string, link: string): string {
  return `See you ${visitDayWords(part)} at ${businessName}! Your ${reward.charAt(0).toLowerCase()}${reward.slice(1)} is ready and ends ${dayName(watDate(new Date(expiresAt)))}. Show this at the counter: ${link}`;
}

/** "Valid Mon–Thu only". */
export function validDaysLabel(validWeekdays: number[]): string {
  const s = [...validWeekdays].sort((a, b) => a - b);
  const run = s.every((d, i) => i === 0 || d === s[i - 1] + 1);
  const days = run && s.length > 2 ? `${WEEKDAY[s[0] - 1]}–${WEEKDAY[s.at(-1)! - 1]}` : s.map((d) => WEEKDAY[d - 1]).join(", ");
  return `Valid ${days} only`;
}
