// What the sealed wrapper says about a drop's rewards (components/tikka/TikkaPack.tsx). Pure, so
// the wording is tested. Counts only, by tier: never the deck or its order (rule 1).

import { count } from "./format";
import type { Tier } from "./types";

/** One reward on the wrapper: "Free induction makeup · 2 only". */
export interface PackItem {
  tier: Tier;
  count: number;
  reward: string;
}

const TIER_ORDER: Tier[] = ["legendary", "rare", "thank_you"];
/** Rewards shown on the wrapper; the rest wait inside. */
export const PACK_LINES = 3;

/** How many of a reward, in plain words: "2 only", "36", or "everyone else" for a lone thank-you. */
export function packCountLabel(item: PackItem, items: PackItem[]): string {
  if (item.tier === "thank_you" && items.length > 1 && items.filter((i) => i.tier === "thank_you").length === 1) return "everyone else";
  return item.count <= 10 ? `${count(item.count)} only` : count(item.count);
}

/** The wrapper's lines, the rarest first, and how many rewards didn't fit. */
export function packLines(items: PackItem[]): { lines: PackItem[]; more: number } {
  const sorted = [...items].sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier));
  return { lines: sorted.slice(0, PACK_LINES), more: Math.max(0, sorted.length - PACK_LINES) };
}
