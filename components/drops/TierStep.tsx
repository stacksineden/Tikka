"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import { TextInput } from "@/components/setup/Fields";
import type { CardFace } from "@/components/tikka/TikkaCard";
import { LIMITS, rewardFromText, rewardLabel, rewardText, splitCondition, type DraftReward, type DropDraft, type Errors } from "@/lib/drop";
import { count, percent } from "@/lib/format";
import type { DropTemplate } from "@/lib/templates";
import type { Tier } from "@/lib/types";
import { LiveCard } from "./LiveCard";

export const TIER_COPY: Record<Tier, { word: string; heading: string; sub: string; share: string; placeholder: string }> = {
  legendary: {
    word: "Legendary",
    heading: "Your Legendary Tikka",
    sub: "The big one. Very few people get it, so make it exciting.",
    share: "very few",
    placeholder: "e.g. Free full glam",
  },
  rare: {
    word: "Rare",
    heading: "Your Rare Tikka",
    sub: "A nice extra for some people. Tie it to a booking or a spend.",
    share: "some",
    placeholder: "e.g. Free lashes",
  },
  thank_you: {
    word: "Thank-you",
    heading: "Your Thank-you Tikka",
    sub: "Everyone else gets this. Small, but worth coming in for.",
    share: "everyone else",
    placeholder: "e.g. ₦3,000 off any service",
  },
};

/** One tap puts these under the reward; owners can also write their own. */
export const CONDITIONS = ["With any paid service", "Book your slot ahead", "Weekdays only", "First visit only"];

/** Ready-made rewards for this tier from the business's category, as ideas. */
function ideasFor(templates: DropTemplate[], tier: Tier, current: string): { text: string; terms: string }[] {
  const seen = new Set<string>([current.trim().toLowerCase()]);
  const out: { text: string; terms: string }[] = [];
  for (const t of templates)
    for (const r of t.rewards) {
      if (r.tier !== tier) continue;
      const s = splitCondition(r);
      const text = rewardLabel({ ...r, ...s });
      if (seen.has(text.toLowerCase()) || text.length > LIMITS.reward) continue;
      seen.add(text.toLowerCase());
      out.push({ text, terms: s.terms });
    }
  return out.slice(0, 3);
}

