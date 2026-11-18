import "server-only";

import { randomBytes } from "node:crypto";
import { dbDepositCheckout, dbRehold } from "./bookings-db";
import { initializeSplitTransaction, paystackMode } from "./paystack";
import { siteUrl } from "./supabase/env";

// Starting (or restarting) a booking's deposit checkout (REVENUE_PLAN 5.4). Everything comes from
// the booking: the amount, Tikka's 1%, the subaccount and the email given when the time was held.
// A lapsed 10-minute hold is held again first, if the time is still free.

export type StartResult = { kind: "url"; url: string } | { kind: "paid" | "taken" | "not_found" | "closed" | "paystack" };

export async function startDepositCheckout(token: string): Promise<StartResult> {
  let co = await dbDepositCheckout(token);
  if (!co) return { kind: "not_found" };
  if (co.status !== "held") return { kind: co.status === "booked" || co.status === "arrived" ? "paid" : "taken" };
  if (!co.holdLive) {
    const r = await dbRehold(token);
    if (r !== "held") return { kind: r === "taken" ? "taken" : "not_found" };
    co = (await dbDepositCheckout(token)) ?? co;
  }
  if (!co.subaccount || !co.email || co.depositKobo <= 0 || co.mode !== paystackMode()) return { kind: "closed" };
  try {
    const { authorizationUrl } = await initializeSplitTransaction({
      email: co.email,
      amountKobo: co.depositKobo,
      tikkaKobo: co.tikkaKobo,
      subaccount: co.subaccount,
      reference: `bk_${token}_${randomBytes(4).toString("hex")}`,
      callbackUrl: `${siteUrl()}/bk/${token}`,
      metadata: { kind: "booking_deposit", token },
    });
    return { kind: "url", url: authorizationUrl };
  } catch {
    return { kind: "paystack" };
  }
}
