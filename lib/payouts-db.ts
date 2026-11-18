import "server-only";

import { adminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";

// Get paid (supabase/migrations/20261121100000_get_paid.sql). Who may do what is checked in the
// database; the Paystack calls (lib/paystack.ts) happen in app/app/payout-actions.ts.

export type PayoutProblem = "not_found" | "demo" | "suspended" | "not_enabled" | "not_verified";

export interface PayoutState {
  problem: PayoutProblem | null;
  maxKobo: number;
  payout: { bankName: string; last4: string; accountName: string; confirmedAt: string; mode: "test" | "live" } | null;
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
  };
  return {
    problem: r.problem,
    maxKobo: Number(r.max_kobo),
    payout: r.payout
      ? { bankName: r.payout.bank_name, last4: r.payout.last4, accountName: r.payout.account_name, confirmedAt: r.payout.confirmed_at, mode: r.payout.mode ?? "live" }
      : null,
  };
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
