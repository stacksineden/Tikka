"use client";

import { MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/** "Message on WhatsApp": opens the chat from the owner's phone and logs a followup_tap. */
export function FollowUpButton({ href, leadId, name, compact = false }: { href: string; leadId: string; name: string; compact?: boolean }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="btn btn-secondary min-h-11 shrink-0 px-3 text-label"
      aria-label={`Message ${name} on WhatsApp`}
      onClick={() => {
        const body = JSON.stringify({ leadId });
        try {
          if (navigator.sendBeacon?.("/api/leads/followup", new Blob([body], { type: "application/json" }))) return;
        } catch {}
        fetch("/api/leads/followup", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(() => {});
      }}
    >
      <MessageCircle />
      <span className={compact ? "hidden sm:inline" : ""}>Message on WhatsApp</span>
    </a>
  );
}

/** Filters submit as soon as a select or checkbox changes (the form still works without JavaScript via Apply). */
export function AutoSubmit({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={ref}
      method="get"
      className={className}
      onChange={(e) => {
        const t = e.target as unknown as HTMLInputElement;
        if (t.tagName === "SELECT" || t.type === "checkbox") ref.current?.requestSubmit();
      }}
    >
      {children}
    </form>
  );
}

/** While a drop is live, new claims show up without a reload (Realtime replaces this in M1). */
export function LiveRefresh({ every = 30_000 }: { every?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) router.refresh();
    }, every);
    return () => clearInterval(id);
  }, [router, every]);
  return null;
}
