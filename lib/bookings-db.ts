import "server-only";

import type { Booking, BookingRules, BookingSetup } from "./bookings";
import { adminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";

// Bookings for businesses in Supabase (supabase/migrations/20261120100000_bookings.sql). Who may
// do what (owners, staff, the public) is checked in the database, not here.

type Row = Record<string, unknown>;

export function bookingFrom(r: Row): Booking {
  return {
    id: String(r.id),
    service: String(r.service),
    serviceId: (r.service_id as string | null) ?? undefined,
    minutes: Number(r.minutes),
    startsAt: String(r.starts_at),
    endsAt: String(r.ends_at),
    firstName: String(r.first_name),
    phone: (r.phone as string | null) ?? undefined,
    source: r.source as Booking["source"],
    status: r.status as Booking["status"],
    code: String(r.code),
    claimId: (r.claim_id as string | null) ?? undefined,
    leadId: (r.lead_id as string | null) ?? undefined,
    viewToken: (r.view_token as string | null) ?? undefined,
    moved: r.moved === true,
    createdAt: String(r.created_at),
  };
}

/** What the booking sheet needs to work out free times, or null when bookings are off. Public. */
export async function dbBookingRules(businessId: string, from: Date, days: number): Promise<BookingRules | null> {
  const sb = await createClient();
  const { data, error } = await sb.rpc("booking_busy", { p_business: businessId, p_from: from.toISOString(), p_days: days });
  if (error || !data) return null;
  const r = data as Row;
  return {
    capacity: Number(r.capacity),
    noticeMinutes: Number(r.notice_minutes),
    aheadDays: Number(r.ahead_days),
    hours: (r.hours as BookingRules["hours"]) ?? null,
    busy: (r.busy as [string, string][]) ?? [],
    blocked: (r.blocked as [string, string][]) ?? [],
  };
}

export type BookResult = { kind: "booked"; token: string; code: string; id: string } | { kind: string };

/** book_time(): server only, after the route's rate limits. */
export async function dbBookTime(input: {
  businessId: string;
  serviceId: string;
  startsAt: string;
  firstName: string;
  phone: string;
  futureOffers: boolean;
  visitorId: string;
}): Promise<BookResult> {
  const { data, error } = await adminClient().rpc("book_time", {
    p_business: input.businessId,
    p_service: input.serviceId,
    p_start: input.startsAt,
    p_first_name: input.firstName,
    p_phone: input.phone,
    p_future: input.futureOffers,
    p_visitor: input.visitorId,
  });
  if (error) return { kind: error.code === "P0002" ? "not_found" : "error" };
  return data as BookResult;
}

export interface BookingPass {
  code: string;
  service: string;
  minutes: number;
  startsAt: string;
  status: Booking["status"];
  firstName: string;
  moved: boolean;
  businessSlug: string;
  businessId: string;
}

/** The customer's booking pass, by its link. Never the phone number. */
export async function dbBookingPass(token: string): Promise<BookingPass | null> {
  if (!/^[0-9a-f]{24}$/.test(token)) return null;
  const { data, error } = await adminClient().rpc("booking_pass", { p_token: token });
  if (error || !data) return null;
  const r = data as Row;
  return {
    code: String(r.code),
    service: String(r.service),
    minutes: Number(r.minutes),
    startsAt: String(r.starts_at),
    status: r.status as Booking["status"],
    firstName: String(r.first_name),
    moved: r.moved === true,
    businessSlug: String(r.business_slug),
    businessId: String(r.business_id),
  };
}

export async function dbBookings(businessId: string, from: Date, to: Date): Promise<Booking[]> {
  const sb = await createClient();
  const { data, error } = await sb.rpc("get_bookings", { p_business: businessId, p_from: from.toISOString(), p_to: to.toISOString() });
  if (error) throw new Error("Only the business's team sees its bookings.");
  return ((data ?? []) as Row[]).map(bookingFrom);
}

export async function dbBookingSetup(businessId: string): Promise<BookingSetup> {
  const sb = await createClient();
  const { data, error } = await sb.rpc("get_booking_setup", { p_business: businessId });
  if (error || !data) throw new Error("Only the business's team sees its booking setup.");
  const r = data as Row;
  return {
    setUp: r.set_up === true,
    enabled: r.enabled === true,
    capacity: Number(r.capacity),
    noticeMinutes: Number(r.notice_minutes),
    aheadDays: Number(r.ahead_days),
    blocks: ((r.blocks as Row[]) ?? []).map((k) => ({
      id: String(k.id),
      startsAt: String(k.starts_at),
      endsAt: String(k.ends_at),
      note: (k.note as string | null) ?? undefined,
    })),
  };
}

export async function dbSaveBookingSettings(
  businessId: string,
  s: { enabled: boolean; capacity: number; noticeMinutes: number; aheadDays: number; minutes: Record<string, number | null> },
): Promise<void> {
  const sb = await createClient();
  const { error } = await sb.rpc("save_booking_settings", {
    p_business: businessId,
    p_enabled: s.enabled,
    p_capacity: s.capacity,
    p_notice: s.noticeMinutes,
    p_ahead: s.aheadDays,
    p_minutes: Object.fromEntries(Object.entries(s.minutes).map(([k, v]) => [k, v === null ? "" : String(v)])),
  });
  if (error) throw new Error("Couldn't save your booking settings. Try again.");
}

async function call(fn: string, args: Record<string, unknown>): Promise<Row> {
  const sb = await createClient();
  const { data, error } = await sb.rpc(fn, args);
  if (error) return { kind: error.code === "42501" ? "no_access" : error.code === "P0002" ? "not_found" : "error" };
  return (data ?? {}) as Row;
}

export const dbAddBooking = (businessId: string, b: { serviceId: string; startsAt: string; firstName: string; phone: string | null; force: boolean; claimId?: string }) =>
  call("add_booking", {
    p_business: businessId,
    p_service: b.serviceId,
    p_start: b.startsAt,
    p_first_name: b.firstName,
    p_phone: b.phone,
    p_force: b.force,
    p_claim: b.claimId ?? null,
  });

export const dbMoveBooking = (businessId: string, id: string, startsAt: string, force: boolean) =>
  call("move_booking", { p_business: businessId, p_booking: id, p_start: startsAt, p_force: force });

export const dbCancelBooking = (businessId: string, id: string) => call("cancel_booking", { p_business: businessId, p_booking: id });

export const dbMarkBooking = (businessId: string, id: string, status: "arrived" | "no_show" | "booked") =>
  call("mark_booking", { p_business: businessId, p_booking: id, p_status: status });

export const dbBlockTime = (businessId: string, startsAt: string, endsAt: string, note: string) =>
  call("block_time", { p_business: businessId, p_start: startsAt, p_end: endsAt, p_note: note });

export const dbRemoveBlock = (businessId: string, id: string) => call("remove_block", { p_business: businessId, p_block: id });
