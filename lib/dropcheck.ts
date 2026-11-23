// The drop check (PRD B5 screen 4): friendly warnings, each with a one-tap fix, never blocking.
// Pure, so the builder shows them live and publish_drop records the ones left (ignored_warnings,
// which the guarantee reads).

import { applyMix, AUDIENCE, DEFAULT_BOUNCE_BACK, needsPurchase, setTierCount, suggestDropSize, tierCount, withThankYouFilled, type DraftReward, type DropDraft } from "./drop";
import type { Tier } from "./types";
import { count } from "./format";

export type WarningId = "no_purchase" | "long_validity" | "empty_thank_you" | "too_big" | "no_bounce_back" | "big_legendary" | "tier_order";

export interface DropWarning {
  id: WarningId;
  text: string;
  fix: string;
}

/** The condition the fix puts under Rare, so it needs a purchase. */
export const FIX_RARE_TERMS = "With any paid service";
export const SUGGESTED_THANK_YOU = "10% off any service";

/** The size the audience answer suggests (half the people who see the posts), or null if not answered. */
export function suggestedSize(d: Pick<DropDraft, "audienceBand" | "audienceViews">): number | null {
  return suggestDropSize(d.audienceViews) ?? AUDIENCE.find((a) => a.id === d.audienceBand)?.suggest ?? null;
}

export function dropCheck(d: DropDraft): DropWarning[] {
  const w: DropWarning[] = [];
  const filled = withThankYouFilled(d);
  const top = filled.rewards.filter((r) => r.tier !== "thank_you" && r.count > 0);
  if (top.length && !top.some(needsPurchase)) {
    w.push({ id: "no_purchase", text: "You may attract people who only want freebies.", fix: `Add "${FIX_RARE_TERMS}" to Rare` });
  }
  if (d.validityDays === 30) {
    w.push({ id: "long_validity", text: "Shorter deadlines get more people through the door.", fix: "Change to 14 days" });
  }
  if (filled.rewards.some((r) => r.tier === "thank_you" && r.count > 0 && !r.what.trim() && r.type !== "percent_off" && r.type !== "naira_off")) {
    w.push({ id: "empty_thank_you", text: "People may feel disappointed.", fix: `Use "${SUGGESTED_THANK_YOU}"` });
  }
  const suggest = suggestedSize(d);
  if (suggest && d.total > suggest * 2) {
    w.push({ id: "too_big", text: "You may not fill this drop.", fix: `Use ${count(suggest)} Tikkas` });
  }
  if (!d.bounceBack.on) {
    w.push({ id: "no_bounce_back", text: "Give people a reason to come back.", fix: "Turn on the next-visit Tikka" });
  }
  if (d.total > 0 && tierCount(filled, "legendary") / d.total > 0.1) {
    w.push({ id: "big_legendary", text: "This could cost you a lot.", fix: "Make Legendary 2%" });
  }
  const order = tierOrderProblem(filled);
  if (order) {
    w.push({ id: "tier_order", text: `Your ${TIER_WORD[order.lower]} card gives more than your ${TIER_WORD[order.higher]} card.`, fix: `Swap ${TIER_WORD[order.lower]} and ${TIER_WORD[order.higher]}` });
  }
  return w;
}

const TIER_WORD: Record<Tier, string> = { legendary: "Legendary", rare: "Rare", thank_you: "Thank-you" };

/** How much a reward takes off, read from its type or, for action cards and anything typed
 *  loosely ("50% off any service"), from its words. Null when it isn't a % or ₦ off. */
export function amountOff(r: Pick<DraftReward, "type" | "value" | "what">): { unit: "%" | "₦"; n: number } | null {
  if (r.type === "percent_off" && r.value) return { unit: "%", n: r.value };
  if (r.type === "naira_off" && r.value) return { unit: "₦", n: r.value };
  const pct = r.what.match(/(\d+(?:\.\d+)?)\s*%\s*off\b/i);
  if (pct) return { unit: "%", n: Number(pct[1]) };
  const off = r.what.match(/₦\s*([\d,]+)\s*off\b/i);
  if (off) return { unit: "₦", n: Number(off[1].replace(/,/g, "")) };
  return null;
}

/** A rarer tier giving less than a commoner one (Legendary 40% off, Rare 50% off). Only compares
 *  like with like: both % off or both ₦ off. Returns the first pair out of order, rarest first. */
export function tierOrderProblem(d: Pick<DropDraft, "rewards">): { higher: Tier; lower: Tier } | null {
  const best = (tier: Tier) => {
    const amounts = d.rewards.filter((r) => r.tier === tier && r.count > 0).map(amountOff).filter((a) => a !== null);
    if (!amounts.length || amounts.some((a) => a.unit !== amounts[0].unit)) return null;
    return { unit: amounts[0].unit, n: Math.max(...amounts.map((a) => a.n)) };
  };
  const pairs: [Tier, Tier][] = [["legendary", "rare"], ["rare", "thank_you"], ["legendary", "thank_you"]];
  for (const [higher, lower] of pairs) {
    const h = best(higher);
    const l = best(lower);
    if (h && l && h.unit === l.unit && l.n > h.n) return { higher, lower };
  }
  return null;
}

/** Swaps what two tiers give (the reward, its condition and any action), keeping each tier's count. */
function swapTiers(d: DropDraft, a: Tier, b: Tier): DropDraft {
  const ra = d.rewards.find((r) => r.tier === a && r.count > 0);
  const rb = d.rewards.find((r) => r.tier === b && r.count > 0);
  if (!ra || !rb) return d;
  const give = ({ type, value, what, action, terms, minSpend, requiresPurchase, text }: DraftReward) => ({ type, value, what, action, terms, minSpend, requiresPurchase, text });
  return { ...d, rewards: d.rewards.map((r) => (r === ra ? { ...r, ...give(rb) } : r === rb ? { ...r, ...give(ra) } : r)) };
}

/** The one-tap fix for a warning. */
export function applyFix(d: DropDraft, id: WarningId): DropDraft {
  switch (id) {
    case "no_purchase": {
      let done = false;
      return {
        ...d,
        rewards: d.rewards.map((r) => {
          if (done || r.tier !== "rare") return r;
          done = true;
          return { ...r, terms: FIX_RARE_TERMS, requiresPurchase: true };
        }),
      };
    }
    case "long_validity":
      return { ...d, validityDays: 14 };
    case "empty_thank_you":
      return { ...d, rewards: d.rewards.map((r) => (r.tier === "thank_you" ? { ...r, type: "percent_off", value: 10, what: "any service" } : r)) };
    case "too_big": {
      const s = suggestedSize(d);
      return s ? (d.mix === "custom" ? withThankYouFilled({ ...d, total: s }) : applyMix({ ...d, total: s }, d.mix)) : d;
    }
    case "no_bounce_back":
      return { ...d, bounceBack: { ...(d.bounceBack.what.trim() ? d.bounceBack : DEFAULT_BOUNCE_BACK), on: true } };
    case "big_legendary":
      return withThankYouFilled(setTierCount({ ...d, mix: "custom" }, "legendary", Math.max(1, Math.round(d.total * 0.02))));
    case "tier_order": {
      const p = tierOrderProblem(withThankYouFilled(d));
      return p ? swapTiers(d, p.higher, p.lower) : d;
    }
  }
}
