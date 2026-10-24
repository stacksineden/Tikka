"use client";

import { Bell, Check, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Notify me (PRD A6). A real business: "Continue on WhatsApp" gets the NT-XXXXX code, then
 * "Open WhatsApp" sends "Notify me about Glow Studio NT-7KQ4A" to Tikka's number and the webhook
 * confirms there. DEMO businesses confirm here.
 */
export function NotifyMe({
  businessSlug,
  businessName,
  dropSlug,
  opensLabel,
  className = "btn btn-secondary min-h-11",
  children,
}: {
  businessSlug: string;
  businessName: string;
  /** Set for a scheduled drop; empty means "their next drop". */
  dropSlug?: string;
  opensLabel?: string;
  className?: string;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "ready" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [waUrl, setWaUrl] = useState("");

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  async function subscribe() {
    setState("sending");
    try {
      const r = await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ business: businessSlug, drop: dropSlug }) });
      const data = (await r.json()) as { ok: boolean; waUrl?: string; message?: string; error?: string };
      if (data.ok && data.waUrl) {
        setWaUrl(data.waUrl);
        return setState("ready");
      }
      setMessage(data.ok ? data.message! : (data.error ?? "That didn't work. Try again."));
      setState(data.ok ? "done" : "error");
    } catch {
      setMessage("No connection. Check your data and try again.");
      setState("error");
    }
  }

  const what = dropSlug && opensLabel ? `when ${businessName}'s drop opens (${opensLabel})` : `when ${businessName} drops again`;

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {children ?? (
          <>
            <Bell />
            Notify me
          </>
        )}
      </button>
      <dialog
        ref={ref}
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        aria-labelledby="notify-h"
        data-theme="light"
        className="sheet m-0 mt-auto w-full max-w-none bg-transparent p-0 sm:m-auto sm:max-w-md"
      >
        <div className="rounded-t-[24px] bg-surface px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-3 text-ink sm:rounded-card sm:p-6">
          <div className="mx-auto mb-3 h-1 w-10 rounded-pill bg-line sm:hidden" aria-hidden="true" />
          <div className="flex items-start justify-between gap-3">
            <h2 id="notify-h" className="text-title">
              {state === "done" ? "You're on the list" : "Get a WhatsApp message"}
            </h2>
            <button type="button" onClick={() => setOpen(false)} className="grid size-11 shrink-0 place-items-center rounded-pill bg-surface-sunken text-ink-muted" aria-label="Close">
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          {state === "ready" ? (
            <div className="mt-2 grid gap-4">
              <p className="text-body text-ink-muted">We&apos;ve written the message for you. Send it, and Tikka confirms on WhatsApp.</p>
              <a href={waUrl} target="_blank" rel="noopener noreferrer" className="btn btn-lg w-full" onClick={() => setOpen(false)}>
                <Bell />
                Open WhatsApp
              </a>
              <p className="text-caption text-ink-muted">Reply STOP to Tikka on WhatsApp any time to stop.</p>
            </div>
          ) : state === "done" ? (
            <div className="mt-2 grid gap-4">
              <p className="text-body flex items-start gap-2">
                <Check size={20} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
                {message}
              </p>
              <p className="text-caption text-ink-muted">Reply STOP to Tikka on WhatsApp any time to stop.</p>
              <button type="button" className="btn btn-secondary w-full" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
          ) : (
            <div className="mt-2 grid gap-4">
              <p className="text-body text-ink-muted">
                Tikka will send you one message {what}. {businessName} sees how many people are waiting, never who.{" "}
                <a href="/privacy#notify" target="_blank" rel="noopener" className="underline">
                  Privacy
                </a>
              </p>
              {state === "error" && (
                <p role="alert" className="text-caption font-semibold text-danger">
                  {message}
                </p>
              )}
              <button type="button" className="btn btn-lg w-full" onClick={subscribe} disabled={state === "sending"}>
                {state === "sending" ? <Loader2 className="animate-spin" /> : <Bell />}
                Continue on WhatsApp
              </button>
              <p className="text-caption text-ink-muted">Reply STOP to Tikka on WhatsApp any time to stop.</p>
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}

const REASONS = ["It looks like a scam", "The business doesn't exist", "Offensive or inappropriate", "Something else"];

/** "Report this drop" (PRD A5), for the admin queue. */
export function ReportDrop({ dropId }: { dropId: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REASONS[0]);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="tk-report">
        Report this drop
      </button>
      <dialog
        ref={ref}
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        aria-labelledby="report-h"
        data-theme="light"
        className="sheet m-0 mt-auto w-full max-w-none bg-transparent p-0 sm:m-auto sm:max-w-md"
      >
        <div className="rounded-t-[24px] bg-surface px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-4 text-ink sm:rounded-card sm:p-6">
          <h2 id="report-h" className="text-title">
            {sent ? "Thanks for telling us" : "Report this drop"}
          </h2>
          {sent ? (
            <>
              <p className="text-body mt-2 text-ink-muted">Tikka will look at it. You won&apos;t hear back unless we need more from you.</p>
              <button type="button" className="btn btn-secondary mt-4 w-full" onClick={() => setOpen(false)}>
                Close
              </button>
            </>
          ) : (
            <>
              <fieldset className="mt-3 grid gap-1">
                <legend className="sr-only">Why are you reporting it?</legend>
                {REASONS.map((r) => (
                  <label key={r} className="text-body flex min-h-11 cursor-pointer items-center gap-3">
                    <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} className="size-5 accent-brand" />
                    {r}
                  </label>
                ))}
              </fieldset>
              <div className="mt-4 grid gap-2">
                <button
                  type="button"
                  className="btn w-full"
                  onClick={async () => {
                    await fetch("/api/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dropId, reason }) }).catch(() => {});
                    setSent(true);
                  }}
                >
                  Send report
                </button>
                <button type="button" className="text-label min-h-11 text-ink-muted" onClick={() => setOpen(false)}>
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
