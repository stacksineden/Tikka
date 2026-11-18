"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

/** Shows the link without "https://" and copies it with exactly one. */
export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const shown = url.replace(/^https?:\/\//, "");
  async function copy() {
    try {
      await navigator.clipboard.writeText("https://" + shown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  }
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-md border border-line bg-surface-sunken py-1 pl-3 pr-1">
      <span className="text-code min-w-0 flex-1 truncate font-mono font-normal text-ink">{shown}</span>
      <button type="button" onClick={copy} className="btn btn-secondary min-h-9 shrink-0 px-3 text-label">
        {copied ? <Check /> : <Copy />}
        <span aria-live="polite">{copied ? "Copied" : "Copy link"}</span>
      </button>
    </div>
  );
}
