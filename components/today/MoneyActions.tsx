"use client";

import { Info, Minus, Repeat } from "lucide-react";
import { useState } from "react";
import { ExpenseSheet } from "./ExpenseSheet";
import { Sheet } from "./Sheet";
import { SourceTag } from "./SourceTag";

export function AddExpenseButton({ regular }: { regular?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={`btn btn-secondary rounded-pill ${regular ? "justify-self-start" : "btn-lg w-full"}`} onClick={() => setOpen(true)}>
        {regular ? <Repeat aria-hidden="true" /> : <Minus aria-hidden="true" />} {regular ? "Add a regular cost" : "Add something you spent"}
      </button>
      {open && <ExpenseSheet regular={regular} onClose={() => setOpen(false)} />}
    </>
  );
}

export function HowWeCount() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="text-label inline-flex min-h-11 items-center gap-1.5 justify-self-start text-brand" onClick={() => setOpen(true)}>
        <Info size={16} aria-hidden="true" /> Where these numbers come from
      </button>
      {open && (
        <Sheet title="Where the numbers come from" onClose={() => setOpen(false)}>
          <ul className="divide-y divide-line rounded-card border border-line bg-surface-raised">
            {(
              [
                ["auto", "Deposits and pay links. Customers pay online, so Tikka knows straight away. You do nothing."],
                ["recorded", "Cash and transfers. Counted when you tap Paid on Today, or New sale for a walk-in."],
                ["added", "What you spent. Tikka can't see this, so you add it. The evening reminder makes it quick."],
                ["regular", "Costs like rent or your helper. Add them once and Tikka counts them every week or month."],
              ] as const
            ).map(([k, t]) => (
              <li key={k} className="grid gap-1.5 px-4 py-3">
                <SourceTag source={k} />
                <span className="text-body">{t}</span>
              </li>
            ))}
          </ul>
          <p className="text-caption text-ink-muted">A transfer straight to your bank that you never mark as paid won&apos;t show here. The &quot;not marked paid&quot; reminder on Today helps you catch those.</p>
        </Sheet>
      )}
    </>
  );
}
