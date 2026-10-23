"use client";

import { Flag } from "lucide-react";
import { useState, useTransition } from "react";
import { reportReviewAction } from "@/app/app/actions";

const REASONS = ["Not a real customer", "Offensive or abusive", "Shares private details", "Something else"];

/** Report goes to Tikka's admin queue. The review stays up until Tikka decides (PRD B9). */
export function ReportButton({ id, reported }: { id: string; reported: boolean }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(reported);
  const [reason, setReason] = useState(REASONS[0]);
  const [pending, start] = useTransition();

  if (done) return <span className="text-caption font-semibold text-ink-muted">Reported. Tikka will look at it.</span>;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-label inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-ink-muted">
        <Flag size={16} aria-hidden="true" />
        Report
      </button>
    );
  }
  return (
    <div className="grid w-full gap-2 rounded-md bg-surface-sunken p-3">
      <label htmlFor={`reason-${id}`} className="text-label">
        Why are you reporting it?
      </label>
      <select id={`reason-${id}`} value={reason} onChange={(e) => setReason(e.target.value)} className="input">
        {REASONS.map((r) => (
          <option key={r}>{r}</option>
        ))}
      </select>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await reportReviewAction(id, reason);
              if (r.ok) setDone(true);
            })
          }
        >
          {pending ? "Sending…" : "Send report"}
        </button>
        <button type="button" className="text-label min-h-11 px-2 text-ink-muted" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
