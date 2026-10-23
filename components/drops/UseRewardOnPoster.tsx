"use client";

import { Check, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { savePosterHookAction } from "@/app/app/actions";

/** One tap puts this drop's best reward on the poster (the line under "Scan to get your Tikka"). */
export function UseRewardOnPoster({ posterId, suggestion, current }: { posterId: string; suggestion: string | null; current: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  if (!suggestion) return null;

  if (current === suggestion) {
    return (
      <p className="text-label flex items-start gap-1.5 text-success" role="status">
        <Check size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
        Your poster shows this drop&apos;s best reward.
      </p>
    );
  }

  function use() {
    setError(undefined);
    start(async () => {
      const form = new FormData();
      form.set("hook", suggestion!);
      const res = await savePosterHookAction(posterId, undefined, form);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="grid gap-1.5">
      <button
        type="button"
        onClick={use}
        disabled={pending}
        className="flex min-h-11 items-start gap-2.5 rounded-md border border-line bg-surface-raised p-3 text-left hover:border-brand disabled:opacity-70"
      >
        <Sparkles size={18} className="mt-0.5 shrink-0 text-brand" aria-hidden="true" />
        <span className="min-w-0">
          <span className="text-label block">{pending ? "Updating your poster…" : "Use this drop's best reward on your poster"}</span>
          <span className="text-caption block text-ink-muted">&ldquo;{suggestion}&rdquo;</span>
        </span>
      </button>
      {error && (
        <p role="alert" className="text-caption font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
