import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { dbPayCheckout } from "@/lib/paylinks-db";
import { initializeSplitTransaction, paystackMode } from "@/lib/paystack";
import { tooMany } from "@/lib/rate-limit";
import { siteUrl } from "@/lib/supabase/env";

// A customer starts paying a pay link (REVENUE_PLAN 5.3). The browser sends only the link and an
// email for Paystack's receipt; the amount, Tikka's share and the business's subaccount come from
// the database. Paystack pays the business; Tikka never holds the money.

const fail = (reason: string, status = 409) => NextResponse.json({ ok: false, reason }, { status, headers: { "Cache-Control": "no-store" } });
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { token?: string; email?: string } | null;
  const token = String(body?.token ?? "");
  const email = String(body?.email ?? "").trim().slice(0, 120);
  if (!/^[a-z0-9]{10}$/.test(token)) return fail("not_found", 404);
  if (!EMAIL.test(email)) return fail("bad_email", 400);
  if (await tooMany(request, "pay", token)) return fail("slow_down", 429);

  const co = await dbPayCheckout(token);
  if (!co) return fail("not_found", 404);
  if (co.status === "paid") return fail("paid");
  if (co.status !== "open") return fail("cancelled");
  if (!co.open) return fail("closed");
  // A link made with the other kind of Paystack key can't be paid here (test vs live).
  if (co.mode !== paystackMode()) return fail("closed");

  const reference = `pl_${token}_${randomBytes(4).toString("hex")}`;
  try {
    const { authorizationUrl } = await initializeSplitTransaction({
      email,
      amountKobo: co.amountKobo,
      tikkaKobo: co.tikkaKobo,
      subaccount: co.subaccount,
      reference,
      callbackUrl: `${siteUrl()}/pay/${token}`,
      metadata: { kind: "pay_link", token },
    });
    return NextResponse.json({ ok: true, url: authorizationUrl }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return fail("paystack", 502);
  }
}
