"use client";

import { Check, Loader2, Wallet, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { dismissPaymentsAction, joinPaymentsAction } from "@/app/payments-actions";

// "Coming soon: payments and deposits" (docs/REVENUE_PLAN.md item 6). A teaser only: never shown as
// working, no sample payments. The words are the plan's.

export const PAYMENTS_TEASER = "Coming soon: take deposits when customers book, so no-shows don't cost you. A small fee only when customers pay you.";

/** "Get early access": joins at once when an owner is signed in; signed out, it goes to sign-up. */
export function PaymentsJoin({ onList: initial = false, variant = "secondary" }: { onList?: boolean; variant?: "primary" | "secondary" }) {
  const router = useRouter();
  const [onList, setOnList] = useState(initial);
  const [note, setNote] = useState<string>();
  const [pending, start] = useTransition();
  if (onList) {
    return (
      <p role="status" className="text-label inline-flex min-h-11 items-center gap-1.5 text-success">
        <Check size={18} aria-hidden="true" />
        Joined. We&apos;ll tell you first.
      </p>
    );
  }
  return (
    <div className="grid justify-items-start gap-1">
      <button
        type="button"
        className={`btn ${variant === "secondary" ? "btn-secondary" : ""} min-h-11 text-label`}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await joinPaymentsAction();
            if (r.ok) return setOnList(true);
            if (r.reason === "signed_out") return router.push("/sign-up");
            setNote(r.reason === "not_owner" ? "Ask the business owner to join." : "That didn't go through. Try again.");
          })
        }
      >
        {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
        Get early access
      </button>
      {note && <p className="text-caption text-ink-muted">{note}</p>}
    </div>
  );
}

/** The dashboard Home card: the teaser, Get early access, and a way to hide it (owners only). */
export function PaymentsCard({ onList, canAct }: { onList: boolean; canAct: boolean }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <aside aria-label="Payments and deposits, coming soon" className="relative grid gap-3 rounded-card border border-dashed border-brand/40 bg-surface-raised p-4 pr-14">
      <span className="flex items-center gap-2">
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-brand-soft text-brand">
          <Wallet size={20} aria-hidden="true" />
        </span>
        <span className="text-caption rounded-pill border border-brand/40 px-2 py-0.5 font-semibold text-brand">Coming soon</span>
      </span>
      <p className="text-body">
        <span className="font-semibold">Take deposits when customers book,</span> so no-shows don&apos;t cost you. A small fee only when customers pay you.
      </p>
      {canAct ? <PaymentsJoin onList={onList} /> : onList && <PaymentsJoin onList />}
      {canAct && (
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
      )}
    </aside>
  );
}
