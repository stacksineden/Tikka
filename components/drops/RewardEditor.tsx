"use client";

import { Trash2 } from "lucide-react";
import { useId } from "react";
import { REWARD_TYPES, rewardLabel, THANK_YOU_SUGGESTIONS, WITH_PURCHASE, type DraftReward } from "@/lib/drop";
import { count as fmtCount, percent } from "@/lib/format";
import type { RewardType } from "@/lib/types";

const isDiscount = (t: RewardType) => t === "percent_off" || t === "naira_off";


/** Changing type keeps what still makes sense: the amount if it's the same kind, the item text otherwise. */
function switchType(r: DraftReward, type: RewardType): Partial<DraftReward> {
  if (type === r.type) return {};
  const value = type === "percent_off" ? 20 : type === "naira_off" ? 5000 : null;
  const what = isDiscount(type) ? (isDiscount(r.type) ? r.what : "any service") : isDiscount(r.type) ? "" : r.what;
  return { type, value, what };
}

/** One reward inside a tier: what they get, how many, and optional terms. */
export function RewardEditor({
  reward,
  total,
  onChange,
  onRemove,
  error,
  countError,
  showCount,
}: {
  reward: DraftReward;
  total: number;
  onChange: (p: Partial<DraftReward>) => void;
  onRemove?: () => void;
  error?: string;
  countError?: string;
  showCount: boolean;
}) {
  const id = useId();
  const r = reward;
  const num = (v: string) => {
    const d = v.replace(/\D/g, "").slice(0, 9);
    return d ? Number(d) : null;
  };
  const types = r.tier === "thank_you" ? REWARD_TYPES.filter((t) => t.type !== "action") : REWARD_TYPES;

  return (
    <div className="grid gap-3 rounded-md border border-line bg-surface-raised p-3 sm:p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Reward type">
          {types.map((t) => {
            const on = r.type === t.type;
            return (
              <button
                key={t.type}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onChange(switchType(r, t.type))}
                className={`text-label min-h-10 rounded-pill border px-3 ${on ? "border-brand bg-brand text-on-brand" : "border-line-strong/50 text-ink"}`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="grid size-10 shrink-0 place-items-center rounded-md text-ink-muted hover:bg-surface-sunken"
            aria-label={`Remove ${rewardLabel(r)}`}
          >
            <Trash2 size={18} aria-hidden="true" />
          </button>
        )}
      </div>

      {/* what they get */}
      {(r.type === "percent_off" || r.type === "naira_off") && (
        <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-2">
          <div className="relative">
            {r.type === "naira_off" && (
              <span className="text-body pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden="true">
                ₦
              </span>
            )}
            <input
              className={`input tabular-nums ${r.type === "naira_off" ? "pl-7" : "pr-8"}`}
              inputMode="numeric"
              value={r.value ?? ""}
              aria-label={r.type === "percent_off" ? "Percentage off" : "Naira off"}
              aria-invalid={!!error}
              onChange={(e) => onChange({ value: num(e.target.value) })}
            />
            {r.type === "percent_off" && (
              <span className="text-body pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden="true">
                %
              </span>
            )}
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-body shrink-0 text-ink-muted">off</span>
            <input className="input min-w-0" value={r.what} placeholder="any service" aria-label="Off what" onChange={(e) => onChange({ what: e.target.value })} />
          </div>
        </div>
      )}
      {r.type === "free_item" && (
        <input
          className="input"
          value={r.what}
          placeholder="e.g. Signature facial"
          aria-label="Free item"
          aria-invalid={!!error}
          onChange={(e) => onChange({ what: e.target.value })}
        />
      )}
      {r.type === "perk" && (
        <div className="grid gap-2">
          <input
            className="input"
            value={r.what}
            placeholder={r.tier === "thank_you" ? "e.g. Priority booking" : "e.g. Skip the queue"}
            aria-label="Perk"
            aria-invalid={!!error}
            onChange={(e) => onChange({ what: e.target.value })}
          />
          {r.tier === "thank_you" && (
            <div className="flex flex-wrap gap-1.5">
              {THANK_YOU_SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => onChange({ what: s })} className="text-caption min-h-9 rounded-pill bg-surface-sunken px-3 text-ink">
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {r.type === "action" && (
        <div className="grid gap-2">
          <label className="grid gap-1">
            <span className="text-caption text-ink-muted">What they do, then show at the counter</span>
            <input
              className="input"
              value={r.action}
              placeholder="e.g. Follow @glowstudio on Instagram"
              aria-invalid={!!error && !r.action.trim()}
              onChange={(e) => onChange({ action: e.target.value })}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-caption text-ink-muted">What they get for it</span>
            <input
              className="input"
              value={r.what}
              placeholder="e.g. Free brow tint"
              aria-invalid={!!error && !r.what.trim()}
              onChange={(e) => onChange({ what: e.target.value })}
            />
          </label>
          <p className="text-caption text-ink-muted">Match the effort to the reward. Big asks need big rewards.</p>
        </div>
      )}

      {r.tier !== "thank_you" && r.type !== "action" && (
        <label className="flex flex-wrap items-center gap-2">
          <span className="text-caption text-ink-muted">Minimum spend (optional)</span>
          <span className="relative">
            <span className="text-body pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden="true">
              ₦
            </span>
            <input
              className="input h-11 w-32 pl-7 tabular-nums"
              inputMode="numeric"
              value={r.minSpend ?? ""}
              aria-label="Minimum spend in naira"
              onChange={(e) => {
                const v = num(e.target.value);
                onChange({ minSpend: v, requiresPurchase: !!v || isDiscount(r.type) || WITH_PURCHASE.test(r.what) });
              }}
            />
          </span>
        </label>
      )}

      <input
        className="input h-11 text-[15px]"
        value={r.terms}
        maxLength={60}
        placeholder="Terms (optional), e.g. Weekdays only"
        aria-label="Terms (optional)"
        onChange={(e) => onChange({ terms: e.target.value })}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-caption text-ink-muted">
          Shows as <span className="font-semibold text-ink">{rewardLabel(r)}</span>
          {r.type === "action" && r.action.trim() ? ` · after: ${r.action.trim()}` : ""}
        </p>
        {showCount && (
          <label className="flex items-center gap-2" htmlFor={`${id}-n`}>
            <span className="text-label">How many</span>
            <input
              id={`${id}-n`}
              className="input h-11 w-24 text-center tabular-nums"
              inputMode="numeric"
              value={r.count}
              aria-invalid={!!countError}
              onChange={(e) => onChange({ count: num(e.target.value) ?? 0 })}
            />
            <span className="text-caption w-12 text-ink-muted">{percent(r.count, total, 1)}</span>
          </label>
        )}
      </div>
      {(error || countError) && (
        <p role="alert" className="text-caption font-semibold text-danger">
          {error ?? countError}
        </p>
      )}
      {!showCount && r.count > 0 && (
        <p className="text-caption text-ink-muted">
          {fmtCount(r.count)} Tikkas: everyone who doesn&apos;t get legendary or rare.
        </p>
      )}
    </div>
  );
}
