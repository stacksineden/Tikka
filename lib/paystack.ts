import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

// Paystack for drop payments (TECH_PLAN §11). Server-side only: the secret key never reaches
// the browser, and amounts always come from the drop_payments row, never from a request.

const API = "https://api.paystack.co";

function secret(): string | undefined {
  return process.env.PAYSTACK_SECRET_KEY || undefined;
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
