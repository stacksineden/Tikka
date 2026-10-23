"use client";

import { Loader2, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { addTikkasAction } from "@/app/app/actions";
import { count } from "@/lib/format";
import { priceLabel, quoteAddTikkas, type DropTier } from "@/lib/pricing";

const PRESETS = [100, 250, 500];

/**
 * "Add more Tikkas" (TECH_PLAN §11): free while the drop's tier has room, otherwise an upgrade
 * for the difference. The quote here is a preview; the server prices it again.
 */
export function AddTikkas({ dropId, total, tier, tiers }: { dropId: string; total: number; tier: DropTier; tiers: DropTier[] }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [extra, setExtra] = useState(100);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const q = extra >= 1 ? quoteAddTikkas(tiers, tier, total, extra) : null;
  const room = tier.maxCards - total;

  function submit() {
    setError(undefined);
    start(async () => {
      const r = await addTikkasAction(dropId, extra);
      if (!r.ok) return setError(r.error);
      // Close the modal before leaving: Next keeps this page mounted (hidden) for Back, and an
      // open modal dialog would leave the next page inert.
      ref.current?.close();
      setOpen(false);
      if (r.kind === "payment") return router.push(`/app/pay?payment=${r.paymentId}`);
      router.replace(`/app/drops/${dropId}?added=${r.extra}`);
    });
  }

  return (
    <>
      <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>
        <Plus />
        Add more Tikkas
      </button>
      <dialog
        ref={ref}
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        aria-labelledby="add-h"
        className="sheet m-0 mt-auto w-full max-w-none bg-transparent p-0 sm:m-auto sm:max-w-md"
      >
        <div className="rounded-t-[24px] bg-surface-raised px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-3 text-ink sm:rounded-card sm:p-6">
          <div className="mx-auto mb-3 h-1 w-10 rounded-pill bg-line-strong/40 sm:hidden" aria-hidden="true" />
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="add-h" className="text-title">
                Add more Tikkas
              </h2>
              <p className="text-body mt-1 text-ink-muted">
                They join the end of the drop in the same mix. Your {tier.label.toLowerCase()} has room for {count(Math.max(0, room))} more free.
              </p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="grid size-11 shrink-0 place-items-center rounded-pill bg-surface-sunken text-ink-muted" aria-label="Close">
              <X size={20} aria-hidden="true" />
            </button>
          </div>

          <label htmlFor="add-extra" className="text-label mt-5 block">
            How many more?
          </label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <input
              id="add-extra"
              inputMode="numeric"
              value={extra ? String(extra) : ""}
              onChange={(e) => setExtra(Number(e.target.value.replace(/\D/g, "").slice(0, 4)) || 0)}
              className="input w-28 text-center text-[17px] font-semibold tabular-nums"
            />
            {PRESETS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setExtra(n)}
                aria-pressed={extra === n}
                className={`min-h-11 rounded-pill border px-4 text-label ${extra === n ? "border-brand bg-brand-soft text-brand" : "border-line text-ink"}`}
              >
                +{n}
              </button>
            ))}
          </div>

          <div
            className={`mt-4 rounded-md px-3 py-2.5 text-label ${
              !q ? "bg-surface-sunken text-ink-muted" : q.kind === "free" ? "bg-success-soft text-success" : q.kind === "contact" ? "bg-danger-soft text-danger" : "bg-surface-sunken text-ink"
            }`}
            aria-live="polite"
          >
            {!q
              ? "Enter how many to add."
              : q.kind === "free"
                ? `${count(total + extra)} Tikkas in all. Free: it fits your ${tier.label.toLowerCase()}.`
                : q.kind === "contact"
                  ? `For drops over ${count(q.maxSelfServe)} Tikkas, talk to us.`
                  : `${count(total + extra)} Tikkas in all · ${q.from.label} → ${q.to.label} · ${priceLabel(q.amountKobo)} more`}
          </div>

          {error && (
            <p role="alert" className="text-caption mt-3 font-semibold text-danger">
              {error}
            </p>
          )}

          <button type="button" className="btn btn-lg mt-5 w-full" onClick={submit} disabled={pending || !q || q.kind === "contact" || extra < 10}>
            {pending && <Loader2 className="animate-spin" />}
            {q?.kind === "upgrade" ? `Pay ${priceLabel(q.amountKobo)} and add ${count(extra)}` : `Add ${count(extra)} Tikkas`}
          </button>
          {extra > 0 && extra < 10 && <p className="text-caption mt-2 text-ink-muted">Add at least 10.</p>}
        </div>
      </dialog>
    </>
  );
}
