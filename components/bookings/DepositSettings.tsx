"use client";

import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveDepositSettingsAction } from "@/app/app/bookings-actions";
import type { DepositSettings as Settings, ServiceDepositMode } from "@/lib/bookings";
import { naira } from "@/lib/format";

type Svc = { id: string; name: string; priceKobo?: number; priced: boolean };

const PERCENTS = [20, 30, 40, 50, 60];

/**
 * Deposits (docs/BOOKINGS.md, REVENUE_PLAN 5.4): one switch for every service; the owner picks the
 * amount herself (nothing pre-picked). Services without a set price can only take a fixed ₦. Any
 * service can differ under More options. One decision per block.
 */
export function DepositSettings({
  initial,
  services,
  serviceDeposits,
  maxKobo,
}: {
  initial: Settings;
  services: Svc[];
  serviceDeposits: Record<string, { mode: ServiceDepositMode; kobo?: number }>;
  maxKobo: number;
}) {
  const router = useRouter();
  const [on, setOn] = useState(initial.mode !== "off");
  const [kind, setKind] = useState<"percent" | "fixed" | null>(initial.mode === "off" ? null : initial.mode);
  const [percent, setPercent] = useState<number | null>(initial.percent ?? null);
  const [other, setOther] = useState(initial.percent && !PERCENTS.includes(initial.percent) ? String(initial.percent) : "");
  const [fixed, setFixed] = useState(initial.fixedKobo ? String(initial.fixedKobo / 100) : "");
  const [counts, setCounts] = useState(initial.counts);
  const [own, setOwn] = useState<Record<string, { mode: ServiceDepositMode | null; naira: string }>>(
    Object.fromEntries(services.map((s) => [s.id, { mode: serviceDeposits[s.id]?.mode ?? null, naira: serviceDeposits[s.id]?.kobo ? String(serviceDeposits[s.id].kobo! / 100) : "" }])),
  );
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const unpriced = services.filter((s) => !s.priced);
  const pct = kind === "percent" ? (percent ?? (Number(other) || null)) : null;

  function preview(s: Svc): string {
    const o = own[s.id];
    let d = 0;
    if (o?.mode === "none") return "No deposit";
    if (o?.mode === "fixed") d = Math.round(Number(o.naira) * 100) || 0;
    else if (o?.mode === "full") d = s.priced ? (s.priceKobo ?? 0) : 0;
    else if (!on) return "No deposit";
    else if (kind === "percent") d = s.priced ? Math.round(((s.priceKobo ?? 0) * (pct ?? 0)) / 100) : Math.round(Number(fixed) * 100) || 0;
    else if (kind === "fixed") d = Math.round(Number(fixed) * 100) || 0;
    if (d <= 0 || (s.priced && (s.priceKobo ?? 0) < 100000)) return "No deposit";
    d = Math.max(d, 100000);
    if (s.priced) d = Math.min(d, s.priceKobo ?? d);
    d = Math.min(d, maxKobo);
    return `${naira(d / 100)} deposit`;
  }

  function save() {
    setError("");
    setSaved(false);
    if (on && !kind) return setError("Pick how much deposit to take.");
    if (on && kind === "percent" && !pct) return setError("Pick a percentage.");
    if (on && (kind === "fixed" || (kind === "percent" && unpriced.length > 0)) && !Number(fixed)) {
      return setError(kind === "fixed" ? "Type the deposit amount." : "Type the deposit for services without a set price.");
    }
    start(async () => {
      const r = await saveDepositSettingsAction({
        mode: on && kind ? kind : "off",
        percent: pct,
        fixedNaira: Number(fixed) || null,
        counts,
        services: Object.fromEntries(Object.entries(own).map(([id, o]) => [id, { mode: o.mode, naira: o.mode === "fixed" ? Number(o.naira) : null }])),
      });
      if (!r.ok) return setError(r.error);
      setSaved(true);
      router.refresh();
    });
  }

  const chip = (active: boolean) => `min-h-11 rounded-md border px-3 font-semibold ${active ? "border-brand bg-brand-soft text-brand" : "border-line-strong"}`;

  return (
    <section className="grid gap-4 rounded-card border border-line bg-surface-raised p-4 sm:p-5">
      <div>
        <h2 className="text-title">Deposits</h2>
        <p className="text-body mt-1 text-ink-muted">A deposit holds the time, so no-shows don&apos;t cost you. Customers see it before they pay. It isn&apos;t refundable through Tikka.</p>
      </div>
      <label className="flex min-h-11 items-center gap-3">
        <input type="checkbox" className="size-5 shrink-0" checked={on} onChange={(e) => setOn(e.target.checked)} />
        <span className="text-body font-semibold">Take a deposit when people book</span>
      </label>

      {on && (
        <>
          <fieldset className="grid gap-2">
            <legend className="text-label mb-1">How much deposit?</legend>
            <div className="flex flex-wrap gap-2">
              {PERCENTS.map((p) => (
                <button key={p} type="button" aria-pressed={kind === "percent" && percent === p} className={chip(kind === "percent" && percent === p)} onClick={() => (setKind("percent"), setPercent(p), setOther(""))}>
                  {p}%
                </button>
              ))}
              <button type="button" aria-pressed={kind === "percent" && percent === null} className={chip(kind === "percent" && percent === null)} onClick={() => (setKind("percent"), setPercent(null))}>
                Other %
              </button>
              <button type="button" aria-pressed={kind === "fixed"} className={chip(kind === "fixed")} onClick={() => setKind("fixed")}>
                A fixed ₦ amount
              </button>
            </div>
            {kind === "percent" && percent === null && (
              <label className="grid max-w-40 gap-1">
                <span className="text-caption text-ink-muted">Percentage (5 to 100)</span>
                <input className="input" inputMode="numeric" value={other} onChange={(e) => setOther(e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="35" />
              </label>
            )}
          </fieldset>

          {(kind === "fixed" || (kind === "percent" && unpriced.length > 0)) && (
            <label className="grid gap-1">
              <span className="text-label">{kind === "fixed" ? "Deposit for every service (₦)" : `Deposit for services without a set price (₦): ${unpriced.map((s) => s.name).join(", ")}`}</span>
              <input className="input max-w-48 font-mono" inputMode="numeric" value={fixed} onChange={(e) => setFixed(e.target.value.replace(/\D/g, "").slice(0, 9))} placeholder="5000" />
            </label>
          )}

          <label className="flex min-h-11 items-start gap-3">
            <input type="checkbox" className="mt-1 size-5 shrink-0" checked={counts} onChange={(e) => setCounts(e.target.checked)} />
            <span className="text-body">
              The deposit counts towards their bill
              <span className="text-caption block text-ink-muted">Untick if it&apos;s a separate booking fee.</span>
            </span>
          </label>
        </>
      )}

      <details className="group rounded-md border border-line p-3">
        <summary className="text-label flex min-h-11 cursor-pointer list-none items-center justify-between">
          More options: a different deposit for a service
          <ChevronDown size={20} className="transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <ul className="mt-2 grid gap-3">
          {services.map((s) => (
            <li key={s.id} className="grid gap-1">
              <div className="flex items-center justify-between gap-3">
                <span className="text-body min-w-0 truncate font-medium">{s.name}</span>
                <select
                  className="input w-44 shrink-0"
                  value={own[s.id]?.mode ?? ""}
                  onChange={(e) => setOwn((o) => ({ ...o, [s.id]: { ...o[s.id], mode: (e.target.value || null) as ServiceDepositMode | null } }))}
                >
                  <option value="">Same as above</option>
                  <option value="none">No deposit</option>
                  <option value="fixed">A fixed amount</option>
                  {s.priced && <option value="full">Pay in full</option>}
                </select>
              </div>
              {own[s.id]?.mode === "fixed" && (
                <input
                  className="input max-w-44 justify-self-end font-mono"
                  inputMode="numeric"
                  placeholder="₦"
                  value={own[s.id].naira}
                  onChange={(e) => setOwn((o) => ({ ...o, [s.id]: { ...o[s.id], naira: e.target.value.replace(/\D/g, "").slice(0, 9) } }))}
                />
              )}
              <span className="text-caption justify-self-end text-ink-muted">{preview(s)}</span>
            </li>
          ))}
        </ul>
      </details>

      <p className="text-caption text-ink-muted">At least ₦1,000, never more than the price or {naira(maxKobo / 100)} for now. Bookings with a Tikka, or that you add yourself, never take a deposit.</p>
      <button type="button" className="btn min-h-12" disabled={pending} onClick={save}>
        {pending ? "Saving…" : "Save deposits"}
      </button>
      <p role="alert" className="text-caption min-h-5 text-danger">
        {error}
      </p>
      {saved && <p className="text-caption text-success">Saved. Customers see it on your page now.</p>}
    </section>
  );
}
