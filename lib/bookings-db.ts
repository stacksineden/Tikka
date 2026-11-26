import "server-only";

import type { Booking, BookingRules, BookingSetup, DepositSettings, ServiceDepositMode } from "./bookings";
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
    depositPaidKobo: r.deposit_paid_kobo == null ? undefined : Number(r.deposit_paid_kobo),
    priceKobo: r.price_kobo == null ? undefined : Number(r.price_kobo),
    priceKind: (r.price_kind as Booking["priceKind"]) ?? undefined,
    depositCounts: r.deposit_counts == null ? undefined : r.deposit_counts === true,
    // Booking with choices (booking_choices migration): the address reaches owners only.
    homeArea: (r.home_area as string | null) ?? undefined,
    detail: (r.detail as string | null) ?? undefined,
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

export type BookResult = { kind: "booked" | "already" | "pay"; token: string; code?: string; id?: string; deposit_kobo?: number } | { kind: string };

/** book_time(): server only, after the route's rate limits. */
export async function dbBookTime(input: {
  businessId: string;
  serviceId: string;
  startsAt: string;
  firstName: string;
  phone: string;
  futureOffers: boolean;
  visitorId: string;
  mode: "test" | "live" | null;
  email: string | null;
}): Promise<BookResult> {
  const { data, error } = await adminClient().rpc("book_time", {
    p_business: input.businessId,
    p_service: input.serviceId,
    p_start: input.startsAt,
    p_first_name: input.firstName,
    p_phone: input.phone,
    p_future: input.futureOffers,
    p_visitor: input.visitorId,
    p_mode: input.mode,
    p_email: input.email,
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
  /** Deposits: what it takes, what was paid, the price when booked, and whether the 10-minute hold is live. */
  depositKobo?: number;
  depositPaidKobo?: number;
  depositCounts?: boolean;
  priceKobo?: number;
  priceKind?: string;
  holdLive?: boolean;
  /** Booked with a Tikka: its card link (code and QR for the counter), its reward, and whether it's used. */
  tikka?: { token: string; reward: string; used: boolean };
  /** A home visit's address (the demo; real passes say only that it's a home visit), and what was picked. */
  homeArea?: string;
  home?: boolean;
  detail?: string;
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
    depositKobo: r.deposit_kobo == null ? undefined : Number(r.deposit_kobo),
    depositPaidKobo: r.deposit_paid_kobo == null ? undefined : Number(r.deposit_paid_kobo),
    depositCounts: r.deposit_counts == null ? undefined : r.deposit_counts === true,
    priceKobo: r.price_kobo == null ? undefined : Number(r.price_kobo),
    priceKind: (r.price_kind as string | null) ?? undefined,
    holdLive: r.hold_live === true,
    tikka: r.tikka_token ? { token: String(r.tikka_token), reward: String(r.tikka_reward ?? ""), used: r.tikka_used === true } : undefined,
    home: r.home === true,
    detail: (r.detail as string | null) ?? undefined,
  };
}

/* ------------------------------------------------ booking with choices (docs/DB_MOVE.md step 2) */

export interface ChoiceInput {
  option?: number;
  people?: number[];
  extras?: number[];
  home?: boolean;
}

/** book_time_v2(): Postgres prices the picks and works out the deposit. Server only, after the route's rate limits. */
export async function dbBookTimeV2(input: {
  businessId: string;
  serviceId: string;
  startsAt: string;
  firstName: string;
  phone: string;
  choice: ChoiceInput;
  address?: string;
  area?: string;
  answers?: string;
  futureOffers: boolean;
  visitorId: string;
  mode: "test" | "live" | null;
  email: string | null;
}): Promise<BookResult> {
  const { data, error } = await adminClient().rpc("book_time_v2", {
    p_business: input.businessId,
    p_service: input.serviceId,
    p_start: input.startsAt,
    p_first_name: input.firstName,
    p_phone: input.phone,
    p_choice: input.choice,
    p_address: input.address ?? null,
    p_area: input.area ?? null,
    p_answers: input.answers ?? null,
    p_future: input.futureOffers,
    p_visitor: input.visitorId,
    p_mode: input.mode,
    p_email: input.email,
  });
  if (error) return { kind: "error" };
  return data as BookResult;
}

export interface ServerPrice {
  totalKobo: number;
  depositKobo: number;
  depositCounts: boolean;
  minutes: number;
  gapMinutes: number;
}

/** price_booking(): what the sheet shows before Pay, the same sums book_time_v2() charges. Public. */
export async function dbPriceBooking(businessId: string, serviceId: string, choice: ChoiceInput, mode: "test" | "live" | null): Promise<ServerPrice | null> {
  const { data, error } = await adminClient().rpc("price_booking", { p_business: businessId, p_service: serviceId, p_choice: choice, p_mode: mode });
  if (error || !data) return null;
  const r = data as Row;
  return {
    totalKobo: Number(r.total_kobo),
    depositKobo: Number(r.deposit_kobo),
    depositCounts: r.deposit_counts === true,
    minutes: Number(r.minutes),
    gapMinutes: Number(r.gap_minutes ?? 0),
  };
}

/** change_from_pass(): move (24 hours' notice, the deposit stays) or cancel (no refund). Server only. */
export async function dbChangeFromPass(token: string, change: { kind: "cancel" } | { kind: "move"; startsAt: string }): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!/^[0-9a-f]{24}$/.test(token)) return { ok: false, reason: "not_found" };
  const { data, error } = await adminClient().rpc("change_from_pass", {
    p_token: token,
    p_kind: change.kind,
    p_start: change.kind === "move" ? change.startsAt : null,
  });
  if (error || !data) return { ok: false, reason: "error" };
  const kind = String((data as Row).kind);
  return kind === "moved" || kind === "cancelled" ? { ok: true } : { ok: false, reason: kind };
}

