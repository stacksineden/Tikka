"use client";

import { Check, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addExpenseAction } from "@/app/app/today-actions";
import { EXPENSE_KINDS, type ExpenseKind } from "@/lib/ledger";
import { Chip, NairaInput, Sheet } from "./Sheet";

/** "Something you spent": once, or a regular cost Tikka counts every week or month. */
export function ExpenseSheet({ kind, regular, onClose }: { kind?: ExpenseKind; regular?: boolean; onClose: () => void }) {
  const router = useRouter();
  const [pick, setPick] = useState<ExpenseKind>(kind ?? (regular ? "Rent" : "Products"));
  const [amount, setAmount] = useState(0);
  const [every, setEvery] = useState<"" | "week" | "month">(regular ? "month" : "");
  const [problem, setProblem] = useState<string>();
  const [pending, start] = useTransition();

  function save() {
    if (!amount) return setProblem("Type how much you spent.");
    start(async () => {
      const r = await addExpenseAction({ kind: pick, naira: amount, every: every || undefined });
      if (!r.ok) return setProblem("That didn't save. Try again.");
      router.refresh();
      onClose();
    });
  }

  return (
    <Sheet title={regular ? "A regular cost" : "Something you spent"} onClose={onClose}>
      <div>
        <span className="text-label mb-1.5 block">What was it?</span>
        <div className="flex flex-wrap gap-2">
          {EXPENSE_KINDS.map((k) => (
            <Chip key={k} on={pick === k} onClick={() => setPick(k)}>
              {k}
            </Chip>
          ))}
        </div>
      </div>
      <div>
        <label htmlFor="x-amount" className="text-label mb-1.5 block">
          How much?
        </label>
        <NairaInput id="x-amount" value={amount} onChange={setAmount} label="How much you spent" />
      </div>
      <div>
        <span className="text-label mb-1.5 block">Does it happen regularly?</span>
        <div className="flex flex-wrap gap-2">
          <Chip on={every === ""} onClick={() => setEvery("")}>
            No, just once
          </Chip>
          <Chip on={every === "week"} onClick={() => setEvery("week")}>
            Every week
          </Chip>
          <Chip on={every === "month"} onClick={() => setEvery("month")}>
            Every month
          </Chip>
        </div>
        <p className="text-caption mt-1.5 text-ink-muted">Regular costs are counted for you, so you only add them once.</p>
      </div>
      {problem && (
        <p role="alert" className="text-body text-danger">
          {problem}
        </p>
      )}
      <button type="button" className="btn btn-lg w-full rounded-pill" onClick={save} disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />} Save
      </button>
    </Sheet>
  );
}
