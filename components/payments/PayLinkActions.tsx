"use client";

import { Check, Copy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelPayLinkAction } from "@/app/app/paylink-actions";

/** An open pay link: copy it again, or cancel it. */
export function PayLinkActions({ id, url }: { id: string; url: string }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        className="btn btn-secondary min-h-11"
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
      <button
        type="button"
        className="btn btn-ghost min-h-11 text-danger"
        disabled={pending}
        onClick={() => {
          if (!confirm("Cancel this pay link? The customer won't be able to pay with it.")) return;
          start(async () => {
            await cancelPayLinkAction(id);
            router.refresh();
          });
        }}
      >
        Cancel
      </button>
    </div>
  );
}
