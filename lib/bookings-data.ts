import "server-only";

import { randomBytes } from "node:crypto";
import { connection } from "next/server";
import {
  DEFAULT_MINUTES,
  DEFAULT_RULES,
  GRID,
  isFull,
  MAX_UPCOMING,
  openRange,
  watParts,
  type Booking,
  type BookingBlock,
  type BookingRules,
  type BookingSetup,
  gapAfter,
  watInstant,
} from "./bookings";
import { depositOn } from "./presets";
import { getLedger } from "./ledger-data";
import { priceBooking, type BookingChoice } from "./booking-price";
import {
  dbAddBooking,
  dbRecordBookingDeposit,
  dbBlockTime,
  dbBookingPass,
  dbBookingRules,
  dbBookings,
  dbBookingSetup,
  dbBookTime,
  dbCancelBooking,
  dbMarkBooking,
  dbMoveBooking,
  dbRemoveBlock,
  dbSaveBookingSettings,
  dbBookingLeads,
  dbBookingDeposits,
  dbTikkaInfo,
  dbBookForClaim,
  dbCheckBookingCode,
  type BookingPass,
  type BookResult,
  dbChangeFromPass,
  dbPassBooking,
  dbJoinWaitlist,
  dbGetWaitlist,
  dbRemoveWaitlist,
} from "./bookings-db";
import { demoTikkaForBooking, getBusiness, getBusinessBySlug, isDbId, memberBusinessId } from "./data";
import type { SessionUser } from "./types";
import type { Business, ServiceItem } from "./types";

// Bookings (docs/BOOKINGS.md): pages call these. Real businesses go to Supabase; the demo business
// keeps its bookings in memory with the same rules (lib/bookings.ts). Bookings use the real clock,
// in the demo too, so the times on the business page and the dashboard agree.

export type { BookingPass, BookResult };
export type Act = { kind: string; [k: string]: unknown };

/** A service's length for the calendar. Unset: one hour. */
export function serviceMinutes(s: Pick<ServiceItem, "minutes">): number {
  return s.minutes ?? DEFAULT_MINUTES;
}

/* ------------------------------------------------------------ DEMO store */

interface DemoBooking extends Booking {
  futureOffers: boolean;
}
interface DemoBook {
  setup: Omit<BookingSetup, "blocks">;
  minutes: Record<string, number | null>;
  bookings: DemoBooking[];
  blocks: BookingBlock[];
}
const demo: Map<string, DemoBook> = ((globalThis as { __tikkaBookings?: Map<string, DemoBook> }).__tikkaBookings ??= new Map());

const ALPHABET = "ACDEFGHJKMNPQRTUVWXY34679";
function demoCode(): string {
  const b = randomBytes(6);
  return "BK-" + [...b].map((x) => ALPHABET[x % 25]).join("");
}

/** "75 min" → 75, "1 hr" → 60, "1½ hrs" → 90; rounded to 15 minutes. */
function parseDuration(text?: string): number | null {
  if (!text) return null;
  const t = text.toLowerCase().replace("½", ".5");
  const h = /(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours)\b/.exec(t);
  const m = /(\d+)\s*(m|min|mins|minutes)\b/.exec(t);
  const total = (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0);
  return total >= 15 ? Math.min(600, Math.round(total / 15) * 15) : null;
}

/** The demo's own bookings: Glow Studio is set up, with two customers today and one tomorrow. */
function demoBook(ownerId: string, b: Business | null): DemoBook | null {
  let d = demo.get(ownerId);
  if (d) return d;
  if (!b) return null;
  const seeded = ownerId === "user_demo";
  d = {
    setup: { setUp: seeded, enabled: seeded, capacity: 2, noticeMinutes: 120, aheadDays: 92 },
    minutes: Object.fromEntries(b.services.filter((s) => s.id).map((s) => [s.id!, s.minutes ?? parseDuration(s.duration)])),
    bookings: [],
    blocks: [],
  };
  if (seeded && b.services.length >= 2) {
    const today = watParts(new Date()).day;
    const tomorrow = watParts(new Date(Date.now() + 86_400_000)).day;
    const at = (day: string, min: number) => new Date(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)) + (min - 60) * 60_000);
    const seed = (day: string, min: number, s: ServiceItem, first: string, phone: string, source: Booking["source"]): DemoBooking => {
      const minutes = d!.minutes[s.id!] ?? DEFAULT_MINUTES;
      const start = at(day, min);
      return {
        id: `bk_${day}_${min}`, service: s.name, serviceId: s.id, minutes, startsAt: start.toISOString(), endsAt: new Date(start.getTime() + minutes * 60_000).toISOString(),
        firstName: first, phone, source, status: "booked", code: demoCode(), viewToken: randomBytes(12).toString("hex"), moved: false,
        createdAt: new Date(Date.now() - 3 * 3_600_000).toISOString(), futureOffers: true,
      };
    };
    d.bookings.push(
      seed(today, 600, b.services[0], "Adaeze", "+2348031110001", "page"),
      seed(today, 960, b.services[1], "Tolu", "+2348031110002", "owner"),
      seed(tomorrow, 720, b.services[0], "Kemi", "+2348031110003", "page"),
    );
  }
  demo.set(ownerId, d);
  return d;
}

/** NEW DIRECTION: a booking's gap after it (clean-up, travel), from its service and whether it's a home visit. */
function bookingGap(b: Business, x: Pick<Booking, "serviceId" | "homeArea">): number {
  return gapAfter(b, b.services.find((s) => s.id === x.serviceId), !!x.homeArea);
}

/** Each booking's gap after it, by booking id (only the ones with a gap). */
export function bookingGaps(b: Business, list: Booking[]): Record<string, number> {
  return Object.fromEntries(list.map((x) => [x.id, bookingGap(b, x)]).filter(([, g]) => (g as number) > 0));
}

