import { completePaymentByReference } from "@/lib/data";
import { after } from "next/server";
import { dbCompleteDeposit } from "@/lib/bookings-db";
import { dbCompletePayLink } from "@/lib/paylinks-db";
import { sendBookingAlert, sendPayLinkAlert } from "@/lib/push";
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
      // The first time it's recorded (here or on the return to the pay page), the owner hears about it.
      if (event.data.reference.startsWith("pl_")) {
        const r = await dbCompletePayLink(event.data.reference, event.data.amount, event.data.fees ?? 0, event.data.customer?.email ?? null);
        const id = r.id;
        if (r.kind === "paid" && id) after(() => sendPayLinkAlert(id));
      }
      // Booking deposits (bk_<pass>_…): paying books the held time; the owner hears about it then.
      else if (event.data.reference.startsWith("bk_")) {
        const r = await dbCompleteDeposit(event.data.reference, event.data.amount, event.data.fees ?? 0, event.data.customer?.email ?? null);
        const id = r.id;
        if (r.kind === "paid" && id) after(() => sendBookingAlert(id));
      }
      else await completePaymentByReference(event.data.reference, event.data.amount);
    }
  } catch {}
  return new Response("ok");
}
