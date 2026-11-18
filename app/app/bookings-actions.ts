"use server";

import { revalidatePath } from "next/cache";
import { LENGTHS } from "@/lib/bookings";
import { addBooking, blockTime, cancelBooking, checkBookingCode, markBooking, moveBooking, removeBlock, saveBookingSettings, type Act, type BookingCheck } from "@/lib/bookings-data";
import { getSessionUser } from "@/lib/session";
import { normalizeNgPhone } from "@/lib/setup";
import { firstName } from "@/lib/claim";

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

export async function addBookingAction(input: { serviceId: string; startsAt: string; name: string; phone: string; force: boolean; claimId?: string }): Promise<Act> {
  const u = await user();
  if (!isIso(input.startsAt) || typeof input.serviceId !== "string") return { kind: "bad_time" };
  const name = firstName(String(input.name ?? ""));
  const raw = String(input.phone ?? "").trim();
  const phone = raw ? normalizeNgPhone(raw) : null;
  if (raw && !phone) return { kind: "bad_phone" };
  if (!name && !input.claimId) return { kind: "bad_name" };
  const r = await addBooking(u, { serviceId: input.serviceId, startsAt: new Date(input.startsAt).toISOString(), firstName: name, phone, force: input.force === true, claimId: input.claimId });
  if (r.kind === "booked") refresh();
  return r;
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
