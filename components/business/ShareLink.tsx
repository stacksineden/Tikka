"use client";

import { Check, Copy, Share2 } from "lucide-react";
import { useState, useSyncExternalStore } from "react";

const noop = () => () => {};

/** Copy (and, on phones, share) a page link. */
export function ShareLink({ url, title, compact = false }: { url: string; title: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  // The server can't know; phones with a share sheet show the button once hydrated.
  const canShare = useSyncExternalStore(
    noop,
    () => typeof navigator.share === "function",
    () => false,
  );
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  }
  return (
    <div className="grid gap-2">
      <div className="flex min-w-0 items-center gap-2 rounded-md border border-line bg-surface-sunken py-1 pl-3 pr-1">
        <span className="text-code min-w-0 flex-1 truncate font-mono font-normal text-ink">{url.replace(/^https:\/\//, "")}</span>
        <button type="button" className="btn btn-secondary min-h-10 shrink-0 px-3 text-label" onClick={copy}>
          {copied ? <Check /> : <Copy />}
          <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      {canShare && !compact && (
        <button type="button" className="btn w-full sm:w-auto" onClick={() => navigator.share({ title, url }).catch(() => {})}>
          <Share2 />
          Share
        </button>
      )}
    </div>
  );
}
