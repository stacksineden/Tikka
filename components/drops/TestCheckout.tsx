"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { completeTestPayment, startPaystack } from "@/app/app/actions";

/** DEMO ONLY: stands in for Paystack checkout + webhook until the test keys are added. */
export function TestCheckout({ paymentId, label }: { paymentId: string; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <div className="grid gap-3">
      <button
        type="button"
        className="btn btn-lg w-full"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await completeTestPayment(paymentId);
            if (!res.ok || !res.next) return setError(res.error ?? "Payment didn't go through.");
            router.push(res.next);
          })
        }
      >
        {pending && <Loader2 className="animate-spin" />}
        {pending ? "Confirming payment…" : label}
      </button>
      {error && (
        <p role="alert" className="text-label rounded-md bg-danger-soft px-3 py-2.5 text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** Sends the owner to Paystack's checkout (card or bank transfer). */
export function PaystackCheckout({ paymentId, label }: { paymentId: string; label: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <div className="grid gap-3">
      <button
        type="button"
        className="btn btn-lg w-full"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await startPaystack(paymentId);
            if (!res.ok) return setError(res.error);
            window.location.assign(res.url);
          })
        }
      >
        {pending && <Loader2 className="animate-spin" />}
        {pending ? "Opening Paystack…" : label}
      </button>
      {error && (
        <p role="alert" className="text-label rounded-md bg-danger-soft px-3 py-2.5 text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
