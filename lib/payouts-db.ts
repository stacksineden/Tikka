import "server-only";

import { adminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";
import type { IdType, KycStatus, Registered } from "./kyc";

// Get paid (supabase/migrations/20261121100000_get_paid.sql). Who may do what is checked in the
// database; the Paystack calls (lib/paystack.ts) happen in app/app/payout-actions.ts.

export type PayoutProblem = "not_found" | "demo" | "suspended" | "not_enabled" | "not_verified" | "needs_id";

export interface PayoutState {
  problem: PayoutProblem | null;
  maxKobo: number;
  payout: { bankName: string; last4: string; accountName: string; confirmedAt: string; mode: "test" | "live" } | null;
  /** The owner's ID check (supabase/migrations/20261129100000_id_verification.sql), never the documents. */
  kyc: { status: KycStatus; note?: string; idType: IdType; registered: Registered; submittedAt: string } | null;
  /** A business that took payments before ID checks: when its grace ends (only while it's ahead). */
  graceUntil: string | null;
}

/** The owner's Get paid screen (owner only, in SQL). */
export async function dbPayoutState(businessId: string): Promise<PayoutState | null> {
  const sb = await createClient();
  const { data, error } = await sb.rpc("payout_state", { p_business: businessId });
  if (error || !data) return null;
  const r = data as {
    problem: PayoutProblem | null;
    max_kobo: number;
    payout: { bank_name: string; last4: string; account_name: string; confirmed_at: string; mode?: "test" | "live" } | null;
    kyc?: { status: KycStatus; note: string | null; id_type: IdType; registered: Registered; submitted_at: string } | null;
    grace_until?: string | null;
  };
  return {
    problem: r.problem,
    maxKobo: Number(r.max_kobo),
    payout: r.payout
      ? { bankName: r.payout.bank_name, last4: r.payout.last4, accountName: r.payout.account_name, confirmedAt: r.payout.confirmed_at, mode: r.payout.mode ?? "live" }
      : null,
    kyc: r.kyc ? { status: r.kyc.status, note: r.kyc.note ?? undefined, idType: r.kyc.id_type, registered: r.kyc.registered, submittedAt: r.kyc.submitted_at } : null,
    graceUntil: r.grace_until ?? null,
  };
}

/** The bank account can be added once the ID is sent (approval still switches payments on). */
export function bankOpen(state: PayoutState | null): boolean {
  if (!state) return false;
  if (!state.problem) return true;
  return ["not_enabled", "not_verified", "needs_id"].includes(state.problem) && (state.kyc?.status === "submitted" || state.kyc?.status === "approved");
}

/** The owner sends their ID (owner only, in SQL; the files must be in their own `kyc` folder). */
export async function dbSubmitKyc(input: {
  businessId: string;
  idType: IdType;
  idName: string;
  idPhoto: string;
  registered: Registered;
  cacNumber: string | null;
  cacPhoto: string | null;
}): Promise<string> {
  const sb = await createClient();
  const { data, error } = await sb.rpc("submit_kyc", {
    p_business: input.businessId,
    p_id_type: input.idType,
    p_id_name: input.idName,
    p_id_photo: input.idPhoto,
    p_registered: input.registered,
    p_cac_number: input.cacNumber,
    p_cac_photo: input.cacPhoto,
  });
  if (error) return error.code === "42501" ? "no_access" : "error";
  return String((data as { kind?: string } | null)?.kind ?? "error");
}

export interface KycQueueRow {
  businessId: string;
  name: string;
  slug: string;
  category: string;
  area: string;
  city: string;
  createdAt: string;
  verified: boolean;
  enabled: boolean;
  maxKobo: number;
  graceUntil: string | null;
  bank?: { name: string; last4: string; accountName: string };
  kyc: { status: KycStatus; note?: string; idType: IdType; idName: string; idPhoto: string; registered: Registered; cacNumber?: string; cacPhoto?: string; submittedAt: string } | null;
  topService?: { name: string; priceKobo: number };
  topDepositKobo: number;
  whatsapp?: string;
  /** Short-lived links to the documents, for Tikka admin only. */
  idPhotoUrl?: string;
  cacPhotoUrl?: string;
}

/** Admin: everyone with an ID check and every business taking payments without one, with links to the documents. */
export async function dbKycQueue(): Promise<KycQueueRow[]> {
  const sb = await createClient();
  const { data, error } = await sb.rpc("admin_kyc_queue");
  if (error || !data) return [];
  const rows = (data as Record<string, unknown>[]).map((r): KycQueueRow => {
    const k = r.kyc as Record<string, string | null> | null;
    const top = r.top_service as { name: string; price_kobo: number } | null;
    const actions = (r.actions as { kind: string; value: string }[] | null) ?? [];
    return {
      businessId: String(r.business_id),
      name: String(r.name),
      slug: String(r.slug),
      category: String(r.category),
      area: String(r.area),
      city: String(r.city),
      createdAt: String(r.created_at),
      verified: r.verified === true,
      enabled: r.enabled === true,
      maxKobo: Number(r.max_kobo ?? 0),
      graceUntil: (r.grace_until as string | null) ?? null,
      bank: r.account_name ? { name: String(r.bank_name), last4: String(r.last4), accountName: String(r.account_name) } : undefined,
      kyc: k
        ? {
            status: k.status as KycStatus,
            note: k.note ?? undefined,
            idType: k.id_type as IdType,
            idName: String(k.id_name),
            idPhoto: String(k.id_photo),
            registered: k.registered as Registered,
            cacNumber: k.cac_number ?? undefined,
            cacPhoto: k.cac_photo ?? undefined,
            submittedAt: String(k.submitted_at),
          }
        : null,
      topService: top ? { name: top.name, priceKobo: Number(top.price_kobo) } : undefined,
      topDepositKobo: Number(r.top_deposit_kobo ?? 0),
      whatsapp: actions.find((a) => a.kind === "whatsapp")?.value,
    };
  });
  const paths = rows.flatMap((r) => [r.kyc?.idPhoto, r.kyc?.cacPhoto]).filter((x): x is string => !!x);
  if (paths.length) {
    const { data: signed } = await sb.storage.from("kyc").createSignedUrls(paths, 60 * 10);
    const url = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
    for (const r of rows) {
      if (r.kyc?.idPhoto) r.idPhotoUrl = url.get(r.kyc.idPhoto) ?? undefined;
      if (r.kyc?.cacPhoto) r.cacPhotoUrl = url.get(r.kyc.cacPhoto) ?? undefined;
    }
  }
  return rows;
}

/** Admin: approve (Verified, payments on, its maximum) or ask again with a reason the owner sees. */
export async function dbReviewKyc(businessId: string, approve: boolean, note: string | null, maxKobo: number | null): Promise<string> {
  const sb = await createClient();
  const { data, error } = await sb.rpc("admin_review_kyc", { p_business: businessId, p_approve: approve, p_note: note, p_max_kobo: maxKobo });
  if (error) return "error";
  return String((data as { kind?: string } | null)?.kind ?? "error");
}

/** Saves the account once its subaccount exists (server only; the database checks the owner again). */
export async function dbSavePayout(input: {
  businessId: string;
  userId: string;
  bankCode: string;
  bankName: string;
  last4: string;
  accountName: string;
  subaccount: string;
  mode: "test" | "live";
}): Promise<{ kind: string; replaced?: string | null }> {
  const { data, error } = await adminClient().rpc("save_payout", {
    p_business: input.businessId,
    p_user: input.userId,
    p_bank_code: input.bankCode,
    p_bank_name: input.bankName,
    p_last4: input.last4,
    p_account_name: input.accountName,
    p_subaccount: input.subaccount,
    p_mode: input.mode,
  });
  if (error) return { kind: error.code === "42501" ? "no_access" : "error" };
  return data as { kind: string; replaced?: string | null };
}

/** Removes the account (owner only); returns its subaccount code so it can be switched off. */
export async function dbRemovePayout(businessId: string): Promise<string | null> {
  const sb = await createClient();
  const { data, error } = await sb.rpc("remove_payout", { p_business: businessId });
  if (error) throw new Error("Only the owner can remove the account.");
  return ((data as { subaccount?: string | null }) ?? {}).subaccount ?? null;
}

export interface AdminPaymentSetting {
  enabled: boolean;
  maxKobo: number;
  bankName?: string;
  last4?: string;
  accountName?: string;
  mode?: "test" | "live";
}

/** Admin: payments settings and accounts by business id. */
export async function dbAdminPaymentSettings(): Promise<Record<string, AdminPaymentSetting>> {
  const sb = await createClient();
  const { data, error } = await sb.rpc("admin_payment_settings");
  if (error || !data) return {};
  const rows = data as Record<string, { enabled: boolean; max_kobo: number; bank_name: string | null; last4: string | null; account_name: string | null; mode?: "test" | "live" | null }>;
  return Object.fromEntries(
    Object.entries(rows).map(([id, r]) => [
      id,
      { enabled: r.enabled, maxKobo: Number(r.max_kobo), bankName: r.bank_name ?? undefined, last4: r.last4 ?? undefined, accountName: r.account_name ?? undefined, mode: r.mode ?? undefined },
    ]),
  );
}

/** Admin: switch payments on or off for a business, and its maximum per payment. */
export async function dbAdminSetPayments(businessId: string, enabled: boolean | null, maxKobo: number | null): Promise<void> {
  const sb = await createClient();
  const { error } = await sb.rpc("admin_set_payments", { p_business: businessId, p_enabled: enabled, p_max_kobo: maxKobo });
  if (error) throw new Error("Couldn't save the payments setting.");
}

/** Whether the business can make pay links now: payments open and an account of this key's mode. */
export function payReady(state: PayoutState | null, mode: "test" | "live" | null): { ready: boolean; maxKobo: number; why?: "closed" | "no_account" | "account_again" } {
  if (!state || !mode || state.problem) return { ready: false, maxKobo: state?.maxKobo ?? 0, why: "closed" };
  if (!state.payout) return { ready: false, maxKobo: state.maxKobo, why: "no_account" };
  if (state.payout.mode !== mode) return { ready: false, maxKobo: state.maxKobo, why: "account_again" };
  return { ready: true, maxKobo: state.maxKobo };
}

/** Paystack Starter Business: ₦8,000,000 in total, ever. Set PAYSTACK_COLLECTION_LIMIT_NAIRA=0 after upgrading to Registered. */
export function collectionLimitKobo(): number {
  const raw = process.env.PAYSTACK_COLLECTION_LIMIT_NAIRA;
  const n = raw === undefined || raw === "" ? 8_000_000 : Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

export interface AdminMoney {
  dropPaymentsKobo: number;
  payLinksKobo: number;
  depositsKobo: number;
  tikkaKobo: number;
  testKobo: number;
  businesses: {
    id: string;
    name: string;
    slug: string;
    verified: boolean;
    enabled: boolean;
    maxKobo: number;
    bank?: string;
    last4?: string;
    mode?: "test" | "live";
    depositsOn: boolean;
    liveKobo: number;
    linksPaid: number;
    depositsPaid: number;
    lastPaidAt?: string;
  }[];
}

/** Admin: what Tikka's Paystack account has collected, and each business's customer payments. */
export async function dbAdminMoney(): Promise<AdminMoney | null> {
  const sb = await createClient();
  const { data, error } = await sb.rpc("admin_money");
  if (error || !data) return null;
  const r = data as Record<string, unknown>;
  return {
    dropPaymentsKobo: Number(r.drop_payments_kobo ?? 0),
    payLinksKobo: Number(r.pay_links_kobo ?? 0),
    depositsKobo: Number(r.deposits_kobo ?? 0),
    tikkaKobo: Number(r.tikka_kobo ?? 0),
    testKobo: Number(r.test_kobo ?? 0),
    businesses: ((r.businesses as Record<string, unknown>[]) ?? []).map((b) => ({
      id: String(b.id),
      name: String(b.name),
      slug: String(b.slug),
      verified: b.verified === true,
      enabled: b.enabled === true,
      maxKobo: Number(b.max_kobo ?? 0),
      bank: (b.bank as string | null) ?? undefined,
      last4: (b.last4 as string | null) ?? undefined,
      mode: (b.mode as "test" | "live" | null) ?? undefined,
      depositsOn: b.deposits_on === true,
      liveKobo: Number(b.live_kobo ?? 0),
      linksPaid: Number(b.links_paid ?? 0),
      depositsPaid: Number(b.deposits_paid ?? 0),
      lastPaidAt: (b.last_paid_at as string | null) ?? undefined,
    })),
  };
}
