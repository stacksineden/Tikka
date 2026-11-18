"use client";

import { Banknote, Check } from "lucide-react";
import { useState } from "react";
import { setSpentAction } from "@/app/app/actions";
import { naira } from "@/lib/format";
import { formatNairaInput, spentProblem } from "@/lib/spent";

/**
 * "What did they spend?" after redeeming (owner only): add the amount skipped at the counter, or
 * fix a typo, so the drop's results count that sale. On Leads (by claim) and on the counter screen
 * (by code). `row` is the quiet link on a lead; `panel` sits on a coloured counter result.
 */
export function SpentEdit({
  target,
  name,
  spent,
  variant = "row",
  onOpen,
}: {
  target: { claimId: string } | { code: string };
  name: string;
  /** What's recorded now, in naira (none when nobody typed it). */
  spent?: number;
  variant?: "row" | "panel";
  /** The counter screen stops moving on to the next scan while the owner types. */
  onOpen?: () => void;
}) {
  const first = name.split(" ")[0] || "they";
  const [state, setState] = useState<{ kind: "idle" | "editing" | "saving" } | { kind: "saved"; naira: number } | { kind: "error"; text: string }>({ kind: "idle" });
  const [value, setValue] = useState(spent ? formatNairaInput(String(spent)) : "");
  const inputId = `spent-${"claimId" in target ? target.claimId : target.code}`;
  const panel = variant === "panel";

  if (state.kind === "saved") {
    return (
      <p className={`text-body flex items-center gap-1.5 ${panel ? "mt-4 rounded-md bg-surface-raised p-4 text-ink" : "text-success lg:col-span-4"}`} role="status">
        <Check size={18} aria-hidden="true" />
        {state.naira ? `Saved. ${naira(state.naira)} added to your drop's results.` : "Saved. No amount for this visit."}
      </p>
    );
  }

  if (state.kind === "idle") {
    const label = spent ? "Change what they spent" : "Add what they spent";
    return panel ? (
      <button type="button" className="btn btn-secondary btn-lg mt-4 w-full" onClick={() => {
          onOpen?.();
          setState({ kind: "editing" });
        }}>
        <Banknote />
        {label}
      </button>
    ) : (
      <button
        type="button"
        className="text-label inline-flex min-h-11 items-center gap-1.5 justify-self-start font-semibold text-brand lg:col-span-4"
        onClick={() => setState({ kind: "editing" })}
      >
        <Banknote size={18} aria-hidden="true" />
        {label}
      </button>
    );
  }

  async function save() {
    setState({ kind: "saving" });
    try {
      const r = await setSpentAction(target, value);
      setState(r.kind === "saved" ? { kind: "saved", naira: r.naira } : { kind: "error", text: spentProblem(r.kind) });
    } catch {
      setState({ kind: "error", text: "No connection. Check your data and try again." });
    }
  }

  return (
    <form
      className={`grid gap-3 rounded-md bg-surface-raised p-4 text-ink ${panel ? "mt-4 text-left" : "border border-line-strong lg:col-span-4"}`}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <label htmlFor={inputId} className="text-title text-[17px]">
        What did {first} spend?
      </label>
      <div className="flex items-center rounded-md border-2 border-line-strong bg-surface-raised focus-within:outline-2 focus-within:outline-brand">
        <span className="pl-4 text-[22px] font-bold text-ink-muted" aria-hidden="true">
          ₦
        </span>
        <input
          id={inputId}
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          value={value}
          onChange={(e) => setValue(formatNairaInput(e.target.value))}
          placeholder="15,000"
          size={1}
          className="h-14 w-0 min-w-0 flex-1 bg-transparent px-2 text-[24px] font-bold tabular-nums outline-none"
        />
      </div>
      <p className="text-caption -mt-1 text-ink-muted">This adds to your drop&apos;s results. Leave it empty to remove the amount.</p>
      {state.kind === "error" && (
        <p role="alert" className="text-caption font-semibold text-danger">
          {state.text}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn min-h-11" disabled={state.kind === "saving"}>
          {state.kind === "saving" ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn btn-secondary min-h-11" onClick={() => setState({ kind: "idle" })}>
          Cancel
        </button>
      </div>
    </form>
  );
}
