"use client";

import { CalendarPlus, Loader2, OctagonX, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { endDropEarlyAction, extendDropAction } from "@/app/app/actions";
import { isoToWat } from "@/lib/drop";
import { clockTime, shortDate } from "@/lib/format";

function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      aria-label={title}
      className="sheet m-0 mt-auto w-full max-w-none bg-transparent p-0 sm:m-auto sm:max-w-md"
    >
      <div className="rounded-t-[24px] bg-surface-raised px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-3 text-ink sm:rounded-card sm:p-6">
        <div className="mx-auto mb-3 h-1 w-10 rounded-pill bg-line-strong/40 sm:hidden" aria-hidden="true" />
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-title">{title}</h2>
          <button type="button" onClick={onClose} className="grid size-11 shrink-0 place-items-center rounded-pill bg-surface-sunken text-ink-muted" aria-label="Close">
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

/** Extend the end date (up to 30 days after it started) and end early (no refund). */
export function DropActions({ dropId, startsAt, endsAt, maxEndsAt }: { dropId: string; startsAt: string; endsAt: string; maxEndsAt: string }) {
  const router = useRouter();
  const [sheet, setSheet] = useState<"extend" | "end" | null>(null);
  const [when, setWhen] = useState(() => isoToWat(endsAt));
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const canExtend = new Date(endsAt) < new Date(maxEndsAt);

  function close() {
    setSheet(null);
    setError(undefined);
  }

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(undefined);
    start(async () => {
      const r = await action();
      if (!r.ok) return setError(r.error);
      close();
      router.refresh();
    });
  }

  return (
    <>
      {canExtend && (
        <button type="button" className="btn btn-secondary" onClick={() => setSheet("extend")}>
          <CalendarPlus />
          Extend
        </button>
      )}
      <button type="button" className="btn btn-ghost text-danger" onClick={() => setSheet("end")}>
        <OctagonX />
        End early
      </button>

      <Sheet open={sheet === "extend"} onClose={close} title="Extend the end date">
        <p className="text-body mt-1 text-ink-muted">
          It now ends {shortDate(endsAt)}, {clockTime(endsAt)}. A drop can run up to 30 days from its start ({shortDate(startsAt)}), so the latest is{" "}
          {shortDate(maxEndsAt)}, {clockTime(maxEndsAt)}. Every Tikka in the drop is valid until the new end.
        </p>
        <label htmlFor="extend-when" className="text-label mt-4 block">
          New end (Nigeria time)
        </label>
        <input
          id="extend-when"
          type="datetime-local"
          value={when}
          min={isoToWat(endsAt)}
          max={isoToWat(maxEndsAt)}
          onChange={(e) => setWhen(e.target.value)}
          className="input mt-1.5 w-full"
        />
        {error && (
          <p role="alert" className="text-caption mt-3 font-semibold text-danger">
            {error}
          </p>
        )}
        <button type="button" className="btn btn-lg mt-5 w-full" disabled={pending} onClick={() => run(() => extendDropAction(dropId, when))}>
          {pending && <Loader2 className="animate-spin" />}
          Save the new end
        </button>
      </Sheet>

      <Sheet open={sheet === "end"} onClose={close} title="End this drop now?">
        <p className="text-body mt-1 text-ink-muted">
          Nobody else can claim, and the link shows that the drop has ended. People who already claimed keep their Tikkas until they expire. Ending early
          doesn&apos;t refund the drop.
        </p>
        {error && (
          <p role="alert" className="text-caption mt-3 font-semibold text-danger">
            {error}
          </p>
        )}
        <div className="mt-5 grid gap-2">
          <button type="button" className="btn btn-lg w-full bg-danger text-on-danger" disabled={pending} onClick={() => run(() => endDropEarlyAction(dropId))}>
            {pending && <Loader2 className="animate-spin" />}
            End the drop now
          </button>
          <button type="button" className="text-label min-h-11 text-ink-muted" onClick={close}>
            Keep it running
          </button>
        </div>
      </Sheet>
    </>
  );
}
