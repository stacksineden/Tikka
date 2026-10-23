"use client";

import { Check, Copy, QrCode, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/** Copy a channel's link (…?c=ig), or show its QR. */
export function ChannelLink({ url, label, qrSvg }: { url: string; label: string; qrSvg: string }) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <div className="flex shrink-0 gap-1">
      <button
        type="button"
        className="btn btn-ghost min-h-11 px-2.5 text-label"
        aria-label={`Copy the ${label} link`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          } catch {}
        }}
      >
        {copied ? <Check /> : <Copy />}
        <span className="hidden sm:inline" aria-live="polite">
          {copied ? "Copied" : "Copy"}
        </span>
      </button>
      <button type="button" className="btn btn-ghost min-h-11 px-2.5 text-label" aria-label={`Show the ${label} QR code`} onClick={() => setOpen(true)}>
        <QrCode />
        <span className="hidden sm:inline">QR</span>
      </button>
      <dialog
        ref={ref}
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        aria-label={`${label} QR code`}
        className="m-auto w-[min(92vw,360px)] rounded-card bg-surface-raised p-5 text-ink"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-title text-[17px]">{label}</h2>
          <button type="button" onClick={() => setOpen(false)} className="grid size-11 place-items-center rounded-pill bg-surface-sunken text-ink-muted" aria-label="Close">
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="mt-3 aspect-square w-full rounded-md p-2 ring-1 ring-line [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: qrSvg }} />
        <p className="text-caption mt-3 break-all font-mono text-ink-muted">{url.replace(/^https:\/\//, "")}</p>
      </dialog>
    </div>
  );
}
