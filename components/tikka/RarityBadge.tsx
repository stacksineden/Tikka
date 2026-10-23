import type { Tier } from "@/lib/types";

export const TIER_LABEL: Record<Tier, string> = {
  legendary: "Legendary",
  rare: "Rare",
  thank_you: "Thank-you",
};

const PIPS: Record<Tier, number> = { thank_you: 1, rare: 2, legendary: 3 };

export const TIER_VAR: Record<Tier, string> = {
  legendary: "var(--rarity-legendary)",
  rare: "var(--rarity-rare)",
  thank_you: "var(--rarity-common)",
};

/** Rarity never relies on colour alone: word plus one to three pips. */
export function RarityBadge({ tier, className = "" }: { tier: Tier; className?: string }) {
  const mod = tier === "rare" ? " rarity--rare" : tier === "legendary" ? " rarity--legendary" : "";
  return (
    <span className={`rarity${mod} ${className}`}>
      <span className="rarity__pips" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <i key={i} className={i < PIPS[tier] ? "on" : undefined} />
        ))}
      </span>
      {TIER_LABEL[tier]}
    </span>
  );
}