function busyWithGap(b: Business, x: Booking): [number, number] {
  return [new Date(x.startsAt).getTime(), new Date(x.endsAt).getTime() + bookingGap(b, x) * 60_000];
}

function demoRules(d: DemoBook, business: Business): BookingRules {
  const live = d.bookings.filter((x) => x.status !== "cancelled");
  return {
    capacity: d.setup.capacity,
    noticeMinutes: d.setup.noticeMinutes,
    aheadDays: d.setup.aheadDays,
    hours: business.hours ?? null,
    // Each booking holds its time plus the gap after it, so nobody is booked into the clean-up.
    busy: live.map((x) => busyWithGap(business, x).map((t) => new Date(t).toISOString()) as [string, string]),
    blocked: d.blocks.map((k) => [k.startsAt, k.endsAt]),
  };
}

/** The same checks as private.booking_problem(). */
function demoProblem(d: DemoBook, business: Business, start: Date, minutes: number, ignore: string | null, force: boolean, place?: { serviceId?: string; home?: boolean }): string | null {
  const hours = business.hours;
  if (!d.setup.enabled) return "off";
  if (force) return null;
  const now = Date.now();
  if (start.getTime() < now + d.setup.noticeMinutes * 60_000) return "too_soon";
  if (start.getTime() > now + d.setup.aheadDays * 86_400_000) return "too_far";
  const { day, minute } = watParts(start);
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  const range = openRange(hours, weekday);
  if (!range || start.getUTCSeconds() !== 0 || minute % GRID !== 0 || minute < range[0] || minute + minutes > range[1]) return "closed";
  const busy = d.bookings.filter((x) => x.status !== "cancelled" && x.id !== ignore).map((x) => busyWithGap(business, x));
  const blocked = d.blocks.map((k) => [new Date(k.startsAt).getTime(), new Date(k.endsAt).getTime()] as [number, number]);
  const after = place ? bookingGap(business, { serviceId: place.serviceId, homeArea: place.home ? "home" : undefined }) : 0;
  return isFull(start.getTime(), start.getTime() + (minutes + after) * 60_000, busy, blocked, d.setup.capacity) ? "taken" : null;
}

function strip(b: DemoBooking, owner: boolean): Booking {
  const rest: Booking & { futureOffers?: boolean } = { ...b };
  delete rest.futureOffers;
  return owner ? rest : { ...rest, phone: undefined, leadId: undefined, viewToken: undefined };
}

/* ------------------------------------------------------------ the public */

/** Free-time rules for a business page, or null when it doesn't take bookings. `ownerKey` is getBusinessBySlug's ownerId. */
export async function getBookingRules(ownerKey: string, business: Business): Promise<BookingRules | null> {
  await connection();
  if (isDbId(ownerKey)) return dbBookingRules(business.id, new Date(), 186);
  const d = demoBook(ownerKey, business);
  return d?.setup.enabled ? demoRules(d, business) : null;
}

/** Each service's length for the calendar (the demo keeps its own; real ones are on the service). */
export function serviceLengths(ownerKey: string, business: Business): Record<string, number> {
  const d = isDbId(ownerKey) ? null : demoBook(ownerKey, business);
  return Object.fromEntries(business.services.filter((s) => s.id).map((s) => [s.id!, d?.minutes[s.id!] ?? serviceMinutes(s)]));
}

/** Each service's deposit for the booking sheet and the business page (the demo takes none). */
export async function getBookingDeposits(ownerKey: string, business: Business, mode: "test" | "live" | null): Promise<{ counts: boolean; services: Record<string, number> }> {
  if (!isDbId(ownerKey)) {
    // NEW DIRECTION (demo only): the deposit picked at setup, on each service's lowest price.
    const dep = business.trades?.length ? demoBook(ownerKey, business)?.setup.deposit : undefined;
    if (!dep || dep.mode === "off") return { counts: true, services: {} };
    const services = Object.fromEntries(
      business.services.filter((s) => s.id).map((s) => [s.id!, priceBooking({ ...s, extras: undefined }, {}, 0, dep).depositNaira * 100]),
    );
    return { counts: dep.counts, services };
  }
  return dbBookingDeposits(business.id, mode);
}

/** A customer books from the business page (the route has rate-limited and checked the number). */
export async function bookTime(
  slug: string,
  input: { serviceId: string; startsAt: string; firstName: string; phone: string; futureOffers: boolean; visitorId: string; mode: "test" | "live" | null; email: string | null },
): Promise<BookResult> {
  const found = await getBusinessBySlug(slug);
  if (!found) return { kind: "not_found" };
  const { business, ownerId } = found;
  if (isDbId(ownerId)) return dbBookTime({ businessId: business.id, ...input });
  const d = demoBook(ownerId, business);
  const svc = business.services.find((s) => s.id === input.serviceId);
  if (!d || !svc) return { kind: "not_found" };
  const minutes = d.minutes[svc.id!] ?? DEFAULT_MINUTES;
  const start = new Date(input.startsAt);
  const problem = demoProblem(d, business, start, minutes, null, false, { serviceId: svc.id });
  if (problem) return { kind: problem };
  if (d.bookings.filter((x) => x.phone === input.phone && x.status === "booked" && new Date(x.startsAt).getTime() > Date.now()).length >= MAX_UPCOMING) return { kind: "too_many" };
  const b: DemoBooking = {
    id: `bk_${randomBytes(6).toString("hex")}`, service: svc.name, serviceId: svc.id, minutes, startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + minutes * 60_000).toISOString(), firstName: input.firstName, phone: input.phone, source: "page",
    status: "booked", code: demoCode(), viewToken: randomBytes(12).toString("hex"), moved: false, createdAt: new Date().toISOString(),
    futureOffers: input.futureOffers,
  };
  d.bookings.push(b);
  return { kind: "booked", token: b.viewToken!, code: b.code, id: b.id };
}

