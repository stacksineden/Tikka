"use client";

import { Banknote, Check, Copy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createPayLinkAction } from "@/app/app/paylink-actions";
import { Sheet } from "@/components/bookings/Sheet";
import { ActionIcon } from "@/components/tikka/ActionIcon";
import { whatsappLink } from "@/lib/booking";
import { naira } from "@/lib/format";

const PROBLEM: Record<string, string> = {
  too_small: "The smallest pay link is ₦100.",
  bad_note: "Say what it's for, e.g. \"Braids balance\".",
  no_account: "Add your bank account in Settings → Get paid first.",
  account_again: "Add your bank account again in Settings → Get paid.",
  not_enabled: "Getting paid online isn't open for your business yet.",
  not_verified: "Getting paid online needs the Verified badge.",
  not_found: "That Tikka isn't there any more.",
};

/**
 * "Send a pay link" (REVENUE_PLAN 5.3): an amount and what it's for, then the link to send from the
 * owner's own WhatsApp. From a lead it's connected to their Tikka (staff see "Paid online" at the
 * counter) and goes to their number.
 */
export function SendPayLink({
  businessName,
  maxKobo,
  claim,
  label = "Send a pay link",
  variant = "btn",
}: {
  businessName: string;
  maxKobo: number;
  /** From Leads: the Tikka, its claimer's first name and number, and its reward. */
  claim?: { id: string; name: string; phone?: string; reward?: string };
  label?: string;
  variant?: "btn" | "btn btn-secondary";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState(claim?.reward ? `${claim.reward} (your Tikka)` : "");
  const [name, setName] = useState("");
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const first = claim?.name.split(" ")[0] ?? (name.trim() || "");
  const naira0 = Number(amount.replace(/[^\d.]/g, ""));

  function create() {
    setError("");
    start(async () => {
      const r = await createPayLinkAction({ naira: naira0, note, name, claimId: claim?.id });
      if (r.kind !== "created" || !("url" in r)) {
        setError(r.kind === "too_big" ? `For now, one payment can be up to ${naira((r.maxKobo ?? maxKobo) / 100)}.` : (PROBLEM[r.kind] ?? "That didn't work. Try again."));
        return;
      }
      setUrl(r.url);
      router.refresh();
    });
  }

  const message = url ? `Hi${first ? ` ${first}` : ""}, here's the link to pay ${naira(naira0)} to ${businessName} for ${note.trim()}: ${url}` : "";

  return (
    <>
      <button type="button" className={`${variant} min-h-11`} onClick={() => (setOpen(true), setUrl(null), setError(""), setCopied(false))}>
        <Banknote size={18} aria-hidden="true" />
        {label}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={url ? "Your pay link is ready" : claim ? `Pay link for ${claim.name.split(" ")[0]}` : "Send a pay link"} sub={url ? `${naira(naira0)} · ${note.trim()}` : "Paid by card, transfer or USSD. The money goes to your bank the next working day."}>
        {url ? (
          <div className="mt-4 grid gap-3">
            <a className="btn min-h-12" target="_blank" rel="noopener noreferrer" href={claim?.phone ? whatsappLink(claim.phone, message) : `https://wa.me/?text=${encodeURIComponent(message)}`}>
              <ActionIcon kind="whatsapp" />
              {claim?.phone ? `Send to ${claim.name.split(" ")[0]} on WhatsApp` : "Send on WhatsApp"}
            </a>
            <button
              type="button"
              className="btn btn-secondary min-h-12"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(url);
                  setCopied(true);
                } catch {}
              }}
            >
              {copied ? <Check size={18} aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />}
              {copied ? "Copied" : "Copy link"}
            </button>
            <p className="text-caption break-all text-ink-muted">{url}</p>
          </div>
        ) : (
          <form
            className="mt-4 grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              create();
            }}
          >
            <label className="grid gap-1">
              <span className="text-label">Amount (₦)</span>
              <input className="input font-mono text-[20px]" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, "").slice(0, 9))} placeholder="16000" required />
              <span className="text-caption text-ink-muted">Up to {naira(maxKobo / 100)} for now. You get it less Paystack&apos;s fee and Tikka&apos;s 1%.</span>
            </label>
            <label className="grid gap-1">
              <span className="text-label">What it&apos;s for</span>
              <input className="input" value={note} onChange={(e) => setNote(e.target.value.slice(0, 80))} placeholder="e.g. Braids balance" required />
            </label>
            {!claim && (
              <label className="grid gap-1">
                <span className="text-label">Their first name (optional)</span>
                <input className="input" value={name} onChange={(e) => setName(e.target.value.slice(0, 30))} />
              </label>
            )}
            <button type="submit" className="btn min-h-12" disabled={pending || !naira0 || note.trim().length < 2}>
              {pending ? "Making the link…" : naira0 ? `Make a ${naira(naira0)} pay link` : "Make the link"}
            </button>
            <p role="alert" className="text-caption min-h-5 text-danger">
              {error}
            </p>
          </form>
        )}
      </Sheet>
    </>
  );
}
