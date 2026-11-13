import { SoloCard } from "@/components/tikka/SoloCard";
import type { CardFace } from "@/components/tikka/TikkaCard";
import { rewardLabel, type DraftReward } from "@/lib/drop";
import type { Finish } from "@/lib/types";

const TIER_WORD = { legendary: "Legendary", rare: "Rare", thank_you: "Thank-you" } as const;

/** The back of a Tikka exactly as the claimer will see it, from a reward still being written. */
export function LiveCard({
  reward: r,
  face,
  total,
  finish,
  prefix,
  expiry,
  zoom = 1,
}: {
  reward: DraftReward;
  face: CardFace;
  total: number;
  finish: Finish;
  prefix: string;
  /** "30 Nov" */
  expiry: string;
  zoom?: number;
}) {
  const label = rewardLabel(r);
  const shown = r.what.trim() || r.value ? label : "What they get…";
  const action = r.type === "action" && r.action.trim() ? `${r.action.trim()} and show it at the counter` : undefined;
  return (
    <SoloCard
      zoom={zoom}
      flipped
      label={`${TIER_WORD[r.tier]} Tikka: ${shown}${r.terms.trim() ? `. Only if: ${r.terms.trim()}` : ""}`}
      face={face}
      total={total}
      finish={finish}
      reveal={{
        tier: r.tier,
        reward: shown,
        terms: r.terms.trim() || undefined,
        instruction: action,
        code: `${prefix || "XX"}-•••••`,
        expiry,
        serial: "0001",
        claimer: "Adaeze",
      }}
    />
  );
}
