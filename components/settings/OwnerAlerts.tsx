"use client";

import { Check } from "lucide-react";
import { useActionState } from "react";
import { saveOwnerAlertsAction } from "@/app/app/actions";

/** Settings › Account: the owner's WhatsApp number for Tikka's alerts and the daily summary. */
export function OwnerAlerts({ number, dailySummary }: { number: string; dailySummary: boolean }) {
  const [state, action, pending] = useActionState(saveOwnerAlertsAction, undefined);
  return (
    <form action={action} className="grid gap-4 rounded-card border border-line bg-surface-raised p-4 sm:p-6">
      <div>
        <h2 className="text-title text-[17px] leading-6">Your WhatsApp alerts</h2>
        <p className="text-caption mt-1 text-ink-muted">Tikka sends your daily summary here. It never goes to your customers.</p>
      </div>
      <label className="grid gap-1.5">
        <span className="text-label">Your WhatsApp number</span>
        <input name="ownerWhatsapp" defaultValue={number} inputMode="tel" autoComplete="tel" placeholder="0803 123 4567" className="input" aria-invalid={!!state?.error} />
      </label>
      <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3">
        <span>
          <span className="text-body block font-semibold">Daily summary at 8am</span>
          <span className="text-caption block text-ink-muted">New claims, who plans to come tomorrow, and Tikkas ending soon.</span>
        </span>
        <input type="checkbox" name="dailySummary" defaultChecked={dailySummary} className="size-6 shrink-0 accent-[var(--brand)]" />
      </label>
      {state?.error && (
        <p role="alert" className="text-caption font-semibold text-danger">
          {state.error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button type="submit" className="btn min-h-11 px-5" disabled={pending}>
          Save
        </button>
        {state?.saved && !pending && (
          <span className="text-label flex items-center gap-1 text-success" role="status">
            <Check size={16} aria-hidden="true" /> Saved
          </span>
        )}
      </div>
    </form>
  );
}