/** What moving from the pass needs: the business, the booking's own time and gap, and whether it's an event day. */
export async function dbPassBooking(token: string): Promise<{ slug: string; minutes: number; gap: number; eventDay: boolean; startsAt: string } | null> {
  if (!/^[0-9a-f]{24}$/.test(token)) return null;
  const { data, error } = await adminClient().rpc("booking_pass", { p_token: token });
  if (error || !data) return null;
  const r = data as Row;
  return { slug: String(r.business_slug), minutes: Number(r.minutes), gap: Number(r.gap_minutes ?? 0), eventDay: r.event_day === true, startsAt: String(r.starts_at) };
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
    deposit: r.deposit
      ? {
          mode: ((r.deposit as Row).mode as DepositSettings["mode"]) ?? "off",
          percent: (r.deposit as Row).percent == null ? undefined : Number((r.deposit as Row).percent),
          fixedKobo: (r.deposit as Row).fixed_kobo == null ? undefined : Number((r.deposit as Row).fixed_kobo),
          counts: (r.deposit as Row).counts !== false,
        }
      : undefined,
    serviceDeposits: Object.fromEntries(
      Object.entries((r.service_deposits as Record<string, { mode: ServiceDepositMode; kobo: number | null }>) ?? {}).map(([id, d]) => [id, { mode: d.mode, kobo: d.kobo ?? undefined }]),
    ),
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

export interface BookingLeadRow {
  lead_id: string;
  first_name: string;
  phone: string;
  phone_confirmed: boolean;
  marketing_opt_in: boolean;
  first_seen_at: string;
  claims_count: number;
  sources: string[] | null;
  bookings: number;
  came: number;
  last_at: string;
  next: { starts_at: string; service: string; code: string; claim_id: string | null } | null;
}

/** Everyone who booked, one per person (owner only, in SQL). */
export async function dbBookingLeads(businessId: string): Promise<BookingLeadRow[]> {
  const sb = await createClient();
  const { data, error } = await sb.rpc("get_booking_leads", { p_business: businessId });
  if (error) return [];
  return (data ?? []) as BookingLeadRow[];
}

export interface TikkaInfo {
  businessId: string;
  firstName: string;
  expiresAt: string;
  redeemed: boolean;
  reward: string;
  booking: { viewToken: string; startsAt: string; service: string } | null;
}

/** A Tikka and its booking, by the card's link (server only). */
export async function dbTikkaInfo(token: string): Promise<TikkaInfo | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const { data, error } = await adminClient().rpc("tikka_booking_info", { p_view_token: token });
  if (error || !data) return null;
  const r = data as Row;
  const b = r.booking as Row | null;
  return {
    businessId: String(r.business_id),
    firstName: String(r.first_name),
    expiresAt: String(r.expires_at),
    redeemed: r.redeemed === true,
    reward: String(r.reward ?? ""),
    booking: b ? { viewToken: String(b.view_token), startsAt: String(b.starts_at), service: String(b.service) } : null,
  };
}

/** book_for_claim(): the claimer books a time to use their Tikka (server only). */
export async function dbBookForClaim(token: string, serviceId: string, startsAt: string): Promise<BookResult> {
  const { data, error } = await adminClient().rpc("book_for_claim", { p_view_token: token, p_service: serviceId, p_start: startsAt });
  if (error) return { kind: error.code === "P0002" ? "not_found" : "error" };
  return data as BookResult;
}