/** The customer's pass. Never the phone number. */
export async function getBookingPass(token: string): Promise<(BookingPass & { business: Business }) | null> {
  await connection();
  for (const [ownerKey, d] of demo) {
    const b = d.bookings.find((x) => x.viewToken === token);
    if (!b) continue;
    const owner = await getBusiness({ id: ownerKey });
    if (!owner) return null;
    return {
      code: b.code, service: b.service, minutes: b.minutes, startsAt: b.startsAt, status: b.status, firstName: b.firstName,
      moved: b.moved, businessSlug: owner.slug, businessId: owner.id, business: owner,
      // NEW DIRECTION (demo only): the price, deposit and home visit from the new booking sheet.
      priceKobo: b.priceKobo, priceKind: b.priceKind, depositPaidKobo: b.depositPaidKobo, depositCounts: b.depositCounts, homeArea: b.homeArea, detail: b.detail,
      tikka: b.claimId && demoTikkaForBooking(b.claimId) ? { token: b.claimId, reward: demoTikkaForBooking(b.claimId)!.reward, used: demoTikkaForBooking(b.claimId)!.redeemed } : undefined,
    };
  }
  const pass = await dbBookingPass(token);
  if (!pass) return null;
  const found = await getBusinessBySlug(pass.businessSlug);
  return found ? { ...pass, business: found.business } : null;
}

/* ------------------------------------------------------------ the business */

async function who(user: Pick<SessionUser, "id" | "role" | "businessOwnerId">): Promise<{ key: string; owner: boolean; business: Business } | null> {
  await connection(); // bookings read the clock
  const key = await memberBusinessId(user);
  if (!key) return null;
  const business = await getBusiness(user);
  return business ? { key, owner: user.role === "owner", business } : null;
}

/** Bookings between two instants. Owners see numbers; staff never do (rule 4). */
export async function getBookings(user: Pick<SessionUser, "id" | "role" | "businessOwnerId">, from: Date, to: Date): Promise<Booking[]> {
  const w = await who(user);
  if (!w) return [];
  if (isDbId(w.key)) return dbBookings(w.key, from, to);
  const d = demoBook(w.key, w.business);
  if (!d) return [];
  return d.bookings
    .filter((x) => new Date(x.startsAt) < to && new Date(x.endsAt) > from)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .map((x) => strip(x, w.owner));
}

/** The settings, blocked times and each service's length. */
export async function getBookingSetup(user: Pick<SessionUser, "id" | "role" | "businessOwnerId">): Promise<(BookingSetup & { minutes: Record<string, number | null> }) | null> {
  const w = await who(user);
  if (!w) return null;
  if (isDbId(w.key)) {
    // Before the bookings migration is live, Home and Redeem simply show no bookings.
    const s = await dbBookingSetup(w.key).catch(() => null);
    if (!s) return null;
    return { ...s, minutes: Object.fromEntries(w.business.services.filter((x) => x.id).map((x) => [x.id!, x.minutes ?? null])) };
  }
  const d = demoBook(w.key, w.business);
  if (!d) return null;
  return { ...d.setup, blocks: d.blocks.filter((k) => new Date(k.endsAt).getTime() > Date.now() - 86_400_000), minutes: d.minutes };
}

export async function saveBookingSettings(
  user: Pick<SessionUser, "id" | "role" | "businessOwnerId">,
  s: { enabled: boolean; capacity: number; noticeMinutes: number; aheadDays: number; minutes: Record<string, number | null> },
): Promise<void> {
  if (user.role !== "owner") throw new Error("Only the owner sets up bookings.");
  const w = await who(user);
  if (!w) throw new Error("Set up your card first.");
  if (isDbId(w.key)) return dbSaveBookingSettings(w.key, s);
  const d = demoBook(w.key, w.business)!;
  d.setup = { ...d.setup, setUp: true, enabled: s.enabled, capacity: s.capacity, noticeMinutes: s.noticeMinutes, aheadDays: s.aheadDays };
  d.minutes = { ...d.minutes, ...s.minutes };
}

/**
 * NEW DIRECTION, stage 3 (demo only): a booking from the new sheet. The server prices it from the
 * service (never from the browser), takes the deposit as paid (the demo has no Paystack) and keeps
 * the option, extras and home visit for the owner's Today. Event days take the whole date.
 */
