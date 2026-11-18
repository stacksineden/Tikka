"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";

/** A bottom sheet on phones, a dialog on desktop (the dashboard's sheet pattern, as in AddTikkas). */
export function Sheet({ open, onClose, title, sub, children }: { open: boolean; onClose: () => void; title: string; sub?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  // Only a close the person made (Esc, the backdrop, X) reports back; closing because another
  // sheet opened must not clear what that sheet is showing.
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const id = `sheet-${title.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <dialog
      ref={ref}
      onClose={() => openRef.current && onClose()}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      aria-labelledby={id}
      className="sheet m-0 mt-auto w-full max-w-none bg-transparent p-0 sm:m-auto sm:max-w-md"
    >
      <div className="max-h-[92dvh] overflow-y-auto rounded-t-[24px] bg-surface-raised px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-3 text-ink sm:rounded-card sm:p-6">
        <div className="mx-auto mb-3 h-1 w-10 rounded-pill bg-line-strong/40 sm:hidden" aria-hidden="true" />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id={id} className="text-title">
              {title}
            </h2>
            {sub && <p className="text-body mt-1 text-ink-muted">{sub}</p>}
          </div>
          <button type="button" onClick={onClose} className="grid size-11 shrink-0 place-items-center rounded-pill bg-surface-sunken text-ink-muted" aria-label="Close">
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        {open && children}
      </div>
    </dialog>
  );
}
