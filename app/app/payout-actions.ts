"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getBusiness, isDbId } from "@/lib/data";
import { createSubaccount, deactivateSubaccount, listBanks, paystackConfigured, paystackMode, resolveAccount, type Bank } from "@/lib/paystack";
import { dbPayoutState, dbRemovePayout, dbSavePayout } from "@/lib/payouts-db";
import { tooMany } from "@/lib/rate-limit";
import { getOwnerUser } from "@/lib/session";

// Get paid (REVENUE_PLAN 5.3): the owner adds the bank account payments go to. The account name
// always comes from the bank through Paystack, never from the browser; the full account number
// goes to Paystack and only its last 4 digits are kept. The database checks the owner and that
// payments are open for the business again.

const ACCOUNT = /^\d{10}$/;

async function owned() {
  const user = await getOwnerUser();
  const business = user ? await getBusiness(user) : null;
  if (!user || !business || !isDbId(business.id)) return null;
  const state = await dbPayoutState(business.id);
  return state ? { user, business, state } : null;
}

export async function banksAction(): Promise<Bank[]> {
  if (!paystackConfigured() || !(await owned())) return [];
  try {
    return await listBanks();
  } catch {
    return [];
  }
}

export type CheckResult = { kind: "found"; name: string } | { kind: "not_found" | "cant_check" | "bad_number" | "closed" | "slow_down" };

/** Step 1: the name on the account, from the bank. */
export async function checkAccountAction(bankCode: string, accountNumber: string): Promise<CheckResult> {
  const o = await owned();
  if (!o || o.state.problem || !paystackConfigured()) return { kind: "closed" };
  const number = String(accountNumber ?? "").replace(/\D/g, "");
  if (!ACCOUNT.test(number) || typeof bankCode !== "string" || !bankCode) return { kind: "bad_number" };
  if (await tooMany({ headers: await headers() }, "resolve_account", o.business.id)) return { kind: "slow_down" };
  try {
    const name = await resolveAccount(bankCode, number);
    return name ? { kind: "found", name } : { kind: "not_found" };
  } catch {
    return { kind: "cant_check" };
  }
}

export type SaveResult = { kind: "saved"; name: string } | { kind: "closed" | "bad_number" | "not_found" | "failed" | "slow_down" };

/** Step 2: "Yes, this is my account". Creates the Paystack subaccount and saves it. */
export async function savePayoutAction(bankCode: string, accountNumber: string): Promise<SaveResult> {
  const o = await owned();
  if (!o || o.state.problem || !paystackConfigured()) return { kind: "closed" };
  const number = String(accountNumber ?? "").replace(/\D/g, "");
  if (!ACCOUNT.test(number)) return { kind: "bad_number" };
  if (await tooMany({ headers: await headers() }, "resolve_account", o.business.id)) return { kind: "slow_down" };
  const bank = (await listBanks().catch(() => [])).find((b) => b.code === bankCode);
  if (!bank) return { kind: "bad_number" };

  // The name again, from the bank: what the browser showed is never trusted.
  let resolved: string | null = null;
  try {
    resolved = await resolveAccount(bank.code, number);
    if (resolved === null) return { kind: "not_found" };
  } catch {
    // The check couldn't run (it may not be available on this Paystack account): creating the
    // subaccount resolves the name too, and the owner sees it before any money moves.
  }
  let sub: { code: string; accountName: string };
  try {
    sub = await createSubaccount({ businessName: o.business.name, bankCode: bank.code, accountNumber: number });
  } catch {
    return { kind: "failed" };
  }
  const name = (resolved || sub.accountName || "").trim();
  const saved = await dbSavePayout({
    businessId: o.business.id,
    userId: o.user.id,
    bankCode: bank.code,
    bankName: bank.name,
    last4: number.slice(-4),
    accountName: name || "Name not shown by the bank",
    subaccount: sub.code,
    // Test and live subaccounts live in separate worlds at Paystack: remember which this is.
    mode: paystackMode() ?? "test",
  });
  if (saved.kind !== "saved") {
    await deactivateSubaccount(sub.code);
    return { kind: saved.kind === "error" ? "failed" : "closed" };
  }
  if (saved.replaced && saved.replaced !== sub.code) await deactivateSubaccount(saved.replaced);
  revalidatePath("/app/settings/get-paid");
  revalidatePath("/app/settings");
  return { kind: "saved", name };
}

/** Removes the account; its subaccount is switched off at Paystack. */
export async function removePayoutAction(): Promise<{ ok: boolean }> {
  const o = await owned();
  if (!o) return { ok: false };
  const code = await dbRemovePayout(o.business.id).catch(() => null);
  if (code) await deactivateSubaccount(code);
  revalidatePath("/app/settings/get-paid");
  revalidatePath("/app/settings");
  return { ok: true };
}
