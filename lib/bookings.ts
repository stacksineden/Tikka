// Bookings with free times (docs/BOOKINGS.md). Pure, so the booking sheet, the owner's screens,
// the demo store and the tests all work out free times the same way. The database checks again
// when someone books (private.booking_problem in supabase/migrations/20261120100000_bookings.sql).

import { bookingDays, DEFAULT_HOURS, slotLabel, type BookingDay } from "./booking";
import type { OpeningHours } from "./types";

const WAT_OFFSET_MS = 60 * 60 * 1000;
const MIN = 60 * 1000;
export const GRID = 30;
/** A service with no length set counts as one hour. */
export const DEFAULT_MINUTES = 60;
export const LENGTHS = [15, 30, 45, 60, 75, 90, 105, 120, 150, 180, 210, 240, 300, 360, 420, 480] as const;
export const MAX_UPCOMING = 3;

export interface BookingRules {
  capacity: number;
  noticeMinutes: number;
  aheadDays: number;
  hours?: OpeningHours | null;
  /** [start, end) ISO times of bookings that aren't cancelled. */
  busy: [string, string][];
  /** [start, end) ISO times the owner blocked. */
  blocked: [string, string][];
}

export const DEFAULT_RULES: Omit<BookingRules, "busy" | "blocked"> = { capacity: 1, noticeMinutes: 120, aheadDays: 92 };

export type BookingStatus = "held" | "booked" | "arrived" | "no_show" | "cancelled";
export type BookingSource = "page" | "owner" | "tikka";

export interface Booking {
  id: string;
  service: string;
  serviceId?: string;
  minutes: number;
  startsAt: string;
  endsAt: string;
  firstName: string;
  /** Owners only; never for staff (rule 4). */
  phone?: string;
  source: BookingSource;
  status: BookingStatus;
  code: string;
  claimId?: string;
  leadId?: string;
  /** The customer's pass link; owners only. */
  viewToken?: string;
  moved: boolean;
  createdAt: string;
  /** Deposits (REVENUE_PLAN 5.4): what was paid, and the price when booked (what's left to collect). */
  depositPaidKobo?: number;
  /** When the deposit was paid, and how: unset is online through Tikka; cash, transfer or card the owner took themself; a pay link paid for the Tikka it was booked with. */
  depositPaidAt?: string;
  depositMethod?: DepositMethod;
  priceKobo?: number;
  priceKind?: "fixed" | "from" | "ask";
  depositCounts?: boolean;
  /** NEW DIRECTION (demo only for now): a home visit, and the area the owner goes to. */
  homeArea?: string;
  /** NEW DIRECTION (demo only for now): the option and extras picked ("Long, add wash"). */
  detail?: string;
  /** Booked from Tikka's listing page; `foundNew` (owners only): the number was new to the business. */
  foundVia?: "search";
  foundNew?: boolean;
}

export type DepositMethod = "cash" | "transfer" | "card" | "pay_link";

export interface BookingBlock {
  id: string;
  startsAt: string;
  endsAt: string;
  note?: string;
}

export type DepositMode = "off" | "percent" | "fixed";
export type ServiceDepositMode = "none" | "fixed" | "full";

export interface DepositSettings {
  mode: DepositMode;
  percent?: number;
  fixedKobo?: number;
  counts: boolean;
}

export interface BookingSetup {
  setUp: boolean;
  deposit?: DepositSettings;
  serviceDeposits?: Record<string, { mode: ServiceDepositMode; kobo?: number }>;
  enabled: boolean;
  capacity: number;
  noticeMinutes: number;
  aheadDays: number;
  blocks: BookingBlock[];
}

/** Why a time couldn't be booked, in the words the customer or owner sees. */
export const PROBLEM_TEXT: Record<string, string> = {
  off: "Bookings aren't open right now.",
  taken: "Someone just took that time. Pick another one.",
  closed: "That time isn't open. Pick another one.",
  too_soon: "That's too soon. Pick a later time.",
  too_far: "That's too far ahead. Pick an earlier day.",
  too_many: "You already have 3 bookings coming up here. Message the business to add more.",
  bad_name: "Type your first name.",
  bad_phone: "Type your WhatsApp number, like 0803 123 4567.",
  not_found: "That booking isn't there any more.",
  not_booked: "That booking was already changed.",
  too_early: "Not yet: wait until it's time.",
  cancelled: "That booking was cancelled.",
  bad_time: "Pick an end after the start.",
};

