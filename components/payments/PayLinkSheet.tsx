"use client";

// NEW DIRECTION: "Send a pay link" on Money and on a customer's page. From a customer it first asks
// what it's for, as Leads did for a Tikka: a balance they owe, a Tikka they haven't used, or something
// else. Then the amount and what it's for (filled in), then the link to send from the owner's own
// WhatsApp. Real businesses keep SendPayLink; this sheet only shows for businesses from the new setup.

import { Banknote, Check, ChevronRight, Copy, Gift, Loader2, PenLine, Receipt } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createPayLinkAction } from "@/app/app/paylink-actions";
import { Sheet } from "@/components/today/Sheet";
import { ActionIcon } from "@/components/tikka/ActionIcon";
import { payReasonNote, phoneKey, type PayReason } from "@/lib/clients";
import { waLink } from "@/lib/ledger";

const naira = (kobo: number) => "₦" + Math.round(kobo / 100).toLocaleString("en-NG");
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Lagos" });

const PROBLEM: Record<string, string> = {
  too_small: "The smallest pay link is ₦100.",
  bad_phone: "Type their WhatsApp number, like 0803 123 4567.",
  bad_note: "Say what it's for, e.g. \"Braids balance\".",
  no_account: "Add your bank account in Settings → Get paid first.",
  account_again: "Add your bank account again in Settings → Get paid.",
  not_enabled: "Getting paid online isn't open for your business yet.",
  not_verified: "Getting paid online needs the Verified badge.",
  not_found: "That Tikka isn't there any more.",
};

