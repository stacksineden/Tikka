"use server";

import { revalidatePath } from "next/cache";
import { LENGTHS, todayKey, watInstant } from "@/lib/bookings";
import { cleanChoice, type BookingChoice } from "@/lib/booking-price";
import { addBooking, demoBookingFor, depositLinkOptions, payLinkDeposit, recordBookingDeposit, blockTime, cancelBooking, checkBookingCode, markBooking, moveBooking, removeBlock, saveBookingSettings, type Act, type BookingCheck } from "@/lib/bookings-data";
import { getSessionUser } from "@/lib/session";
import { dbSaveDepositSettings } from "@/lib/bookings-db";
import { getBusiness, isDbId } from "@/lib/data";
import { normalizeNgPhone } from "@/lib/setup";
import { firstName } from "@/lib/claim";
import { dbCreateDepositLink } from "@/lib/paylinks-db";
import { createDemoPayLink } from "@/lib/paylinks-demo";
import { paystackMode } from "@/lib/paystack";
import { siteUrl } from "@/lib/supabase/env";
import { getOwnerUser } from "@/lib/session";

// Bookings on the dashboard (docs/BOOKINGS.md). Who may do what is checked again in the database:
// owners move, cancel, add and block; staff only mark Arrived and No-show.

const isIso = (s: unknown): s is string => typeof s === "string" && !Number.isNaN(Date.parse(s));

function refresh() {
  revalidatePath("/app/bookings");
  revalidatePath("/app");
  revalidatePath("/app/redeem");
}

async function user() {
  const u = await getSessionUser();
  if (!u) throw new Error("Sign in again.");
  return u;
}