export async function bookTimeV2(
  slug: string,
  input: { serviceId: string; startsAt: string; choice: BookingChoice; firstName: string; phone: string; address?: string; area?: string; answers?: string; tikka?: string },
): Promise<BookResult> {
  const found = await getBusinessBySlug(slug);
  if (!found || isDbId(found.ownerId) || !found.business.trades?.length) return { kind: "not_found" };
  const { business, ownerId } = found;
  const d = demoBook(ownerId, business);
  const svc = business.services.find((s) => s.id === input.serviceId);
  if (!d || !svc) return { kind: "not_found" };
  const start = new Date(input.startsAt);
  // "Book a time to use it" from a Tikka's card: this business's unused Tikka, before its use-by, one
  // upcoming booking per Tikka. Name and number come from the claim, never the browser; no deposit.
  const tikka = input.tikka ? demoTikkaForBooking(input.tikka) : null;
  if (input.tikka) {
    if (!tikka || tikka.ownerId !== ownerId) return { kind: "not_found" };
    if (tikka.redeemed) return { kind: "used" };
    const have = d.bookings.find((x) => x.claimId === input.tikka && x.status === "booked" && new Date(x.endsAt).getTime() > Date.now());
    if (have) return { kind: "already", token: have.viewToken!, code: have.code, id: have.id };
    if (start.getTime() >= new Date(tikka.expiresAt).getTime()) return { kind: "after_use_by" };
  }
  const who = tikka ? { firstName: tikka.firstName, phone: tikka.phone ?? "" } : { firstName: input.firstName, phone: input.phone };
  const home = business.workPlace === "home" || (business.workPlace === "both" && !!input.choice.home);
  const price = priceBooking(svc, { ...input.choice, home }, business.travelFee ?? 0, tikka ? undefined : d.setup.deposit);
  let end: Date;
  if (svc.eventDay) {
    const { day, minute } = watParts(start);
    if (minute < 4 * 60 || minute > 12 * 60) return { kind: "closed" };
    if (start.getTime() < Date.now() + d.setup.noticeMinutes * 60_000) return { kind: "too_soon" };
    const dayStart = watInstant(day, 0);
    const dayEnd = dayStart + 86_400_000;
    if (d.bookings.some((x) => x.status !== "cancelled" && new Date(x.startsAt).getTime() < dayEnd && new Date(x.endsAt).getTime() > dayStart)) return { kind: "taken" };
    end = new Date(dayEnd);
  } else {
    const problem = demoProblem(d, business, start, price.minutes, null, false, { serviceId: svc.id, home });
    if (problem) return { kind: problem };
    end = new Date(start.getTime() + price.minutes * 60_000);
  }
  if (!tikka && d.bookings.filter((x) => x.phone === who.phone && x.status === "booked" && new Date(x.startsAt).getTime() > Date.now()).length >= MAX_UPCOMING) return { kind: "too_many" };
  const b: DemoBooking = {
    id: `bk_${randomBytes(6).toString("hex")}`, service: svc.name, serviceId: svc.id, minutes: Math.round((end.getTime() - start.getTime()) / 60_000),
    startsAt: start.toISOString(), endsAt: end.toISOString(), firstName: who.firstName, phone: who.phone || undefined, source: tikka ? "tikka" : "page",
    status: "booked", code: demoCode(), viewToken: randomBytes(12).toString("hex"), moved: false, createdAt: new Date().toISOString(), futureOffers: false,
    claimId: tikka ? input.tikka : undefined,
    priceKobo: price.totalNaira * 100, priceKind: "fixed", depositPaidKobo: price.depositNaira ? price.depositNaira * 100 : undefined, depositCounts: d.setup.deposit?.counts ?? true,
    homeArea: home ? [input.address?.trim(), input.area?.trim()].filter(Boolean).join(", ").slice(0, 120) || business.city : undefined,
    detail: [price.detail, input.answers?.trim()].filter(Boolean).join(" · ").slice(0, 200) || undefined,
  };
  d.bookings.push(b);
  return { kind: "booked", token: b.viewToken!, code: b.code, id: b.id };
}

/* ------------------------------------------------------------ the waitlist (demo store, else the database) */

export interface WaitlistEntry {
  id: string;
  /** The WAT day they wanted, "2026-11-28". */
  day: string;
  serviceId?: string;
  service: string;
  name: string;
  /** Owners only (rule 4). */
  phone: string;
  createdAt: string;
}
const waitlists: Map<string, WaitlistEntry[]> = ((globalThis as { __tikkaWaitlists?: Map<string, WaitlistEntry[]> }).__tikkaWaitlists ??= new Map());

/** A customer asks to hear if a full day opens up. One entry per number per day. */
export async function joinWaitlist(slug: string, input: { serviceId: string; day: string; name: string; phone: string; visitorId?: string }): Promise<{ ok: true } | { ok: false; reason: string }> {
  const found = await getBusinessBySlug(slug);
  if (!found) return { ok: false, reason: "not_found" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.day) || input.day < watParts(new Date()).day) return { ok: false, reason: "closed" };
  // A real business (docs/DB_MOVE.md step 3): join_waitlist() checks the rest.
  if (isDbId(found.ownerId)) return dbJoinWaitlist({ businessId: found.business.id, serviceId: input.serviceId, day: input.day, firstName: input.name, phone: input.phone, visitorId: input.visitorId ?? "" });
  if (!found.business.trades?.length) return { ok: false, reason: "not_found" };
  const svc = found.business.services.find((s) => s.id === input.serviceId);
  const list = waitlists.get(found.ownerId) ?? [];
  if (!list.some((w) => w.day === input.day && w.phone === input.phone)) {
    if (list.length >= 500) return { ok: false, reason: "slow_down" };
    list.push({ id: randomBytes(6).toString("hex"), day: input.day, serviceId: svc?.id, service: svc?.name ?? "A booking", name: input.name, phone: input.phone, createdAt: new Date().toISOString() });
  }
  waitlists.set(found.ownerId, list);
  return { ok: true };
}

/** The owner's waitlist from today on, soonest day first. */
export async function getWaitlist(user: Pick<SessionUser, "id" | "role" | "businessOwnerId">): Promise<WaitlistEntry[]> {
  if (user.role !== "owner") return [];
  if (isDbId(user.id)) {
    const key = await memberBusinessId(user);
    return key && isDbId(key) ? dbGetWaitlist(key) : [];
  }
  const today = watParts(new Date()).day;
  return (waitlists.get(user.id) ?? []).filter((w) => w.day >= today).sort((a, b) => a.day.localeCompare(b.day) || a.createdAt.localeCompare(b.createdAt));
}

export async function removeWaitlist(user: Pick<SessionUser, "id" | "role" | "businessOwnerId">, id: string): Promise<void> {
  if (user.role !== "owner") return;
  if (isDbId(user.id)) {
    const key = await memberBusinessId(user);
    if (key && isDbId(key) && isDbId(id)) await dbRemoveWaitlist(key, id);
    return;
  }
  waitlists.set(user.id, (waitlists.get(user.id) ?? []).filter((w) => w.id !== id));
}

/** NEW DIRECTION (demo only): the deposit rule the new booking sheet prices with. */
export function demoDepositRule(ownerKey: string, business: Business): BookingSetup["deposit"] | undefined {
  if (isDbId(ownerKey)) return undefined;
  return demoBook(ownerKey, business)?.setup.deposit;
}

