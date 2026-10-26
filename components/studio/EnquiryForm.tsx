"use client";

import { Check, Loader2 } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { sendEnquiry, type EnquiryState } from "@/app/(studio)/studio/contact/actions";
import { BUDGET_RANGES, STUDIO_CATEGORIES } from "@/lib/studio-shared";

const field = "input w-full";

/** The Tikka Studio enquiry (PRD B11). Prefilled for a signed-in owner. */
export function EnquiryForm({ from, fromClient, prefill }: { from?: string; fromClient?: string; prefill?: { name?: string; businessName?: string; phone?: string } }) {
  const [state, action, pending] = useActionState<EnquiryState, FormData>(sendEnquiry, undefined);
  const done = useRef<HTMLDivElement>(null);
  // The long form becomes a short message: bring it into view so it isn't missed.
  useEffect(() => {
    if (state?.ok) done.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [state?.ok]);

  if (state?.ok) {
    return (
      <div ref={done} role="status" className="grid gap-2 rounded-card border border-line bg-surface-raised p-6">
        <p className="text-title flex items-start gap-2">
          <Check size={24} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
          Thanks. We&apos;ll message you on WhatsApp within one working day.
        </p>
      </div>
    );
  }

  const v = state?.fields ?? {};
  return (
    <form action={action} className="grid gap-5 rounded-card border border-line bg-surface-raised p-5 sm:p-6">
      {from && <input type="hidden" name="from" value={from} />}
      {fromClient && <p className="text-body rounded-md bg-brand-soft px-3 py-2 text-ink">You came from our work for {fromClient}.</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5" htmlFor="enq-name">
          <span className="text-label">Your name</span>
          <input id="enq-name" name="name" autoComplete="name" required maxLength={80} defaultValue={v.name ?? prefill?.name} className={field} />
        </label>
        <label className="grid gap-1.5" htmlFor="enq-business">
          <span className="text-label">Business name</span>
          <input id="enq-business" name="businessName" autoComplete="organization" required maxLength={120} defaultValue={v.businessName ?? prefill?.businessName} className={field} />
        </label>
      </div>
      <label className="grid gap-1.5" htmlFor="enq-phone">
        <span className="text-label">WhatsApp number</span>
        <input id="enq-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" required placeholder="0803 123 4567" defaultValue={v.phone ?? prefill?.phone} className={field} />
      </label>

      <fieldset className="grid gap-2">
        <legend className="text-label mb-1">What do you need?</legend>
        {STUDIO_CATEGORIES.map((c) => (
          <label key={c.id} className="text-body flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-line px-3">
            <input type="checkbox" name="services" value={c.id} className="size-5 accent-brand" />
            {c.label}
          </label>
        ))}
      </fieldset>

      <label className="grid gap-1.5" htmlFor="enq-budget">
        <span className="text-label">
          Rough budget <span className="font-normal text-ink-muted">(optional)</span>
        </span>
        <select id="enq-budget" name="budget" defaultValue={v.budget ?? ""} className={field}>
          <option value="">Not sure yet</option>
          {BUDGET_RANGES.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1.5" htmlFor="enq-note">
        <span className="text-label">
          Anything else? <span className="font-normal text-ink-muted">(optional)</span>
        </span>
        <textarea id="enq-note" name="note" rows={4} maxLength={1000} defaultValue={v.note} className={`${field} min-h-28 py-2`} />
      </label>

      {state?.error && (
        <p role="alert" className="text-body font-semibold text-danger">
          {state.error}
        </p>
      )}
      <p className="text-caption text-ink-muted">Tikka Studio will contact you on WhatsApp about your enquiry.</p>
      <button type="submit" className="btn btn-lg w-full sm:w-auto sm:justify-self-start" disabled={pending}>
        {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
        Send
      </button>
    </form>
  );
}
