"use client";

import { useState } from "react";

const PROBLEM: Record<string, string> = {
  taken: "Someone else booked this time while you were paying. Pick another time on the business's page.",
  paid: "This deposit is already paid.",
  closed: "This business can't take payments right now. Message them.",
  paystack: "Paystack didn't answer. Try again in a minute.",
  slow_down: "Too many tries. Wait a little and try again.",
};

/** A held time whose deposit isn't paid yet: back to Paystack (the time is held again if still free). */
export function FinishPaying({ token, label }: { token: string; label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="grid gap-2">
      <button
        type="button"
        disabled={busy}
        className="biz-btn min-h-[52px] w-full bg-ink text-surface-raised"
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const res = await fetch("/api/book/pay", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
            const data = (await res.json()) as { ok: boolean; url?: string; reason?: string };
            if (data.ok && data.url) return window.location.assign(data.url);
            setError(PROBLEM[data.reason ?? ""] ?? "Something went wrong. Try again.");
          } catch {
            setError("Couldn't reach Paystack. Check your connection.");
          }
          setBusy(false);
        }}
      >
        {busy ? "Opening Paystack…" : label}
      </button>
      <p role="alert" className="text-caption min-h-5 text-danger">
        {error}
      </p>
    </div>
  );
}