/** The customer moves or cancels from their pass, within the booking rules (demo store, else the database). */
export async function changeFromPass(token: string, change: { kind: "cancel" } | { kind: "move"; startsAt: string }): Promise<{ ok: true } | { ok: false; reason: string }> {
  for (const [ownerKey, d] of demo) {
    const b = d.bookings.find((x) => x.viewToken === token);
    if (!b) continue;
    if (b.status !== "booked") return { ok: false, reason: "not_booked" };
    if (change.kind === "cancel") {
      b.status = "cancelled";
      return { ok: true };
    }
    // Moving needs 24 hours' notice, as the rules filled in at setup say.
    const owner = await getBusiness({ id: ownerKey });
    if (!owner) return { ok: false, reason: "not_found" };
    const svc = owner.services.find((s) => s.id === b.serviceId);
    if (new Date(b.startsAt).getTime() - Date.now() < 86_400_000) return { ok: false, reason: "too_late" };
    const start = new Date(change.startsAt);
    if (svc?.eventDay) {
      const day = watParts(start).day;
      const dayStart = watInstant(day, 0);
      if (d.bookings.some((x) => x.id !== b.id && x.status !== "cancelled" && new Date(x.startsAt).getTime() < dayStart + 86_400_000 && new Date(x.endsAt).getTime() > dayStart)) return { ok: false, reason: "taken" };
      b.startsAt = start.toISOString();
      b.endsAt = new Date(dayStart + 86_400_000).toISOString();
    } else {
      const problem = demoProblem(d, owner, start, b.minutes, b.id, false, { serviceId: b.serviceId, home: !!b.homeArea });
      if (problem) return { ok: false, reason: problem };
      b.startsAt = start.toISOString();
      b.endsAt = new Date(start.getTime() + b.minutes * 60_000).toISOString();
    }
    b.moved = true;
    return { ok: true };
  }
  // A real booking (docs/DB_MOVE.md step 2): change_from_pass() checks the notice and the free time.
  return dbChangeFromPass(token, change);
}

/** The pass's booking, for moving it (its business and service): the demo store, else the database. */
export async function passBooking(token: string): Promise<{ slug: string; serviceId?: string; minutes: number; gap: number; eventDay: boolean; startsAt: string } | null> {
  for (const [ownerKey, d] of demo) {
    const b = d.bookings.find((x) => x.viewToken === token);
    if (!b) continue;
    const owner = await getBusiness({ id: ownerKey });
    if (!owner?.trades?.length) return null;
    const svc = owner.services.find((s) => s.id === b.serviceId);
    return { slug: owner.slug, serviceId: b.serviceId, minutes: b.minutes, gap: bookingGap(owner, b), eventDay: !!svc?.eventDay, startsAt: b.startsAt };
  }
  return dbPassBooking(token);
}

/**
 * NEW DIRECTION (demo only): a sample day so Today has something to show before real customers
 * book: four customers today (one a home visit, one without a deposit) and three tomorrow.
 */
export async function seedDemoDay(user: Pick<SessionUser, "id" | "role" | "businessOwnerId">, now: Date): Promise<number> {
  if (user.role !== "owner") return 0;
  const w = await who(user);
  if (!w || isDbId(w.key)) return 0;
  const d = demoBook(w.key, w.business)!;
  const services = w.business.services.filter((s) => s.id && !s.eventDay);
  if (!services.length) return 0;
  const today = watParts(now).day;
  const tomorrow = watParts(new Date(now.getTime() + 86_400_000)).day;
  const dep = d.setup.deposit;
  // day, first name, minute of day (WAT), phone, home visit, deposit paid
  const people: [string, string, number, string, boolean, boolean][] = [
    [today, "Ada", 600, "+2348031110011", false, true],
    [today, "Funmi", 750, "+2348031110012", true, true],
    [today, "Kemi", 900, "+2348031110013", false, false],
    [today, "Tolu", 1020, "+2348031110014", false, true],
    [tomorrow, "Ngozi", 570, "+2348031110015", false, true],
    [tomorrow, "Bimpe", 720, "+2348031110016", false, true],
    [tomorrow, "Chioma", 900, "+2348031110017", false, true],
  ];
  let added = 0;
  people.forEach(([day, first, min, phone, home, paid], i) => {
    const s = services[i % services.length];
    const opt = s.options?.[s.options.length - 1];
    const minutes = opt?.minutes ?? s.minutes ?? DEFAULT_MINUTES;
    const priceNaira = (opt?.price ?? s.price ?? 0) + (home ? w.business.travelFee ?? 0 : 0);
    const depositNaira = paid && dep && dep.mode !== "off" ? depositOn(priceNaira, dep.mode === "fixed" ? { mode: "fixed", amount: (dep.fixedKobo ?? 0) / 100 } : { mode: "percent", percent: dep.percent ?? 30 }) : 0;
    const start = new Date(watInstant(day, min));
    const id = `bk_sample_${day}_${min}`;
    if (d.bookings.some((x) => x.id === id)) return;
    d.bookings.push({
      id, service: s.name, serviceId: s.id, minutes, startsAt: start.toISOString(), endsAt: new Date(start.getTime() + minutes * 60_000).toISOString(),
      firstName: first, phone, source: "page", status: "booked", code: demoCode(), viewToken: randomBytes(12).toString("hex"), moved: false,
      createdAt: new Date(now.getTime() - (2 + i) * 86_400_000).toISOString(), futureOffers: true,
      priceKobo: priceNaira * 100, priceKind: "fixed", depositPaidKobo: depositNaira ? depositNaira * 100 : undefined, depositCounts: dep?.counts ?? true,
      homeArea: home ? (w.business.area || w.business.city) : undefined, detail: opt?.label,
    });
    added++;
  });
  return added;
}

