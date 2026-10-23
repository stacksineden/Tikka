import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { ConfirmPayment } from "@/components/drops/ConfirmPayment";
import { getPayment } from "@/lib/data";
import { paymentPlace } from "@/lib/payments";
import { getOwnerUser } from "@/lib/session";

export const metadata: Metadata = { title: "Confirming payment" };

// Paystack's callback_url (TECH_PLAN §11): the owner lands here after paying.
async function Confirm({ searchParams }: PageProps<"/app/pay/confirm">) {
  const user = await getOwnerUser();
  if (!user) redirect("/app/redeem");
  const sp = await searchParams;
  const payment = await getPayment(user, typeof sp.payment === "string" ? sp.payment : "");
  if (!payment) notFound();
  return <ConfirmPayment paymentId={payment.id} back={paymentPlace(payment).back} />;
}

export default function Page(props: PageProps<"/app/pay/confirm">) {
  return (
    <div className="mx-auto grid max-w-xl gap-5 px-4 pb-10 pt-10 sm:px-6">
      <Suspense fallback={<div className="h-48 rounded-card bg-surface-sunken" />}>
        <Confirm {...props} />
      </Suspense>
    </div>
  );
}
