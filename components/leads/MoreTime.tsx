"use client";

import { CalendarPlus, MessageCircle } from "lucide-react";
import { useState } from "react";
import { giveMoreTimeAction } from "@/app/app/actions";
import { shortDate } from "@/lib/format";
import { moreTimeMessage, noMoreTimeReason, MORE_TIME_DAYS } from "@/lib/more-time";

/**
 * "Give more time" on a lead (owner only): one extra week on their Tikka, once. Asks first, then
 * offers "Tell {name}" from the owner's own WhatsApp with the new date. Customers never see this.
 */
export function MoreTime({
  claimId,
  name,
  businessName,
  until,
  waTo,
}: {
  claimId: string;
  name: string;
  businessName: string;
  /** The date it would move to (from moreTimeUntil on the server); null once it can't have more time. */
  until: string | null;
  /** "https://wa.me/234…" for the "Tell" message, when the number is a Nigerian mobile. */
  waTo: string | null;
}) {
  const first = name.split(" ")[0];
  const [state, setState] = useState<{ kind: "idle" | "asking" | "saving" } | { kind: "done"; expiresAt: string } | { kind: "error"; text: string }>({ kind: "idle" });

  if (state.kind === "done") {
    const msg = moreTimeMessage(first, businessName, shortDate(state.expiresAt));
    return (
      <div className="grid gap-2 rounded-md bg-success-soft p-3 lg:col-span-4" role="status">
        <p className="text-body">
          Done. {first}&apos;s Tikka now lasts until <span className="font-semibold">{shortDate(state.expiresAt)}</span>.
        </p>
        {waTo && (
          <a href={`${waTo}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noopener noreferrer" className="btn btn-secondary min-h-11 justify-self-start px-3 text-label">
            <MessageCircle />
            Tell {first} on WhatsApp
          </a>
        )}
      </div>
    );
  }

  // Stays mounted after the page refreshes with the new date, so "Tell {name}" stays on screen.
  if (!until) return null;

  if (state.kind === "idle") {
    return (
      <button type="button" className="text-label inline-flex min-h-11 items-center gap-1.5 justify-self-start font-semibold text-brand lg:col-span-4" onClick={() => setState({ kind: "asking" })}>
        <CalendarPlus size={18} aria-hidden="true" />
        Give more time
      </button>
    );
  }

  return (
    <div className="grid gap-3 rounded-md border border-line-strong bg-surface p-3 lg:col-span-4" role="group" aria-label={`Give ${first} more time`}>
      <p className="text-body">
        Give {first} {MORE_TIME_DAYS} more days? Their Tikka will last until <span className="font-semibold">{shortDate(until)}</span>. You can only do
        this once.
      </p>
      {state.kind === "error" && (
        <p role="alert" className="text-caption font-semibold text-danger">
          {state.text}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn min-h-11"
          disabled={state.kind === "saving"}
          onClick={async () => {
            setState({ kind: "saving" });
            try {
              const r = await giveMoreTimeAction({ claimId });
              setState(r.kind === "extended" ? { kind: "done", expiresAt: r.expiresAt } : { kind: "error", text: noMoreTimeReason(r.kind) });
            } catch {
              setState({ kind: "error", text: "No connection. Check your data and try again." });
            }
          }}
        >
          {state.kind === "saving" ? "Saving…" : "Yes, give more time"}
        </button>
        <button type="button" className="btn btn-secondary min-h-11" onClick={() => setState({ kind: "idle" })}>
          Cancel
        </button>
      </div>
    </div>
  );
}