/** "2026-11-15" + 840 (2:00pm WAT) → the instant, as ms. */
export function watInstant(dayKey: string, minute: number): number {
  const [y, m, d] = dayKey.split("-").map(Number);
  return Date.UTC(y, m - 1, d) + minute * MIN - WAT_OFFSET_MS;
}

/** The WAT day key ("2026-11-15") and minute of day of an instant. */
export function watParts(iso: string | Date): { day: string; minute: number } {
  const w = new Date(new Date(iso).getTime() + WAT_OFFSET_MS);
  return { day: w.toISOString().slice(0, 10), minute: w.getUTCHours() * 60 + w.getUTCMinutes() };
}

function hhmm(s: string | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s ?? "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Opening and closing minute on a weekday (0 = Sunday), or null when closed. */
export function openRange(hours: OpeningHours | null | undefined, weekday: number): [number, number] | null {
  const h = hours ?? DEFAULT_HOURS;
  const d = weekday === 0 ? h.sunday : weekday === 6 ? h.saturday : h.weekdays;
  if (!d?.open) return null;
  const f = hhmm(d.from);
  const t = hhmm(d.to);
  return f !== null && t !== null && t > f ? [f, t] : null;
}

type Span = [number, number];

function spans(list: [string, string][]): Span[] {
  return list.map(([a, b]) => [new Date(a).getTime(), new Date(b).getTime()]);
}

/** Full when anything blocked overlaps, or the busiest moment inside already has `capacity` bookings. */
export function isFull(start: number, end: number, busy: Span[], blocked: Span[], capacity: number): boolean {
  if (blocked.some(([a, b]) => a < end && b > start)) return true;
  const points = [start, ...busy.filter(([a]) => a > start && a < end).map(([a]) => a)];
  let peak = 0;
  for (const t of points) peak = Math.max(peak, busy.filter(([a, b]) => a <= t && b > t).length);
  return peak >= capacity;
}

/**
 * The days a customer can book a service of `minutes`, each with its free start times (minutes
 * after midnight, WAT): within opening hours, ending by closing, on the half hour, at least the
 * notice from now, within the reach, and not full. `until` (a day key) stops earlier, e.g. a
 * Tikka's use-by date.
 */
export function freeDays(rules: BookingRules, minutes: number, now: Date, until?: string, after = 0): BookingDay[] {
  const busy = spans(rules.busy);
  const blocked = spans(rules.blocked);
  const earliest = now.getTime() + rules.noticeMinutes * MIN;
  const latest = now.getTime() + rules.aheadDays * 24 * 60 * MIN;
  const days = bookingDays(now, rules.hours, rules.aheadDays + 1).filter((d) => !until || d.key <= until);
  return days.map((d) => {
    const range = openRange(rules.hours, d.weekday);
    const slots: number[] = [];
    if (range) {
      for (let t = Math.ceil(range[0] / GRID) * GRID; t + minutes <= range[1]; t += GRID) {
        const at = watInstant(d.key, t);
        if (at < earliest || at > latest) continue;
        // The booking must end by closing; its gap after may run past it, but not into another booking.
        if (!isFull(at, at + (minutes + after) * MIN, busy, blocked, rules.capacity)) slots.push(t);
      }
    }
    return { ...d, slots };
  });
}

/** Gap time (NEW DIRECTION): the choices for minutes kept free after a booking. */
export const GAP_CHOICES = [0, 10, 15, 30, 45, 60] as const;
export const MAX_GAP = 180;

/**
 * Minutes kept free after a booking: the service's own gap, else the business's, plus the extra
 * for a home visit (travel). Used only to work out free times; the booking itself keeps its length.
 */
export function gapAfter(biz: { gapMinutes?: number; homeGapMinutes?: number }, service?: { gapMinutes?: number } | null, home = false): number {
  const base = service?.gapMinutes ?? biz.gapMinutes ?? 0;
  return Math.max(0, Math.min(MAX_GAP, Math.round(base + (home ? (biz.homeGapMinutes ?? 0) : 0))));
}

/** "30 min", "1 hr", "1 hr 15 min": for gap lines. */
export function gapLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h} hr${m ? ` ${m} min` : ""}`;
}

/** The first day from `fromKey` on that has a free time. */
export function nextFree(days: BookingDay[], fromKey: string): BookingDay | undefined {
  return days.find((d) => d.key > fromKey && d.slots.length > 0);
}

/** 60 → "1 hr", 90 → "1½ hrs", 45 → "45 min". */
export function lengthLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 30) return `${h}½ hrs`;
  if (rest) return `${h} hr ${rest} min`;
  return `${h} ${h === 1 ? "hr" : "hrs"}`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Sat 15 Nov" in WAT. */
export function dayLabel(iso: string | Date): string {
  const w = new Date(new Date(iso).getTime() + WAT_OFFSET_MS);
  return `${WEEKDAYS[w.getUTCDay()]} ${w.getUTCDate()} ${MONTHS[w.getUTCMonth()]}`;
}

/** "2:00pm" in WAT. */
export function timeLabel(iso: string | Date): string {
  return slotLabel(watParts(iso).minute);
}

/** "Sat 15 Nov, 2:00pm" */
export function whenLabel(iso: string | Date): string {
  return `${dayLabel(iso)}, ${timeLabel(iso)}`;
}

/** The customer's message from their pass: "Hi Glow Studio, I've booked Braids for Sat 15 Nov, 2:00pm. Ref BK-7X4QPA." */
export function bookedMessage(business: string, b: Pick<Booking, "service" | "startsAt" | "code">): string {
  return `Hi ${business}, I've booked ${b.service} for ${whenLabel(b.startsAt)}. Ref ${b.code}.`;
}

