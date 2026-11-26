"use client";

import { Check, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { payDemoLinkAction } from "@/app/app/paylink-actions";

/** DEMO: stands in for Paystack on a demo pay link, like the demo deposit in the booking sheet. */
export function DemoPayButton({ token, label }: { token: string; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return (
    <>
      <button
        type="button"
        className="biz-btn min-h-[52px] w-full bg-ink text-surface-raised"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await payDemoLinkAction(token);
            if (r.kind === "paid" || r.kind === "already") router.refresh();
            else setError("This pay link can't be paid any more.");
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />} {label}
      </button>
      <p className="text-caption text-ink-muted">Demo: no money moves. Tapping pretends the customer paid.</p>
      {error && (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      )}
    </>
  );
}
