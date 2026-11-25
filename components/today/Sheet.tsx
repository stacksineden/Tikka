"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";

/** A bottom sheet (a modal dialog): tap outside or the X to close. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-label={title}
      className="sheet m-0 mt-auto w-full max-w-none bg-transparent p-0 sm:mx-auto sm:max-w-[480px]"
    >
      <div className="grid max-h-[88dvh] gap-4 overflow-y-auto rounded-t-[24px] bg-surface px-4 pt-3 pb-[calc(20px+env(safe-area-inset-bottom))] text-ink">
        <div className="mx-auto h-1 w-10 rounded-pill bg-line-strong/40" aria-hidden="true" />
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-title">{title}</h2>
          <button type="button" onClick={onClose} className="grid size-11 place-items-center rounded-pill bg-surface-sunken text-ink-muted" aria-label="Close">
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

export function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={`inline-flex min-h-11 items-center rounded-pill border px-4 font-semibold ${on ? "border-brand bg-brand text-on-brand" : "border-line-strong bg-surface-raised"}`}>
      {children}
    </button>
  );
}

/** A naira amount box; the number shows with thousands separators. */
export function NairaInput({ id, value, onChange, label }: { id: string; value: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="flex h-13 items-center rounded-md border border-line-strong bg-surface-raised pl-4 focus-within:outline-2 focus-within:outline-brand">
      <span className="text-ink-muted">₦</span>
      <input
        id={id}
        aria-label={label}
        inputMode="numeric"
        className="h-full min-w-0 flex-1 bg-transparent pr-3 pl-1 text-[17px] outline-none"
        value={value ? value.toLocaleString("en-NG") : ""}
        onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, "")) || 0)}
        placeholder="0"
      />
    </div>
  );
}
