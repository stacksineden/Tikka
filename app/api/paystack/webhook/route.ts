import { completePaymentByReference } from "@/lib/data";
import { dbCompletePayLink } from "@/lib/paylinks-db";
import { verifySignature } from "@/lib/paystack";

// Paystack webhook (TECH_PLAN §11). Only signed requests count; repeats are harmless because
// complete_drop_payment is idempotent and checks the amount against the payment row.
export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifySignature(raw, request.headers.get("x-paystack-signature"))) return new Response("Invalid signature", { status: 401 });
  try {
    const event = JSON.parse(raw) as { event?: string; data?: { reference?: string; amount?: number; fees?: number | null; customer?: { email?: string } } };
    if (event.event === "charge.success" && event.data?.reference && typeof event.data.amount === "number") {
      // Pay links (pl_<token>_…): complete_pay_link is idempotent and checks the amount too.
      if (event.data.reference.startsWith("pl_")) await dbCompletePayLink(event.data.reference, event.data.amount, event.data.fees ?? 0, event.data.customer?.email ?? null);
      else await completePaymentByReference(event.data.reference, event.data.amount);
    }
  } catch {}
  return new Response("ok");
}
