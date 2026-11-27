"use client";

import { Globe, Loader2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { buyPlusAction, requestDomainAction } from "@/app/app/plus-actions";

/** "Get Plus" / "Add another month": opens the payment, then the pay page (card or transfer). */
export function BuyPlus({ label, disabled }: { label: string; disabled?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return (
    <div className="grid gap-2">
      <button
        type="button"
        disabled={pending || disabled}
        onClick={() =>
          start(async () => {
            setError("");
            const r = await buyPlusAction();
            if (!r.ok) return setError(r.error);
            router.push(`/app/pay?payment=${encodeURIComponent(r.paymentId)}`);
          })
        }
        className="btn btn-lg w-full rounded-pill"
      >
        {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Sparkles aria-hidden="true" />} {label}
      </button>
      {error && (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** Their own web address: Tikka sets it up for them. One open request; asking again updates it. */
export function AskDomain({ sent }: { sent?: { domain?: string } }) {
  const [domain, setDomain] = useState(sent?.domain ?? "");
  const [note, setNote] = useState("");
  const [done, setDone] = useState(!!sent);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  if (done)
    return (
      <p className="text-body rounded-md bg-success-soft px-4 py-3 text-success">
        Got it{domain ? ` (${domain})` : ""}. We&apos;ll message you on WhatsApp about setting it up and the cost.{" "}
        <button type="button" className="font-semibold underline" onClick={() => setDone(false)}>
          Change it
        </button>
      </p>
    );
  return (
    <div className="grid gap-3">
      <label className="grid gap-1.5">
        <span className="text-label">The address you&apos;d like (if you know it)</span>
        <input className="input h-12" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="e.g. glowstudio.com" maxLength={100} autoComplete="off" />
      </label>
      <label className="grid gap-1.5">
        <span className="text-label">Anything else? (optional)</span>
        <input className="input h-12" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. I already own it" maxLength={500} />
      </label>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError("");
            const r = await requestDomainAction(domain, note);
            if (!r.ok) return setError(r.error ?? "That didn't send. Try again.");
            setDone(true);
          })
        }
        className="btn btn-secondary min-h-12 justify-self-start rounded-pill"
      >
        {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Globe aria-hidden="true" />} Ask us
      </button>
      {error && (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** "Invite another business": their link, Copy and Share on WhatsApp (from their own phone). */
export function InviteLink({ url, joined, rewarded }: { url: string; joined: number; rewarded: number }) {
  const [copied, setCopied] = useState(false);
  const text = `I take bookings and deposits with Tikka. Get your own booking website free: ${url}`;
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2 rounded-pill border border-line bg-surface py-1.5 pr-1.5 pl-4">
        <span className="text-code min-w-0 flex-1 truncate">{url.replace(/^https?:\/\//, "")}</span>
        <button
          type="button"
          className="btn min-h-10 rounded-pill"
          onClick={() =>
            navigator.clipboard
              ?.writeText(url)
              .then(() => setCopied(true))
              .catch(() => undefined)
          }
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer" className="btn btn-secondary min-h-12 justify-self-start rounded-pill">
        Share on WhatsApp
      </a>
      {joined > 0 && (
        <p className="text-caption text-ink-muted">
          {joined} {joined === 1 ? "business has" : "businesses have"} joined with your link
          {rewarded ? ` · ${rewarded} free ${rewarded === 1 ? "month" : "months"} earned` : ""}.
        </p>
      )}
    </div>
  );
}