export function PayLinkSheet({
  businessName,
  maxKobo,
  customer,
  reasons = [{ kind: "other" }],
  label = "Send a pay link",
  className = "btn btn-lg rounded-pill",
}: {
  businessName: string;
  maxKobo: number;
  /** From a customer's page: who it goes to. */
  customer?: { name: string; phone?: string };
  reasons?: PayReason[];
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<PayReason | null>(null);
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState("");
  const [name, setName] = useState("");
  // Every customer has a WhatsApp number: a link from Money asks for it, a customer's page brings it.
  const [phone, setPhone] = useState("");
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const first = (customer?.name ?? name).trim().split(/\s+/)[0] ?? "";
  const choose = reasons.length > 1;

  function pick(r: PayReason) {
    setReason(r);
    setAmount(r.kind === "balance" ? Math.round(r.kobo / 100) : 0);
    setNote(payReasonNote(r));
    setError("");
  }

  function openSheet() {
    setOpen(true);
    setUrl(null);
    setError("");
    setName("");
    setPhone("");
    if (choose) setReason(null);
    else pick(reasons[0] ?? { kind: "other" });
  }

  function create() {
    if (!reason) return;
    setError("");
    start(async () => {
      const r = await createPayLinkAction({
        naira: amount,
        note,
        name: customer?.name ?? name,
        phone: customer?.phone ?? phone,
        saleId: reason.kind === "balance" ? reason.saleId : undefined,
        claimId: reason.kind === "tikka" ? reason.claimId : undefined,
      });
      if (r.kind !== "created" || !("url" in r)) {
        setError(r.kind === "too_big" ? `For now, one payment can be up to ${naira(r.maxKobo ?? maxKobo)}.` : (PROBLEM[r.kind] ?? "That didn't work. Try again."));
        return;
      }
      setUrl(r.url);
      router.refresh();
    });
  }

  const message = url ? payLinkMessage(first, amount * 100, businessName, note, url) : "";
  const title = url ? "Your pay link is ready" : first && customer ? `Pay link for ${first}` : "Send a pay link";

  return (
    <>
      <button type="button" className={className} onClick={openSheet}>
        <Banknote aria-hidden="true" /> {label}
      </button>
      {open && (
        <Sheet title={title} onClose={() => setOpen(false)}>
          {url ? (
            <PayLinkReady url={url} message={message} amountKobo={amount * 100} note={note} first={first} phone={customer?.phone ?? (phoneKey(phone) ?? undefined)} />
          ) : !reason ? (
            <div className="grid gap-2">
              <p className="text-body text-ink-muted">What&apos;s it for?</p>
              {reasons.map((r, i) => (
                <button key={i} type="button" onClick={() => pick(r)} className="flex min-h-16 items-center gap-3 rounded-md border border-line bg-surface-raised px-4 text-left">
                  {r.kind === "balance" ? <Receipt size={20} className="shrink-0 text-ink-muted" aria-hidden="true" /> : r.kind === "tikka" ? <Gift size={20} className="shrink-0 text-ink-muted" aria-hidden="true" /> : <PenLine size={20} className="shrink-0 text-ink-muted" aria-hidden="true" />}
                  <span className="min-w-0 flex-1">
                    <b className="block">{r.kind === "balance" ? `What they owe: ${naira(r.kobo)}` : r.kind === "tikka" ? `Their Tikka: ${r.reward}` : "Something else"}</b>
                    <span className="text-caption text-ink-muted">
                      {r.kind === "balance" ? `${r.title} · ${day(r.at)}` : r.kind === "tikka" ? `Claimed ${day(r.at)} · they pay before they come` : "A custom job, a product, paying ahead"}
                    </span>
                  </span>
                  <ChevronRight size={18} className="shrink-0 text-ink-muted" aria-hidden="true" />
                </button>
              ))}
            </div>
          ) : (
            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                create();
              }}
            >
              {choose && (
                <button type="button" className="text-label justify-self-start text-ink-muted underline underline-offset-4" onClick={() => setReason(null)}>
                  Change what it&apos;s for
                </button>
              )}
              <label className="grid gap-1">
                <span className="text-label">Amount</span>
                <span className="flex h-13 items-center rounded-md border border-line-strong bg-surface-raised pl-4 focus-within:outline-2 focus-within:outline-brand">
                  <span className="text-ink-muted">₦</span>
                  <input
                    className="text-code h-full min-w-0 flex-1 bg-transparent pr-3 pl-1 text-[20px] outline-none"
                    inputMode="numeric"
                    value={amount ? amount.toLocaleString("en-NG") : ""}
                    onChange={(e) => setAmount(Number(e.target.value.replace(/\D/g, "").slice(0, 9)) || 0)}
                    placeholder="16,000"
                    required
                  />
                </span>
                <span className="text-caption text-ink-muted">
                  {reason.kind === "balance" ? `They owe ${naira(reason.kobo)}. Ask for less to take part of it.` : `Up to ${naira(maxKobo)} for now.`} You get it less Paystack&apos;s fee and Tikka&apos;s 1%.
                </span>
              </label>
              <label className="grid gap-1">
                <span className="text-label">What it&apos;s for</span>
                <input className="input" value={note} onChange={(e) => setNote(e.target.value.slice(0, 80))} placeholder="e.g. Braids balance" required />
              </label>
              {!customer && (
                <>
                  <label className="grid gap-1">
                    <span className="text-label">Their name</span>
                    <input className="input" value={name} onChange={(e) => setName(e.target.value.slice(0, 30))} autoComplete="off" required />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-label">Their WhatsApp number</span>
                    <input className="input font-mono" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="0803 123 4567" autoComplete="off" required />
                    {phone.trim() && !phoneKey(phone) && <span className="text-caption text-ink-muted">Type a Nigerian number, like 0803 123 4567.</span>}
                  </label>
                </>
              )}
              <button type="submit" className="btn btn-lg rounded-pill" disabled={pending || !amount || note.trim().length < 2 || (!customer && (name.trim().length < 2 || !phoneKey(phone)))}>
                {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                {pending ? "Making the link…" : amount ? `Make a ${naira(amount * 100)} pay link` : "Make the link"}
              </button>
              {error && (
                <p role="alert" className="text-caption text-danger">
                  {error}
                </p>
              )}
            </form>
          )}
        </Sheet>
      )}
    </>
  );
}

/** The link is made: send it from the owner's own WhatsApp (to the customer's number when there is one) or copy it. */
export function PayLinkReady({ url, message, amountKobo, note, first, phone }: { url: string; message: string; amountKobo: number; note: string; first: string; phone?: string }) {
  const [copied, setCopied] = useState(false);
  const send = waLink(phone, message) ?? `https://wa.me/?text=${encodeURIComponent(message)}`;
  return (
    <div className="grid gap-3">
      <p className="text-body text-ink-muted">
        {naira(amountKobo)} · {note.trim()}
      </p>
      <a className="btn btn-lg rounded-pill" target="_blank" rel="noopener noreferrer" href={send}>
        <ActionIcon kind="whatsapp" />
        {phone && first ? `Send to ${first} on WhatsApp` : "Send on WhatsApp"}
      </a>
      <button
        type="button"
        className="btn btn-secondary btn-lg rounded-pill"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
          } catch {}
        }}
      >
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        {copied ? "Copied" : "Copy link"}
      </button>
      <p className="text-caption break-all text-ink-muted">{url}</p>
      <p className="text-caption text-ink-muted">When they pay, it shows on Money and clears what they owe.</p>
    </div>
  );
}

/** The WhatsApp message that goes with a pay link. */
export const payLinkMessage = (first: string, amountKobo: number, businessName: string, note: string, url: string) =>
  `Hi${first ? ` ${first}` : ""}, here's the link to pay ${naira(amountKobo)} to ${businessName} for ${note.trim()}: ${url}`;
