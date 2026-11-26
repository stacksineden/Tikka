"use client";

// NEW DIRECTION: "Receipt" on a paid sale (Today, a customer's page, a paid pay link): makes the
// receipt link once, then the owner sends it from their own WhatsApp, opens it or copies it.

import { Check, Copy, ExternalLink, Loader2, ReceiptText } from "lucide-react";
import { useState, useTransition } from "react";
import { receiptAction } from "@/app/app/receipt-actions";
import { Sheet } from "@/components/today/Sheet";
import { ActionIcon } from "@/components/tikka/ActionIcon";
import { waLink } from "@/lib/ledger";
import { receiptMessage } from "@/lib/receipts";

export function ReceiptButton({
  saleId,
  name,
  phone,
  item,
  businessName,
  className = "inline-flex min-h-11 items-center gap-1.5 rounded-pill border border-line-strong px-3.5 text-sm font-semibold",
}: {
  saleId: string;
  name: string;
  phone?: string;
  item: string;
  businessName: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const first = name.trim().split(/\s+/)[0] ?? "";

  function go() {
    setError("");
    setCopied(false);
    if (url) return setOpen(true);
    start(async () => {
      const r = await receiptAction(saleId);
      if (!r.ok) return setError(r.error);
      setUrl(r.url);
      setOpen(true);
    });
  }

  const message = url ? receiptMessage(first, businessName, item, url) : "";
  const send = url ? (waLink(phone, message) ?? `https://wa.me/?text=${encodeURIComponent(message)}`) : "";

  return (
    <>
      <button type="button" className={className} onClick={go} disabled={pending}>
        {pending ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <ReceiptText size={16} aria-hidden="true" />} Receipt
      </button>
      {error && (
        <span role="alert" className="text-caption text-danger">
          {error}
        </span>
      )}
      {open && url && (
        <Sheet title={first ? `Receipt for ${first}` : "Receipt"} onClose={() => setOpen(false)}>
          <p className="text-body text-ink-muted">{item}. It shows every payment and anything still owed, and stays up to date if they pay more later.</p>
          <a className="btn btn-lg rounded-pill" target="_blank" rel="noopener noreferrer" href={send}>
            <ActionIcon kind="whatsapp" />
            {phone && first ? `Send to ${first} on WhatsApp` : "Send on WhatsApp"}
          </a>
          <div className="grid grid-cols-2 gap-2">
            <a className="btn btn-secondary rounded-pill" href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={18} aria-hidden="true" /> Open it
            </a>
            <button
              type="button"
              className="btn btn-secondary rounded-pill"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(url);
                  setCopied(true);
                } catch {}
              }}
            >
              {copied ? <Check size={18} aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />} {copied ? "Copied" : "Copy link"}
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}
