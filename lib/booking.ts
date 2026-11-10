// The booking sheet on the business page (PRD A5, "Booking a time"): the days and times a
// customer can ask for, worked out from the opening hours, and the WhatsApp message it writes.
// A request, not a reservation: nothing here is stored. Pure, so it runs in the browser and tests.

import type { DayHours, OpeningHours } from "./types";

/** West Africa Time is UTC+1 all year (no daylight saving). */
const WAT_OFFSET_MS = 60 * 60 * 1000;
const STEP = 30;
/** Today, a slot must start at least this long from now. */
const LEAD = 30;
/** How far ahead a customer can ask: about three months (makeup artists get booked well ahead). */
export const BOOKING_DAYS = 92;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** With no opening hours set: 9am–6pm, Monday to Saturday. */
export const DEFAULT_HOURS: OpeningHours = {
  weekdays: { open: true, from: "09:00", to: "18:00" },
  saturday: { open: true, from: "09:00", to: "18:00" },
  sunday: { open: false, from: "09:00", to: "18:00" },
};

export interface BookingDay {
  /** "2026-11-15", in WAT. */
  key: string;
  /** "Today" or "Sat". */
  short: string;
  /** 15 */
  date: number;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
  /** "2026-11", for grouping into months. */
  month: string;
  /** "Sat 15 Nov", for the message. */
  label: string;
  /** Minutes after midnight (WAT) a slot can start; empty when closed or none left today. */
  slots: number[];
}

function minutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function hoursFor(h: OpeningHours, weekday: number): DayHours {
  return weekday === 0 ? h.sunday : weekday === 6 ? h.saturday : h.weekdays;
}

/** Slot starts for one day: every 30 minutes from opening, the last one 30 minutes before closing. */
export function daySlots(d: DayHours, notBefore = 0): number[] {
  if (!d.open) return [];
  const from = minutes(d.from);
  const to = minutes(d.to);
  if (from === null || to === null || to <= from) return [];
  const out: number[] = [];
  for (let t = from; t + STEP <= to; t += STEP) if (t >= notBefore) out.push(t);
  return out;
}

/** The next BOOKING_DAYS days in WAT, starting today, with the times that can be asked for on each. */
export function bookingDays(now: Date, hours?: OpeningHours | null, count = BOOKING_DAYS): BookingDay[] {
  const h = hours ?? DEFAULT_HOURS;
  const wat = new Date(now.getTime() + WAT_OFFSET_MS);
  const nowMin = wat.getUTCHours() * 60 + wat.getUTCMinutes();
  const days: BookingDay[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(wat.getUTCFullYear(), wat.getUTCMonth(), wat.getUTCDate() + i));
    const wd = d.getUTCDay();
    days.push({
      key: d.toISOString().slice(0, 10),
      short: i === 0 ? "Today" : WEEKDAYS[wd],
      date: d.getUTCDate(),
      weekday: wd,
      month: d.toISOString().slice(0, 7),
      label: `${WEEKDAYS[wd]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`,
      slots: daySlots(hoursFor(h, wd), i === 0 ? nowMin + LEAD : 0),
    });
  }
  return days;
}

export interface BookingMonth {
  /** "2026-11" */
  key: string;
  /** "November 2026" */
  label: string;
  /** Empty cells before the first listed day, for a Sunday-first calendar grid. */
  lead: number;
  days: BookingDay[];
}

/** The days grouped into calendar months (the first month starts at today, the rest at the 1st). */
export function bookingMonths(days: BookingDay[]): BookingMonth[] {
  const out: BookingMonth[] = [];
  for (const d of days) {
    let m = out.at(-1);
    if (!m || m.key !== d.month) {
      const [y, mo] = d.month.split("-").map(Number);
      m = { key: d.month, label: `${MONTH_NAMES[mo - 1]} ${y}`, lead: d.weekday, days: [] };
      out.push(m);
    }
    m.days.push(d);
  }
  return out;
}

/** 840 → "2:00pm" */
export function slotLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h % 12 || 12}:${String(m).padStart(2, "0")}${h < 12 ? "am" : "pm"}`;
}

/**
 * "Hi Glow Studio, I'd like to book Signature facial (₦25,000) on Sat 15 Nov at 2:00pm. If
 * that's taken, I can also do 4:00pm. Is it free?"
 * `what` is the service with its price ("Signature facial (₦25,000)"), or empty for a general booking.
 */
export function bookingMessage(business: string, what: string, day: string, first: number, second?: number | null): string {
  const thing = what.trim() || "an appointment";
  const also = second != null ? ` If that's taken, I can also do ${slotLabel(second)}.` : "";
  return `Hi ${business}, I'd like to book ${thing} on ${day} at ${slotLabel(first)}.${also} Is it free?`;
}

/** wa.me link with the message filled in. `number` is E.164 ("+2348012345678"). */
export function whatsappLink(number: string, text: string): string {
  return `https://wa.me/${number.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}