/** NEW DIRECTION (demo only): the deposit picked at setup. Real accounts set deposits on Get paid. */
export async function saveDemoDeposit(user: Pick<SessionUser, "id" | "role" | "businessOwnerId">, deposit: BookingSetup["deposit"]): Promise<void> {
  if (user.role !== "owner") throw new Error("Only the owner sets deposits.");
  const w = await who(user);
  if (!w || isDbId(w.key)) throw new Error("Demo businesses only.");
  const d = demoBook(w.key, w.business)!;
  d.setup = { ...d.setup, deposit };
}

async function demoFor(user: Pick<SessionUser, "id" | "role" | "businessOwnerId">, ownerOnly: boolean) {
  if (ownerOnly && user.role !== "owner") return { err: { kind: "no_access" } as Act };
  const w = await who(user);
  if (!w) return { err: { kind: "no_access" } as Act };
  return { w, d: isDbId(w.key) ? null : demoBook(w.key, w.business) };
}

export async function addBooking(
  user: Pick<SessionUser, "id" | "role" | "businessOwnerId">,
  b: { serviceId: string; startsAt: string; firstName: string; phone: string | null; force: boolean; claimId?: string; choice?: BookingChoice },
): Promise<Act> {
  const r = await demoFor(user, true);
  if ("err" in r) return r.err!;
  const { w, d } = r;
  if (!d) return (await dbAddBooking(w.key, b)) as Act;
  const svc = w.business.services.find((s) => s.id === b.serviceId);
  if (!svc) return { kind: "not_found" };
  // Options, per hour, per item, per person: priced like a customer booking (add_booking() does the same).
  const priced = svc.priceKind !== "ask" && (svc.options?.length || svc.unit) ? priceBooking(svc, b.choice ?? {}, 0, undefined) : null;
  const minutes = priced ? priced.minutes : (d.minutes[svc.id!] ?? DEFAULT_MINUTES);
  const start = new Date(b.startsAt);
  const problem = demoProblem(d, w.business, start, minutes, null, b.force, { serviceId: svc.id });
  if (problem) return { kind: problem };
  d.bookings.push({
    id: `bk_${randomBytes(6).toString("hex")}`, service: svc.name, serviceId: svc.id, minutes, startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + minutes * 60_000).toISOString(), firstName: b.firstName, phone: b.phone ?? undefined,
    source: b.claimId ? "tikka" : "owner", status: "booked", code: demoCode(), viewToken: randomBytes(12).toString("hex"), moved: false,
    createdAt: new Date().toISOString(), futureOffers: false, claimId: b.claimId,
    // The service's price, like a customer booking, so Today knows what's left after a deposit.
    priceKobo: priced ? priced.totalNaira * 100 : svc.price != null ? svc.price * 100 : undefined, priceKind: priced ? "fixed" : (svc.priceKind ?? "fixed"),
    detail: priced?.detail,
  });
  return { kind: "booked", id: d.bookings[d.bookings.length - 1].id };
}

/**
 * A deposit the owner took themself (cash, transfer, card) on a booking; 0 clears it. Owners only.
 * Never on one paid online, cancelled, or already marked paid (record_booking_deposit()).
 */
export async function recordBookingDeposit(user: Pick<SessionUser, "id" | "role" | "businessOwnerId">, id: string, kobo: number, method: "cash" | "transfer" | "card"): Promise<string> {
  const r = await demoFor(user, true);
  if ("err" in r) return String(r.err!.kind);
  const { w, d } = r;
  if (!d) return dbRecordBookingDeposit(w.key, id, kobo, method);
  const b = d.bookings.find((x) => x.id === id);
  if (!b) return "not_found";
  if (b.status === "cancelled") return "cancelled";
  if (b.depositPaidKobo && !b.depositMethod) return "paid_online";
  if (b.depositMethod === "pay_link") return "paid_online";
  if ((await getLedger(user)).sales.some((s) => s.bookingId === id)) return "settled";
  if (!kobo) {
    b.depositPaidKobo = b.depositPaidAt = b.depositMethod = undefined;
    return "cleared";
  }
  if (kobo < 0 || kobo > 1_000_000_000) return "bad_amount";
  Object.assign(b, { depositPaidKobo: kobo, depositPaidAt: new Date().toISOString(), depositMethod: method, depositCounts: true });
  return "saved";
}

/** DEMO: a paid deposit pay link lands on its booking, if it still has no deposit and isn't marked paid. */
export async function depositFromDemoLink(owner: string, bookingId: string, kobo: number, now: Date): Promise<boolean> {
  const user = { id: owner, role: "owner" as const };
  const r = await demoFor(user, true);
  if ("err" in r || !r.d) return false;
  const b = r.d.bookings.find((x) => x.id === bookingId);
  if (!b || (b.status !== "booked" && b.status !== "arrived") || b.depositPaidKobo) return false;
  if ((await getLedger(user)).sales.some((s) => s.bookingId === bookingId)) return false;
  Object.assign(b, { depositPaidKobo: kobo, depositPaidAt: now.toISOString(), depositMethod: "pay_link", depositCounts: true });
  return true;
}

/** DEMO: a booking's name and number, for a deposit pay link (owners only). */
export async function demoBookingFor(user: Pick<SessionUser, "id" | "role" | "businessOwnerId">, bookingId: string): Promise<Booking | null> {
  const r = await demoFor(user, true);
  if ("err" in r || !r.d) return null;
  return r.d.bookings.find((x) => x.id === bookingId) ?? null;
}

