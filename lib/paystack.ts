import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

// Paystack for drop payments (TECH_PLAN §11). Server-side only: the secret key never reaches
// the browser, and amounts always come from the drop_payments row, never from a request.

const API = "https://api.paystack.co";

function secret(): string | undefined {
  return process.env.PAYSTACK_SECRET_KEY || undefined;
}

/** Which Paystack world the key belongs to: test and live subaccounts don't see each other. */
export function paystackMode(): "test" | "live" | null {
  const k = secret();
  return !k ? null : k.startsWith("sk_live_") ? "live" : "test";
}

/** Until the keys are added, the pay page shows the demo checkout instead. */
export function paystackConfigured(): boolean {
  return Boolean(secret());
}

/** x-paystack-signature: HMAC-SHA512 of the raw body with the secret key. */
export function verifySignature(rawBody: string, signature: string | null, key = secret()): boolean {
  if (!key || !signature) return false;
  const expected = createHmac("sha512", key).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const key = secret();
  if (!key) throw new Error("Paystack isn't configured");
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  const json = (await res.json()) as { status: boolean; message: string; data: T };
  if (!res.ok || !json.status) throw new Error(json.message || `Paystack ${res.status}`);
  return json.data;
}

/** Starts a checkout for card or bank transfer. Returns the page to send the owner to. */
export async function initializeTransaction(input: {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl: string;
  metadata: Record<string, string>;
}): Promise<{ authorizationUrl: string }> {
  const data = await call<{ authorization_url: string }>("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      amount: input.amountKobo,
      currency: "NGN",
      reference: input.reference,
      callback_url: input.callbackUrl,
      channels: ["card", "bank_transfer"],
      metadata: input.metadata,
    }),
  });
  return { authorizationUrl: data.authorization_url };
}

/** The verify fallback: what Paystack says happened to a reference. */
export async function verifyTransaction(reference: string): Promise<{ status: string; amountKobo: number }> {
  const data = await call<{ status: string; amount: number }>(`/transaction/verify/${encodeURIComponent(reference)}`);
  return { status: data.status, amountKobo: data.amount };
}

/* ------------------------------------------------- Get paid (REVENUE_PLAN 5.3) */

export interface Bank {
  code: string;
  name: string;
}

let banksCache: { at: number; banks: Bank[] } | null = null;

/** Nigerian banks that can receive payouts. Cached for a day. */
export async function listBanks(): Promise<Bank[]> {
  if (banksCache && Date.now() - banksCache.at < 86_400_000) return banksCache.banks;
  const data = await call<{ code: string; name: string; active: boolean; is_deleted: boolean | null; currency: string }[]>(
    "/bank?country=nigeria&currency=NGN&perPage=200",
  );
  const seen = new Set<string>();
  const banks = data
    .filter((b) => b.active && !b.is_deleted && b.currency === "NGN" && !seen.has(b.code) && seen.add(b.code))
    .map((b) => ({ code: b.code, name: b.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  banksCache = { at: Date.now(), banks };
  return banks;
}

/**
 * The name on a bank account, from the bank (Paystack's Resolve Account Number; free).
 * `null` when the bank says there's no such account; throws when the check itself couldn't run.
 */
export async function resolveAccount(bankCode: string, accountNumber: string): Promise<string | null> {
  const key = secret();
  if (!key) throw new Error("Paystack isn't configured");
  const res = await fetch(`${API}/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as { status: boolean; message?: string; data?: { account_name: string } } | null;
  if (json?.status && json.data?.account_name) return json.data.account_name;
  // 422/400: the bank couldn't find it. Anything else: the check didn't run.
  if (res.status === 422 || res.status === 400) return null;
  throw new Error(json?.message || `Paystack ${res.status}`);
}

/**
 * A subaccount for the business's account: payments split to it pay out to that bank the next
 * working day; `percentage_charge` is the share kept by Tikka's main account (1%).
 */
export async function createSubaccount(input: { businessName: string; bankCode: string; accountNumber: string }): Promise<{ code: string; accountName: string }> {
  const data = await call<{ subaccount_code: string; account_name?: string }>("/subaccount", {
    method: "POST",
    body: JSON.stringify({
      business_name: input.businessName.slice(0, 100),
      settlement_bank: input.bankCode,
      bank_code: input.bankCode,
      account_number: input.accountNumber,
      percentage_charge: 1,
      description: "Tikka business",
    }),
  });
  return { code: data.subaccount_code, accountName: data.account_name ?? "" };
}

/** Switches an old subaccount off (a changed or removed account). Never throws. */
export async function deactivateSubaccount(code: string): Promise<void> {
  try {
    await call(`/subaccount/${encodeURIComponent(code)}`, { method: "PUT", body: JSON.stringify({ active: false }) });
  } catch {
    // Nothing is split to it any more; switching it off is tidiness.
  }
}