/** The owner's message after moving a booking. */
export function movedMessage(business: string, b: Pick<Booking, "firstName" | "service" | "startsAt" | "code">): string {
  return `Hi ${b.firstName}, your ${b.service} at ${business} is now ${whenLabel(b.startsAt)}. Ref ${b.code}.`;
}

/** The owner's message after cancelling a booking. */
export function cancelledMessage(business: string, b: Pick<Booking, "firstName" | "service" | "startsAt">): string {
  return `Hi ${b.firstName}, sorry, ${business} has to cancel your ${b.service} on ${whenLabel(b.startsAt)}. Can we find you another time?`;
}

/** The owner's message to someone who just booked. */
export function hiMessage(business: string, b: Pick<Booking, "firstName" | "service" | "startsAt">): string {
  return `Hi ${b.firstName}, this is ${business}. Thanks for booking ${b.service} on ${whenLabel(b.startsAt)}. See you then!`;
}

/** Bookings grouped by WAT day, in time order. */
export function byDay(list: Booking[]): { day: string; label: string; items: Booking[] }[] {
  const out: { day: string; label: string; items: Booking[] }[] = [];
  for (const b of [...list].sort((x, y) => x.startsAt.localeCompare(y.startsAt))) {
    const day = watParts(b.startsAt).day;
    let g = out.at(-1);
    if (!g || g.day !== day) {
      g = { day, label: dayLabel(b.startsAt), items: [] };
      out.push(g);
    }
    g.items.push(b);
  }
  return out;
}

/** Booked and the time has ended: "Did they come?". */
export function needsMarking(b: Booking, now: Date): boolean {
  return b.status === "booked" && new Date(b.endsAt).getTime() <= now.getTime();
}

/** Staff may mark Arrived from an hour before the time, No-show once it has started. */
export function canMark(b: Booking, status: "arrived" | "no_show", now: Date): boolean {
  if (b.status === "cancelled") return false;
  const start = new Date(b.startsAt).getTime();
  return status === "arrived" ? start <= now.getTime() + 60 * MIN : start <= now.getTime();
}

/** The WAT day key for today. */
export function todayKey(now: Date): string {
  return watParts(now).day;
}

/**
 * What's left to pay at the shop after a deposit: the price less the deposit when it counts towards
 * the bill and the price is set; null when the price isn't set ("the rest agreed with them").
 */
export function leftToPay(b: { priceKobo?: number | null; priceKind?: string | null; depositCounts?: boolean | null }, depositKobo: number): number | null {
  if (b.priceKind !== "fixed" || b.priceKobo == null) return null;
  return b.depositCounts === false ? b.priceKobo : Math.max(0, b.priceKobo - depositKobo);
}

const LONG_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** The pass's date block, in WAT: "Friday", 20, "Nov", "2:30pm". */
export function dateBlock(iso: string | Date): { weekday: string; day: number; month: string; time: string } {
  const w = new Date(new Date(iso).getTime() + WAT_OFFSET_MS);
  return { weekday: LONG_DAYS[w.getUTCDay()], day: w.getUTCDate(), month: MONTHS[w.getUTCMonth()], time: timeLabel(iso) };
}