export async function moveBooking(user: Pick<SessionUser, "id" | "role" | "businessOwnerId">, id: string, startsAt: string, force: boolean): Promise<Act> {
  const r = await demoFor(user, true);
  if ("err" in r) return r.err!;
  const { w, d } = r;
  if (!d) return (await dbMoveBooking(w.key, id, startsAt, force)) as Act;
  const b = d.bookings.find((x) => x.id === id);
  if (!b) return { kind: "not_found" };
  if (b.status !== "booked") return { kind: "not_booked" };
  const start = new Date(startsAt);
  const problem = demoProblem(d, w.business, start, b.minutes, b.id, force, { serviceId: b.serviceId, home: !!b.homeArea });
  if (problem) return { kind: problem };
  b.startsAt = start.toISOString();
  b.endsAt = new Date(start.getTime() + b.minutes * 60_000).toISOString();
  b.moved = true;
  return { kind: "moved" };
}

export async function cancelBooking(user: Pick<SessionUser, "id" | "role" | "businessOwnerId">, id: string): Promise<Act> {
  const r = await demoFor(user, true);
  if ("err" in r) return r.err!;
  const { w, d } = r;
  if (!d) return (await dbCancelBooking(w.key, id)) as Act;
  const b = d.bookings.find((x) => x.id === id && x.status === "booked");
  if (!b) return { kind: "not_booked" };
  b.status = "cancelled";
  return { kind: "cancelled" };
}

export async function markBooking(user: Pick<SessionUser, "id" | "role" | "businessOwnerId">, id: string, status: "arrived" | "no_show" | "booked"): Promise<Act> {
  const r = await demoFor(user, false);
  if ("err" in r) return r.err!;
  const { w, d } = r;
  if (!d) return (await dbMarkBooking(w.key, id, status)) as Act;
  const b = d.bookings.find((x) => x.id === id);
  if (!b) return { kind: "not_found" };
  if (b.status === "cancelled") return { kind: "cancelled" };
  const start = new Date(b.startsAt).getTime();
  if ((status === "arrived" && start > Date.now() + 3_600_000) || (status === "no_show" && start > Date.now())) return { kind: "too_early" };
  b.status = status;
  return { kind: status };
}

export async function blockTime(user: Pick<SessionUser, "id" | "role" | "businessOwnerId">, startsAt: string, endsAt: string, note: string): Promise<Act> {
  const r = await demoFor(user, true);
  if ("err" in r) return r.err!;
  const { w, d } = r;
  if (!d) return (await dbBlockTime(w.key, startsAt, endsAt, note)) as Act;
  const s = new Date(startsAt).getTime();
  const e = new Date(endsAt).getTime();
  if (!(e > s) || e - s > 31 * 86_400_000) return { kind: "bad_time" };
  const id = `blk_${randomBytes(6).toString("hex")}`;
  d.blocks.push({ id, startsAt: new Date(s).toISOString(), endsAt: new Date(e).toISOString(), note: note.trim().slice(0, 60) || undefined });
  const clashes = d.bookings
    .filter((x) => x.status === "booked" && new Date(x.startsAt).getTime() < e && new Date(x.endsAt).getTime() > s)
    .map((x) => ({ id: x.id, first_name: x.firstName, service: x.service, starts_at: x.startsAt }));
  return { kind: "blocked", id, clashes };
}

export async function removeBlock(user: Pick<SessionUser, "id" | "role" | "businessOwnerId">, id: string): Promise<Act> {
  const r = await demoFor(user, true);
  if ("err" in r) return r.err!;
  const { w, d } = r;
  if (!d) {
    await dbRemoveBlock(w.key, id);
    return { kind: "removed" };
  }
  d.blocks = d.blocks.filter((k) => k.id !== id);
  return { kind: "removed" };
}

export { DEFAULT_RULES };

/* ------------------------------------------------------------ part 2 */

export interface BookingLead {
  leadId: string;
  name: string;
  phone: string;
  phoneConfirmed: boolean;
  optIn: boolean;
  claims: number;
  sources: Booking["source"][];
  bookings: number;
  came: number;
  lastAt: string;
  next?: { startsAt: string; service: string; code: string; claimId?: string };
}