export async function saveBookingSettingsAction(input: {
  enabled: boolean;
  capacity: number;
  noticeMinutes: number;
  aheadDays: number;
  minutes: Record<string, number | null>;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const u = await user();
  const capacity = Math.round(Number(input.capacity));
  const notice = Math.round(Number(input.noticeMinutes));
  const ahead = Math.round(Number(input.aheadDays));
  if (!(capacity >= 1 && capacity <= 20)) return { ok: false, error: "Pick how many customers you can serve at once (1 to 20)." };
  if (!(notice >= 0 && notice <= 10080) || !(ahead >= 7 && ahead <= 183)) return { ok: false, error: "Check the notice and how far ahead." };
  const minutes: Record<string, number | null> = {};
  for (const [id, m] of Object.entries(input.minutes ?? {})) {
    if (m === null) minutes[id] = null;
    else if ((LENGTHS as readonly number[]).includes(Number(m))) minutes[id] = Number(m);
  }
  try {
    await saveBookingSettings(u, { enabled: input.enabled === true, capacity, noticeMinutes: notice, aheadDays: ahead, minutes });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't save. Try again." };
  }
  refresh();
  revalidatePath("/[slug]", "page");
  return { ok: true };
}

export type DepositMethodIn = "cash" | "transfer" | "card";

/**
 * "When did they pay?" as a day ("2026-11-26"): noon that day in WAT, or undefined for today (now).
 * Not in the future, not more than 180 days ago (record_booking_deposit() checks again). null: a bad day.
 */
function paidAtFrom(day: unknown): string | undefined | null {
  if (day == null || day === "") return undefined;
  if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const now = new Date();
  if (day === todayKey(now)) return undefined;
  const at = watInstant(day, 12 * 60);
  if (!Number.isFinite(at) || at > now.getTime() || at < now.getTime() - 180 * 86_400_000) return null;
  return new Date(at).toISOString();
}
const METHODS: DepositMethodIn[] = ["cash", "transfer", "card"];

export async function addBookingAction(input: {
  serviceId: string;
  startsAt: string;
  name: string;
  phone: string;
  force: boolean;
  claimId?: string;
  /** Which option, how many, how many people: priced on the server like a customer booking. */
  choice?: BookingChoice;
  /** A deposit they already paid the owner (naira), and how. */
  depositNaira?: number;
  depositMethod?: DepositMethodIn;
  /** The day they paid it, when not today. */
  depositPaidOn?: string;
}): Promise<Act> {
  const u = await user();
  if (!isIso(input.startsAt) || typeof input.serviceId !== "string") return { kind: "bad_time" };
  const name = firstName(String(input.name ?? ""));
  // Every customer has a WhatsApp number; a booking for a Tikka brings the claimer's.
  const raw = String(input.phone ?? "").trim();
  const phone = raw ? normalizeNgPhone(raw) : null;
  if ((raw || !input.claimId) && !phone) return { kind: "bad_phone" };
  if (!name && !input.claimId) return { kind: "bad_name" };
  const deposit = Math.round(Number(input.depositNaira) || 0);
  if (deposit < 0 || deposit > 10_000_000 || (deposit > 0 && !METHODS.includes(input.depositMethod as DepositMethodIn))) return { kind: "bad_deposit" };
  const paidAt = paidAtFrom(input.depositPaidOn);
  if (paidAt === null) return { kind: "bad_deposit" };
  const r = await addBooking(u, { serviceId: input.serviceId, startsAt: new Date(input.startsAt).toISOString(), firstName: name, phone, force: input.force === true, claimId: input.claimId, choice: cleanChoice(input.choice) });
  if (r.kind === "booked" && deposit > 0 && typeof r.id === "string") {
    const d = await recordBookingDeposit(u, r.id, deposit * 100, input.depositMethod as DepositMethodIn, paidAt);
    // Booked either way; say so if the deposit didn't save, so the owner adds it on the booking.
    if (d !== "saved") r.depositNotSaved = true;
  }
  if (r.kind === "booked") refresh();
  return r;
}

/** A deposit the owner took themself on a booking (naira; 0 removes it). Owners only. */
export async function bookingDepositAction(id: string, naira: number, method: DepositMethodIn, paidOn?: string): Promise<{ kind: string }> {
  const n = Math.round(Number(naira));
  if (!Number.isFinite(n) || n < 0 || n > 10_000_000 || !METHODS.includes(method)) return { kind: "bad_amount" };
  const paidAt = paidAtFrom(paidOn);
  if (paidAt === null) return { kind: "bad_date" };
  const kind = await recordBookingDeposit(await user(), String(id), n * 100, method, paidAt);
  if (kind === "saved" || kind === "cleared") {
    refresh();
    revalidatePath("/app/money");
    revalidatePath("/app/leads", "layout");
  }
  return { kind };
}

/**
 * A pay link for a booking's deposit (owners only): the booking's name and number; paying it records
 * the deposit on the booking (create_deposit_link()). Returns the link to send from their WhatsApp.
 */
export async function depositLinkAction(bookingId: string, naira: number): Promise<{ kind: "created"; url: string; note: string } | { kind: string; maxKobo?: number }> {
  const owner = await getOwnerUser();
  const b = owner ? await getBusiness(owner) : null;
  if (!owner || !b) return { kind: "no_access" };
  const kobo = Math.round(Number(naira) * 100);
  if (!Number.isFinite(kobo) || kobo < 10_000) return { kind: "too_small" };
  const id = String(bookingId);
  if (!isDbId(b.id)) {
    const bk = await demoBookingFor(owner, id);
    if (!bk) return { kind: "not_found" };
    if (bk.status !== "booked" && bk.status !== "arrived") return { kind: "cancelled" };
    if (bk.depositPaidKobo) return { kind: "has_deposit" };
    const note = `Deposit for ${bk.service}`.slice(0, 80);
    const r = await createDemoPayLink(owner, b.slug, { amountKobo: kobo, note, name: bk.firstName, phone: bk.phone, for: { kind: "deposit", bookingId: id } }, new Date());
    if (r.kind !== "created") return r;
    refresh();
    revalidatePath("/app/money");
    return { kind: "created", url: `${siteUrl()}/pay/${r.token}`, note };
  }
  const mode = paystackMode();
  if (!mode || !isDbId(id)) return { kind: "not_enabled" };
  const r = await dbCreateDepositLink(b.id, id, kobo, mode);
  if (r.kind !== "created") return { kind: String(r.kind), maxKobo: r.max_kobo == null ? undefined : Number(r.max_kobo) };
  refresh();
  revalidatePath("/app/money");
  const link = String(r.token);
  return { kind: "created", url: `${siteUrl()}/pay/${link}`, note: String(r.note ?? "") };
}

export async function moveBookingAction(id: string, startsAt: string, force: boolean): Promise<Act> {
  if (!isIso(startsAt)) return { kind: "bad_time" };
  const r = await moveBooking(await user(), id, new Date(startsAt).toISOString(), force === true);
  if (r.kind === "moved") refresh();
  return r;
}

export async function cancelBookingAction(id: string): Promise<Act> {
  const r = await cancelBooking(await user(), id);
  if (r.kind === "cancelled") refresh();
  return r;
}

export async function markBookingAction(id: string, status: "arrived" | "no_show" | "booked"): Promise<Act> {
  if (!["arrived", "no_show", "booked"].includes(status)) return { kind: "bad_time" };
  const r = await markBooking(await user(), id, status);
  if (r.kind === status) refresh();
  return r;
}

export async function blockTimeAction(startsAt: string, endsAt: string, note: string): Promise<Act> {
  if (!isIso(startsAt) || !isIso(endsAt)) return { kind: "bad_time" };
  const r = await blockTime(await user(), new Date(startsAt).toISOString(), new Date(endsAt).toISOString(), String(note ?? ""));
  if (r.kind === "blocked") refresh();
  return r;
}

export async function removeBlockAction(id: string): Promise<Act> {
  const r = await removeBlock(await user(), id);
  refresh();
  return r;
}

/** A BK- code typed on Redeem: the booking, never the number. Read-only (owners and staff). */
export async function checkBookingCodeAction(code: string): Promise<BookingCheck> {
  return checkBookingCode(await user(), String(code ?? "").slice(0, 20));
}

/** "Already paid with a pay link?": that customer's paid pay links that can be this booking's deposit. */
export async function depositLinkOptionsAction(bookingId: string) {
  return depositLinkOptions(await user(), String(bookingId));
}

/** Uses one of them as the booking's deposit, counted once (use_link_as_deposit()). */
export async function payLinkDepositAction(bookingId: string, linkId: string): Promise<{ kind: string }> {
  const kind = await payLinkDeposit(await user(), String(bookingId), String(linkId));
  if (kind === "saved") {
    refresh();
    revalidatePath("/app/money");
    revalidatePath("/app/leads", "layout");
  }
  return { kind };
}

/**
 * Deposits (REVENUE_PLAN 5.4): off, a % of the price (with a fixed ₦ for services without one), or a
 * fixed ₦; whether it counts towards the bill; and any service that differs. Owners only (SQL).
 */
export async function saveDepositSettingsAction(input: {
  mode: "off" | "percent" | "fixed";
  percent: number | null;
  fixedNaira: number | null;
  counts: boolean;
  services: Record<string, { mode: "none" | "fixed" | "full" | null; naira?: number | null }>;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const u = await user();
  if (u.role !== "owner") return { ok: false, error: "Only the owner sets deposits." };
  const b = await getBusiness(u);
  if (!b || !isDbId(b.id)) return { ok: false, error: "The demo business can't take deposits." };
  const kobo = (n: number | null | undefined) => (n == null || !Number.isFinite(Number(n)) ? null : Math.round(Number(n) * 100));
  const fixed = kobo(input.fixedNaira);
  if (fixed !== null && (fixed < 100000 || fixed > 100000000)) return { ok: false, error: "A fixed deposit is at least ₦1,000." };
  const services: Record<string, { mode: "none" | "fixed" | "full" | null; kobo?: number | null }> = {};
  for (const [id, s] of Object.entries(input.services ?? {})) {
    if (s.mode === "fixed") {
      const k = kobo(s.naira);
      if (k === null || k < 100000) return { ok: false, error: "A service's own deposit is at least ₦1,000." };
      services[id] = { mode: "fixed", kobo: k };
    } else services[id] = { mode: s.mode === "none" || s.mode === "full" ? s.mode : null };
  }
  const kind = await dbSaveDepositSettings(b.id, {
    mode: input.mode,
    percent: input.mode === "percent" ? Math.round(Number(input.percent)) : null,
    fixedKobo: fixed,
    counts: input.counts !== false,
    services,
  });
  if (kind !== "saved") {
    return {
      ok: false,
      error: kind === "bad_percent" ? "Pick a percentage between 5% and 100%." : kind === "bad_amount" ? "Type the fixed amount." : kind === "not_set_up" ? "Set up bookings first." : "Couldn't save. Try again.",
    };
  }
  refresh();
  revalidatePath("/[slug]", "page");
  return { ok: true };
}
