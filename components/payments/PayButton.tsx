"use client";

import { useState } from "react";

const PROBLEM: Record<string, string> = {
  bad_email: "Type your email so Paystack can send your receipt.",
  paid: "This has already been paid.",
  cancelled: "This pay link was cancelled. Message the business.",
  closed: "This business can't take payments right now. Message them.",
  slow_down: "Too many tries. Wait a little and try again.",
  paystack: "Paystack didn't answer. Try again in a minute.",
};

/** Email for Paystack's receipt, then off to Paystack's checkout (card, transfer or USSD). */
export function PayButton({ token, label }: { token: string; label: string }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/pay", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, email }) });
      const data = (await res.json()) as { ok: boolean; url?: string; reason?: string };
      if (data.ok && data.url) {
        window.location.assign(data.url);
        return;
      }
      setError(PROBLEM[data.reason ?? ""] ?? "Something went wrong. Try again.");
    } catch {
      setError("Couldn't reach Paystack. Check your connection.");
    }
    setBusy(false);
  }

  return (
    <form onSubmit={pay} className="grid gap-3">
      <label className="grid gap-1">
        <span className="text-label">Your email</span>
        <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" placeholder="you@example.com" required />
        <span className="text-caption text-ink-muted">Paystack sends your receipt here.</span>
      </label>
      <button type="submit" disabled={busy} className="biz-btn min-h-[52px] w-full bg-ink text-surface-raised">
        {busy ? "Opening Paystack…" : label}
      </button>
      <p role="alert" className="text-caption min-h-5 text-danger">
        {error}
      </p>
    </form>
  );
}