/** One tier on its own screen: the card as customers see it, then what they get, when it applies, and how many. */
export function TierStep({
  tier,
  draft,
  filled,
  errors,
  templates,
  face,
  expiry,
  onReward,
  onRemove,
}: {
  tier: Tier;
  draft: DropDraft;
  /** With thank-you filled in. */
  filled: DropDraft;
  errors: Errors;
  templates: DropTemplate[];
  face: CardFace & { prefix: string };
  expiry: string;
  onReward: (id: string, next: DraftReward, countChanged?: boolean) => void;
  onRemove: (id: string) => void;
}) {
  const copy = TIER_COPY[tier];
  const rewards = filled.rewards.filter((r) => r.tier === tier);
  const first = rewards[0];
  if (!first) return null;

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start lg:gap-10">
      <div className="-mx-4 -mt-6 overflow-hidden bg-night px-4 pb-5 pt-4 lg:sticky lg:top-20 lg:m-0 lg:rounded-card lg:p-5" data-theme="light">
        <p className="text-caption mb-3 text-center font-mono uppercase tracking-[0.12em] text-on-night-muted">How customers see it</p>
        <div className="flex justify-center">
          <div className="[zoom:0.66] lg:[zoom:1]">
            <LiveCard reward={first} face={face} total={draft.total} finish={draft.finish} prefix={face.prefix} expiry={expiry} />
          </div>
        </div>
      </div>

      <div className="grid gap-6">
        <div>
          <h1 className="text-heading">{copy.heading}</h1>
          <p className="text-body mt-1 text-ink-muted">{copy.sub}</p>
        </div>
        {errors.counts && (
          <p role="alert" className="text-label rounded-md bg-danger-soft px-3 py-2.5 text-danger">
            {errors.counts}
          </p>
        )}
        {rewards.map((r, i) => (
          <RewardFields
            key={r.id}
            reward={r}
            total={draft.total}
            errors={errors}
            ideas={i === 0 ? ideasFor(templates, tier, rewardText(r)) : []}
            onChange={(next, countChanged) => onReward(r.id, next, countChanged)}
            onRemove={i > 0 ? () => onRemove(r.id) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

function RewardFields({
  reward: r,
  total,
  errors,
  ideas,
  onChange,
  onRemove,
}: {
  reward: DraftReward;
  total: number;
  errors: Errors;
  ideas: { text: string; terms: string }[];
  onChange: (next: DraftReward, countChanged?: boolean) => void;
  onRemove?: () => void;
}) {
  const copy = TIER_COPY[r.tier];
  const text = rewardText(r);
  const setCount = (n: number) => onChange({ ...r, count: Math.max(0, Math.min(total, n)) }, true);
  const setAction = (v: string) =>
    onChange(
      v.trim()
        ? { ...r, type: "action", action: v, what: r.type === "action" ? r.what : rewardLabel(r), value: null, minSpend: null }
        : rewardFromText({ ...r, type: "perk", action: "" }, text),
    );

  return (
    <div className={`grid gap-6 ${onRemove ? "rounded-card border border-line bg-surface-raised p-4" : ""}`}>
      {onRemove && (
        <div className="-mb-3 flex items-center justify-between">
          <span className="text-label">Another {copy.word} reward</span>
          <button type="button" onClick={onRemove} className="grid size-11 place-items-center rounded-md text-ink-muted" aria-label={`Remove ${rewardLabel(r)}`}>
            <Trash2 size={18} aria-hidden="true" />
          </button>
        </div>
      )}

      <div className="grid gap-2">
        <TextInput
          label="What they get"
          value={text}
          max={LIMITS.reward}
          placeholder={copy.placeholder}
          error={errors[`reward-${r.id}`]}
          onChange={(v) => onChange(rewardFromText(r, v))}
        />
        {ideas.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-caption text-ink-muted">Ideas:</span>
            {ideas.map((idea) => (
              <button
                key={idea.text}
                type="button"
                onClick={() => onChange({ ...rewardFromText({ ...r, type: "perk", action: "" }, idea.text), terms: idea.terms || r.terms })}
                className="text-caption min-h-11 rounded-pill bg-surface-sunken px-3 text-left text-ink"
              >
                {idea.text}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-3">
        <div>
          <p className="text-label">When does it apply?</p>
          <p className="text-caption text-ink-muted">Shows on the card under the reward. Tap one, or write your own.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {CONDITIONS.map((c) => {
            const on = r.terms === c;
            return (
              <button
                key={c}
                type="button"
                aria-pressed={on}
                onClick={() => onChange({ ...r, terms: on ? "" : c })}
                className={`text-label min-h-11 rounded-pill border px-4 ${on ? "border-brand bg-brand text-on-brand" : "border-line-strong/50 bg-surface-raised text-ink"}`}
              >
                {c}
              </button>
            );
          })}
        </div>
        <TextInput
          label="Or write it yourself"
          value={r.terms}
          max={LIMITS.terms}
          placeholder="e.g. When you book makeup at ₦20,000"
          error={errors[`terms-${r.id}`]}
          onChange={(v) => onChange({ ...r, terms: v.replace(/\s+/g, " ").replace(/^ /, "") })}
        />
      </div>

      {r.tier === "thank_you" ? (
        <p className="text-body rounded-md bg-surface-sunken px-3 py-3">
          Everyone else gets this one: <b className="tabular-nums">{count(r.count)} Tikkas</b>.
        </p>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span>
            <span className="text-label block">How many</span>
            <span className="text-caption block text-ink-muted tabular-nums">
              {count(r.count)} of {count(total)} · {copy.share} ({percent(r.count, total, 1)})
            </span>
          </span>
          <span className="flex items-center gap-2">
            <button type="button" onClick={() => setCount(r.count - 1)} className="grid size-11 place-items-center rounded-md border border-line-strong/50 bg-surface-raised" aria-label="One fewer">
              <Minus size={18} aria-hidden="true" />
            </button>
            <input
              className="input h-11 w-20 text-center font-mono text-[17px] tabular-nums"
              inputMode="numeric"
              aria-label={`How many ${copy.word}`}
              aria-invalid={!!errors[`count-${r.id}`]}
              value={r.count}
              onChange={(e) => setCount(Number(e.target.value.replace(/\D/g, "").slice(0, 5)) || 0)}
            />
            <button type="button" onClick={() => setCount(r.count + 1)} className="grid size-11 place-items-center rounded-md border border-line-strong/50 bg-surface-raised" aria-label="One more">
              <Plus size={18} aria-hidden="true" />
            </button>
          </span>
          {errors[`count-${r.id}`] && (
            <p role="alert" className="text-caption w-full font-semibold text-danger">
              {errors[`count-${r.id}`]}
            </p>
          )}
        </div>
      )}

      {r.tier !== "thank_you" && (
        <details className="group rounded-card border border-line bg-surface-raised" open={r.type === "action" || undefined}>
          <summary className="text-label flex min-h-12 cursor-pointer list-none items-center justify-between px-4 [&::-webkit-details-marker]:hidden">
            Ask them to do something first
            <span className="text-ink-muted transition-transform group-open:rotate-45" aria-hidden="true">
              +
            </span>
          </summary>
          <div className="grid gap-2 border-t border-line p-4">
            <TextInput
              label="What they do, then show at the counter"
              value={r.action}
              placeholder="e.g. Follow us on Instagram"
              hint="Staff tick that they did it before giving the reward. Leave it empty if there's nothing to do."
              onChange={setAction}
            />
          </div>
        </details>
      )}
    </div>
  );
}