/** A BK- code at the counter (team only, never the number). */
export async function dbCheckBookingCode(businessId: string, code: string): Promise<Row> {
  const sb = await createClient();
  const { data, error } = await sb.rpc("check_booking_code", { p_business: businessId, p_code: code });
  if (error) return { kind: "no_access" };
  return (data ?? { kind: "unknown" }) as Row;
}

/* ------------------------------------------------- deposits (REVENUE_PLAN 5.4) */

/** Each service's deposit (kobo) for the booking sheet and the business page. Public; amounts only. */
export async function dbBookingDeposits(businessId: string, mode: "test" | "live" | null): Promise<{ counts: boolean; services: Record<string, number> }> {
  if (!mode) return { counts: true, services: {} };
  const sb = await createClient();
  const { data, error } = await sb.rpc("booking_deposits", { p_business: businessId, p_mode: mode });
  if (error || !data) return { counts: true, services: {} };
  const r = data as { counts: boolean; services: Record<string, number> };
  return { counts: r.counts !== false, services: Object.fromEntries(Object.entries(r.services ?? {}).map(([k, v]) => [k, Number(v)])) };
}

export interface DepositCheckout {
  id: string;
  status: string;
  depositKobo: number;
  tikkaKobo: number;
  subaccount: string | null;
  mode: "test" | "live" | null;
  email: string | null;
  holdLive: boolean;
  businessName: string;
  /** The business may take payments right now (private.payments_problem()). */
  paymentsOk: boolean;
}

export async function dbDepositCheckout(token: string): Promise<DepositCheckout | null> {
  if (!/^[0-9a-f]{24}$/.test(token)) return null;
  const { data, error } = await adminClient().rpc("booking_checkout", { p_token: token });
  if (error || !data) return null;
  const r = data as Row;
  return {
    id: String(r.id),
    status: String(r.status),
    depositKobo: Number(r.deposit_kobo ?? 0),
    tikkaKobo: Number(r.tikka_kobo ?? 0),
    subaccount: (r.subaccount as string | null) ?? null,
    mode: (r.mode as "test" | "live" | null) ?? null,
    email: (r.email as string | null) ?? null,
    holdLive: r.hold_live === true,
    businessName: String(r.business_name),
    paymentsOk: r.payments_ok !== false,
  };
}

export async function dbRehold(token: string): Promise<string> {
  const { data, error } = await adminClient().rpc("rehold_booking", { p_token: token });
  if (error) return "error";
  return String((data as Row)?.kind ?? "error");
}

export async function dbCompleteDeposit(reference: string, amountKobo: number, feeKobo: number, email: string | null): Promise<{ kind: string; id?: string }> {
  const { data, error } = await adminClient().rpc("complete_booking_deposit", { p_reference: reference, p_amount_kobo: amountKobo, p_fee_kobo: feeKobo, p_email: email });
  if (error) return { kind: "error" };
  return data as { kind: string; id?: string };
}

export async function dbSaveDepositSettings(
  businessId: string,
  s: { mode: DepositSettings["mode"]; percent: number | null; fixedKobo: number | null; counts: boolean; services: Record<string, { mode: ServiceDepositMode | null; kobo?: number | null }> },
): Promise<string> {
  const sb = await createClient();
  const { data, error } = await sb.rpc("save_deposit_settings", {
    p_business: businessId,
    p_mode: s.mode,
    p_percent: s.percent,
    p_fixed_kobo: s.fixedKobo,
    p_counts: s.counts,
    p_services: s.services,
  });
  if (error) return "error";
  return String((data as Row)?.kind ?? "error");
}

export interface DepositPaid {
  id: string;
  firstName: string;
  service: string;
  startsAt: string;
  status: string;
  paidKobo: number;
  feeKobo: number;
  tikkaKobo: number;
  paidAt: string;
  mode: "test" | "live";
}

/** Deposits paid, for the Money screen (owner only). */
export async function dbDeposits(businessId: string): Promise<DepositPaid[]> {
  const sb = await createClient();
  const { data, error } = await sb.rpc("get_deposits", { p_business: businessId, p_limit: 200 });
  if (error) return [];
  return ((data ?? []) as Row[]).map((r) => ({
    id: String(r.id),
    firstName: String(r.first_name),
    service: String(r.service),
    startsAt: String(r.starts_at),
    status: String(r.status),
    paidKobo: Number(r.paid_kobo ?? 0),
    feeKobo: Number(r.fee_kobo ?? 0),
    tikkaKobo: Number(r.tikka_kobo ?? 0),
    paidAt: String(r.paid_at),
    mode: (r.mode as "test" | "live") ?? "live",
  }));
}