/** Everyone who booked, one per person, for the Leads page. Owners only (rule 4). */
export async function getBookingLeads(user: Pick<SessionUser, "id" | "role" | "businessOwnerId">): Promise<BookingLead[]> {
  if (user.role !== "owner") return [];
  const w = await who(user);
  if (!w) return [];
  if (isDbId(w.key)) {
    return (await dbBookingLeads(w.key)).map((r) => ({
      leadId: r.lead_id,
      name: r.first_name,
      phone: r.phone,
      phoneConfirmed: r.phone_confirmed,
      optIn: r.marketing_opt_in,
      claims: Number(r.claims_count),
      sources: (r.sources ?? []) as Booking["source"][],
      bookings: Number(r.bookings),
      came: Number(r.came),
      lastAt: r.last_at,
      next: r.next ? { startsAt: r.next.starts_at, service: r.next.service, code: r.next.code, claimId: r.next.claim_id ?? undefined } : undefined,
    }));
  }
  const d = demoBook(w.key, w.business);
  if (!d) return [];
  const byPhone = new Map<string, DemoBooking[]>();
  for (const b of d.bookings) if (b.phone) byPhone.set(b.phone, [...(byPhone.get(b.phone) ?? []), b]);
  const now = Date.now();
  return [...byPhone.entries()]
    .map(([phone, list]) => {
      const next = list.filter((b) => b.status === "booked" && new Date(b.endsAt).getTime() > now).sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
      return {
        leadId: `demo_${phone}`,
        name: list[0].firstName,
        phone,
        phoneConfirmed: false,
        optIn: list.some((b) => b.futureOffers && b.status === "arrived"),
        claims: list.some((b) => b.claimId) ? 1 : 0,
        sources: [...new Set(list.map((b) => b.source))],
        bookings: list.filter((b) => b.status !== "cancelled").length,
        came: list.filter((b) => b.status === "arrived").length,
        lastAt: list.map((b) => b.createdAt).sort().at(-1)!,
        next: next ? { startsAt: next.startsAt, service: next.service, code: next.code, claimId: next.claimId } : undefined,
      };
    })
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

export interface TikkaForBooking {
  token: string;
  name: string;
  /** The last WAT day it can be booked on (the use-by). */
  until: string;
  untilAt: string;
  reward: string;
  booking?: { token: string; startsAt: string; service: string };
}

/** "Book a time to use it": the Tikka, if it's this business's, unused and still good. */
export async function getTikkaForBooking(token: string, ownerKey: string, business: Business): Promise<TikkaForBooking | null> {
  await connection();
  const now = Date.now();
  const shape = (t: { firstName: string; expiresAt: string; reward: string }, booking?: TikkaForBooking["booking"]): TikkaForBooking => ({
    token,
    name: t.firstName,
    until: watParts(new Date(new Date(t.expiresAt).getTime() - 60_000)).day,
    untilAt: t.expiresAt,
    reward: t.reward,
    booking,
  });
  if (isDbId(ownerKey)) {
    const t = await dbTikkaInfo(token);
    if (!t || t.businessId !== business.id || t.redeemed || new Date(t.expiresAt).getTime() <= now) return null;
    return shape(t, t.booking ? { token: t.booking.viewToken, startsAt: t.booking.startsAt, service: t.booking.service } : undefined);
  }
  const t = demoTikkaForBooking(token);
  if (!t || t.ownerId !== ownerKey || t.redeemed || new Date(t.expiresAt).getTime() <= now) return null;
  const d = demoBook(ownerKey, business);
  const b = d?.bookings.find((x) => x.claimId === token && (x.status === "booked" || x.status === "arrived"));
  return shape(t, b ? { token: b.viewToken!, startsAt: b.startsAt, service: b.service } : undefined);
}

/** The claimer books a time to use their Tikka. Name and number come from the claim, never the browser. */
export async function bookForTikka(
  slug: string,
  token: string,
  serviceId: string,
  startsAt: string,
  picks?: { choice?: Record<string, unknown>; answers?: string },
): Promise<BookResult> {
  const found = await getBusinessBySlug(slug);
  if (!found) return { kind: "not_found" };
  const { business, ownerId } = found;
  if (isDbId(ownerId)) return dbBookForClaim(token, serviceId, startsAt, picks);
  const t = demoTikkaForBooking(token);
  const d = demoBook(ownerId, business);
  const svc = business.services.find((s) => s.id === serviceId);
  if (!t || !d || !svc || t.ownerId !== ownerId) return { kind: "not_found" };
  if (t.redeemed) return { kind: "used" };
  const have = d.bookings.find((x) => x.claimId === token && x.status === "booked" && new Date(x.endsAt).getTime() > Date.now());
  if (have) return { kind: "already", token: have.viewToken!, code: have.code, id: have.id };
  const start = new Date(startsAt);
  if (start.getTime() >= new Date(t.expiresAt).getTime()) return { kind: "after_use_by" };
  const minutes = d.minutes[svc.id!] ?? DEFAULT_MINUTES;
  const problem = demoProblem(d, business, start, minutes, null, false, { serviceId: svc.id });
  if (problem) return { kind: problem };
  const b: DemoBooking = {
    id: `bk_${randomBytes(6).toString("hex")}`, service: svc.name, serviceId: svc.id, minutes, startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + minutes * 60_000).toISOString(), firstName: t.firstName, phone: t.phone, source: "tikka",
    status: "booked", code: demoCode(), viewToken: randomBytes(12).toString("hex"), moved: false, createdAt: new Date().toISOString(),
    futureOffers: false, claimId: token,
  };
  d.bookings.push(b);
  return { kind: "booked", token: b.viewToken!, code: b.code, id: b.id };
}

export type BookingCheck =
  | {
      kind: "booking";
      id: string;
      code: string;
      firstName: string;
      service: string;
      minutes: number;
      startsAt: string;
      status: Booking["status"];
      source: Booking["source"];
      depositPaidKobo?: number;
      priceKobo?: number;
      priceKind?: string;
      depositCounts?: boolean;
    }
  | { kind: "unknown" | "wrong_business" | "no_access" };

/** A BK- code at the counter. Owners and staff; never the number. Read-only. */
export async function checkBookingCode(user: Pick<SessionUser, "id" | "role" | "businessOwnerId">, code: string): Promise<BookingCheck> {
  const w = await who(user);
  if (!w) return { kind: "no_access" };
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^BK[A-Z0-9]{6}$/.test(clean)) return { kind: "unknown" };
  if (isDbId(w.key)) {
    const r = await dbCheckBookingCode(w.key, clean);
    if (r.kind !== "booking") return { kind: r.kind as "unknown" };
    return {
      kind: "booking", id: String(r.id), code: String(r.code), firstName: String(r.first_name), service: String(r.service),
      minutes: Number(r.minutes), startsAt: String(r.starts_at), status: r.status as Booking["status"], source: r.source as Booking["source"],
      depositPaidKobo: r.deposit_paid_kobo == null ? undefined : Number(r.deposit_paid_kobo),
      priceKobo: r.price_kobo == null ? undefined : Number(r.price_kobo),
      priceKind: (r.price_kind as string | null) ?? undefined,
      depositCounts: r.deposit_counts == null ? undefined : r.deposit_counts === true,
    };
  }
  const full = `BK-${clean.slice(2)}`;
  for (const [key, d] of demo) {
    const b = d.bookings.find((x) => x.code === full);
    if (!b) continue;
    if (key !== w.key) return { kind: "wrong_business" };
    return { kind: "booking", id: b.id, code: b.code, firstName: b.firstName, service: b.service, minutes: b.minutes, startsAt: b.startsAt, status: b.status, source: b.source };
  }
  return { kind: "unknown" };
}
