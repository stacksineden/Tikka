"use client";

import { BadgeCheck, Landmark } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { banksAction, checkAccountAction, removePayoutAction, savePayoutAction } from "@/app/app/payout-actions";
import type { Bank } from "@/lib/paystack";

const PROBLEM: Record<string, string> = {
  not_found: "The bank couldn't find that account. Check the bank and the 10-digit number.",
  bad_number: "Type the 10-digit account number and pick the bank.",
  cant_check: "We couldn't check the name with the bank right now. You can still save it: the name shows before any money moves.",
  closed: "Getting paid isn't open for your business right now.",
  failed: "Paystack couldn't add this account. Try again in a minute.",
  slow_down: "Too many tries. Wait a little and try again.",
};

/**
 * Settings → Get paid (REVENUE_PLAN 5.3): pick the bank, type the account number, see the name
 * the bank has for it, confirm it's yours. Tikka adds it at Paystack; payments go there the next
 * working day. One decision per step.
 */
export function GetPaidForm({ current }: { current: { bankName: string; last4: string; accountName: string } | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(!current);
  const [banks, setBanks] = useState<Bank[] | null>(null);
  const [bank, setBank] = useState("");
  const [number, setNumber] = useState("");
  const [found, setFound] = useState<{ name: string } | { name: null } | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!editing || banks) return;
    let live = true;
    banksAction().then((b) => live && setBanks(b));
    return () => {
      live = false;
    };
  }, [editing, banks]);

  if (!editing && current) {
    return (
      <section className="rounded-card border border-line bg-surface-raised p-4 sm:p-5">
        <p className="text-label flex items-center gap-1.5 text-success">
          <BadgeCheck size={18} aria-hidden="true" />
          {saved ? "Saved" : "Payments go to"}
        </p>
        <p className="text-title mt-2">{current.accountName}</p>
        <p className="text-body mt-1 flex items-center gap-2 text-ink-muted">
          <Landmark size={16} aria-hidden="true" />
          {current.bankName} · ••••{current.last4}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:flex">
          <button type="button" className="btn btn-secondary min-h-11" onClick={() => (setEditing(true), setFound(null), setError(""))}>
            Change account
          </button>
          <button
            type="button"
            className="btn btn-ghost min-h-11 text-danger"
            disabled={pending}
            onClick={() => {
              if (!confirm("Remove this account? Customers can't pay you online until you add one again.")) return;
              start(async () => {
                await removePayoutAction();
                router.refresh();
              });
            }}
          >
            Remove
          </button>
        </div>
      </section>
    );
  }

  function check() {
    setError("");
    setFound(null);
    start(async () => {
      const r = await checkAccountAction(bank, number);
      if (r.kind === "found") return setFound({ name: r.name });
      if (r.kind === "cant_check") setFound({ name: null });
      setError(PROBLEM[r.kind] ?? "Something went wrong. Try again.");
    });
  }

  function save() {
    setError("");
    start(async () => {
      const r = await savePayoutAction(bank, number);
      if (r.kind !== "saved") return setError(PROBLEM[r.kind] ?? "Something went wrong. Try again.");
      setSaved(r.name);
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <section className="grid gap-3 rounded-card border border-line bg-surface-raised p-4 sm:p-5">
      <label className="grid gap-1">
        <span className="text-label">Your bank</span>
        <select className="input" value={bank} onChange={(e) => (setBank(e.target.value), setFound(null))} disabled={!banks?.length}>
          <option value="">{banks === null ? "Loading banks…" : banks.length ? "Pick your bank" : "Banks couldn't load. Refresh the page."}</option>
          {banks?.map((b) => (
            <option key={b.code} value={b.code}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1">
        <span className="text-label">Account number</span>
        <input
          className="input font-mono text-[18px] tracking-[0.08em]"
          inputMode="numeric"
          autoComplete="off"
          maxLength={10}
          placeholder="0123456789"
          value={number}
          onChange={(e) => (setNumber(e.target.value.replace(/\D/g, "").slice(0, 10)), setFound(null))}
        />
      </label>

      {!found && (
        <button type="button" className="btn min-h-12" disabled={pending || !bank || number.length !== 10} onClick={check}>
          {pending ? "Checking…" : "Check name"}
        </button>
      )}

      {found && (
        <div className="grid gap-3 rounded-md bg-surface-sunken p-4">
          {found.name ? (
            <>
              <p className="text-label text-ink-muted">The bank says this account belongs to</p>
              <p className="text-title">{found.name}</p>
              <p className="text-body">Is this your business&apos;s account?</p>
            </>
          ) : (
            <p className="text-body">We couldn&apos;t check the name right now. Save it and the name will show here: if it isn&apos;t yours, remove it.</p>
          )}
          <button type="button" className="btn min-h-12" disabled={pending} onClick={save}>
            {pending ? "Saving…" : found.name ? "Yes, use this account" : "Save and show the name"}
          </button>
          <button type="button" className="btn btn-secondary min-h-11" disabled={pending} onClick={() => (setFound(null), setNumber(""))}>
            No, try another
          </button>
        </div>
      )}

      <p role="alert" className="text-caption min-h-5 text-danger">
        {error}
      </p>
      {current && (
        <button type="button" className="btn btn-ghost min-h-11 justify-self-start" onClick={() => (setEditing(false), setError(""))}>
          Keep {current.bankName} ••••{current.last4}
        </button>
      )}
    </section>
  );
}
