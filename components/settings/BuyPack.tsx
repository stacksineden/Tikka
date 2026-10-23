"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { buyPackAction } from "@/app/app/actions";

/** Opens a pending season pack payment on the server (which sets the price) and goes to pay it. */
export function BuyPack({ packId, label }: { packId: string; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <div className="grid gap-2">
      <button
        type="button"
        className="btn btn-secondary min-h-11 w-full"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await buyPackAction(packId);
            if (!r.ok) return setError(r.error);
            router.push(`/app/pay?payment=${r.paymentId}`);
          })
        }
      >
        {pending && <Loader2 className="animate-spin" />}
        {label}
      </button>
      {error && (
        <p role="alert" className="text-label rounded-md bg-danger-soft px-3 py-2.5 text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
