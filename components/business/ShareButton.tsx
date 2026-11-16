"use client";

import { Check, Share2 } from "lucide-react";
import { useState } from "react";

/** One button (the editorial pages). Shares a link with the phone's share sheet (WhatsApp, Instagram…), or copies it where there isn't one. */
export function ShareButton({ url, title, className }: { url: string; title: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    try {
      if (navigator.share) return await navigator.share({ title, url });
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Closed the share sheet, or copying isn't allowed here: nothing to do.
    }
  }

  return (
    <button type="button" onClick={share} className={className}>
      {copied ? <Check size={18} aria-hidden="true" /> : <Share2 size={18} aria-hidden="true" />}
      {copied ? "Link copied" : "Share"}
    </button>
  );
}
