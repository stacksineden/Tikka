"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { pollPayment } from "@/app/app/actions";

/**
 * Back from Paystack: watch the payment until the webhook marks it paid (2 s polling until
 * Realtime). Still pending after 10 s → ask the server to run Paystack's verify as a fallback.
 * Bank transfers can take minutes; the webhook finishes them whenever it arrives.
 */
export function ConfirmPayment({ paymentId, back }: { paymentId: string; back: { href: string; label: string } }) {
  const router = useRouter();
  const [state, setState] = useState<"waiting" | "slow" | "failed" | "abandoned">("waiting");

  useEffect(() => {
    let stop = false;
    const started = Date.now();
    let verified = false;
    async function tick() {
      if (stop) return;
      const late = Date.now() - started > 10_000;
      const r = await pollPayment(paymentId, late && !verified).catch(() => null);
      if (late) verified = true;
      if (stop) return;
      if (r?.status === "paid" && r.next) return router.replace(r.next);
      if (r?.status === "failed" || r?.status === "abandoned") return setState(r.status);
      if (late) setState("slow");
      setTimeout(tick, late ? 5000 : 2000);
    }
    tick();
    return () => {
      stop = true;
    };
  }, [paymentId, router]);

  if (state === "failed" || state === "abandoned") {
    return (
      <div className="rounded-card bg-danger-soft p-5 text-danger" role="alert">
        <p className="text-body font-semibold">
          {state === "failed" ? "That payment didn't go through, so nothing changed." : "That payment wasn't finished, so nothing was charged."}
        </p>
        <Link href={back.href} className="btn btn-secondary mt-4">
          {back.label}
        </Link>
      </div>
    );
  }
  return (
    <div className="grid justify-items-center gap-3 rounded-card border border-line bg-surface-raised p-8 text-center" role="status">
      <Loader2 className="size-8 animate-spin text-brand" aria-hidden="true" />
      <p className="text-title">Confirming payment…</p>
      <p className="text-body max-w-sm text-ink-muted">
        {state === "slow"
          ? "Still waiting for Paystack. Bank transfers can take a few minutes. You can leave this page: everything updates by itself once the money lands."
          : "This takes a few seconds."}
      </p>
      {state === "slow" && (
        <Link href="/app/drops" className="btn btn-secondary mt-2">
          Go to your drops
        </Link>
      )}
    </div>
  );
}
