"use client";

// Something spent, taken back: each expense added this week, and each regular cost, with Remove
// (asked once more, so a slip doesn't lose anything). remove_expense() / stop_regular_cost().

import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { removeExpenseAction } from "@/app/app/today-actions";

export interface SpentItem {
  id: string;
  kind: "once" | "regular";
  label: string;
  sub: string;
  amount: string;
}

export function SpentList({ items, empty }: { items: SpentItem[]; empty: string }) {
  const router = useRouter();
  const [asking, setAsking] = useState<string | null>(null);
  const [problem, setProblem] = useState<string>();
  const [pending, start] = useTransition();

  function remove(it: SpentItem) {
    start(async () => {
      const r = await removeExpenseAction(it.kind, it.id);
      if (r.ok) {
        setAsking(null);
        setProblem(undefined);
        router.refresh();
      } else setProblem("That didn't go through. Try again.");
    });
  }

  return (
    <div className="divide-y divide-line rounded-card border border-line bg-surface-raised">
      {items.length === 0 && <p className="text-body px-4 py-3.5 text-ink-muted">{empty}</p>}
      {items.map((it) => (
        <div key={it.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <span className="min-w-0">
            <b>{it.label}</b>
            <span className="text-caption block text-ink-muted">{it.sub}</span>
          </span>
          {asking === it.id ? (
            <span className="flex items-center gap-2">
              <span className="text-caption text-ink-muted">{it.kind === "regular" ? "Stop counting it?" : "Remove it?"}</span>
              <button type="button" onClick={() => remove(it)} disabled={pending} className="text-label min-h-11 rounded-md bg-danger px-3 text-on-danger">
                {pending ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : "Yes"}
              </button>
              <button type="button" onClick={() => setAsking(null)} className="text-label min-h-11 rounded-md px-2 text-ink-muted">
                No
              </button>
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <b className="text-code">{it.amount}</b>
              <button
                type="button"
                onClick={() => setAsking(it.id)}
                aria-label={`Remove ${it.label}, ${it.amount}`}
                className="grid size-11 place-items-center rounded-pill text-ink-muted hover:text-danger"
              >
                <Trash2 size={18} aria-hidden="true" />
              </button>
            </span>
          )}
        </div>
      ))}
      {problem && (
        <p role="alert" className="text-caption px-4 py-2 text-danger">
          {problem}
        </p>
      )}
    </div>
  );
}
