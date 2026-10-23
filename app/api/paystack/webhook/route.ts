import { completePaymentByReference } from "@/lib/data";
import { verifySignature } from "@/lib/paystack";

// Paystack webhook (TECH_PLAN §11). Only signed requests count; repeats are harmless because
// complete_drop_payment is idempotent and checks the amount against the payment row.
export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifySignature(raw, request.headers.get("x-paystack-signature"))) return new Response("Invalid signature", { status: 401 });
  try {
    const event = JSON.parse(raw) as { event?: string; data?: { reference?: string; amount?: number } };
    if (event.event === "charge.success" && event.data?.reference && typeof event.data.amount === "number") {
      await completePaymentByReference(event.data.reference, event.data.amount);
    }
  } catch {}
  return new Response("ok");
}
