// The drop check (PRD B5 screen 4): friendly warnings, each with a one-tap fix, never blocking.
// Pure, so the builder shows them live and publish_drop records the ones left (ignored_warnings,
// which the guarantee reads).

import { applyMix, AUDIENCE, DEFAULT_BOUNCE_BACK, needsPurchase, setTierCount, tierCount, withThankYouFilled, type DropDraft } from "./drop";
import { count } from "./format";

export type WarningId = "no_purchase" | "long_validity" | "empty_thank_you" | "too_big" | "no_bounce_back" | "big_legendary";

export interface DropWarning {
  id: WarningId;
  text: string;
  fix: string;
}

/** The condition the fix puts under Rare, so it needs a purchase. */
export const FIX_RARE_TERMS = "With any paid service";
export const SUGGESTED_THANK_YOU = "10% off any service";

/** The size the audience answer suggests (about 1 Tikka per 3 viewers), or null if not answered. */
export function suggestedSize(d: Pick<DropDraft, "audienceBand">): number | null {
  return AUDIENCE.find((a) => a.id === d.audienceBand)?.suggest ?? null;
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
  return w;
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
  }
}
