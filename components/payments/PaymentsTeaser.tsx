"use client";

import { Wallet, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { dismissPaymentsAction } from "@/app/payments-actions";

// The dashboard Home card for deposits and pay links (REVENUE_PLAN 5.3–5.4): shown to owners who
// haven't added the bank account payments go to yet, and hidden once they do or tap X.

/** The dashboard Home card: what deposits do, a way to set them up, and a way to hide it (owners only). */
export function PaymentsCard() {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <aside aria-label="Take deposits" className="relative grid gap-3 rounded-card border border-line bg-surface-raised p-4 pr-14">
      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-brand-soft text-brand">
        <Wallet size={20} aria-hidden="true" />
      </span>
      <p className="text-body">
        <span className="font-semibold">Take deposits when customers book,</span> so no-shows don&apos;t cost you. Add your bank account and the money
        goes there the next working day. Tikka takes 1%, only when customers pay you.
      </p>
      <Link href="/app/settings/get-paid" className="btn btn-secondary min-h-11 justify-self-start text-label">
        Set up deposits
      </Link>
      <button
        type="button"
        onClick={() => {
          setHidden(true);
          void dismissPaymentsAction();
        }}
        className="absolute right-2 top-2 grid size-11 place-items-center rounded-md text-ink-muted hover:bg-surface-sunken"
        aria-label="Hide this"
      >
        <X size={18} aria-hidden="true" />
      </button>
    </aside>
  );
}
