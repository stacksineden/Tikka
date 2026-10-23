// Pure helpers behind the claim page. The real card assignment is claim_card() in Postgres
// (TECH_PLAN §6); until M5 the demo claim in lib/data.ts uses these to serve the same deck.

import { buildDeck, seededRng, serials } from "./deck";
import type { Business, Drop, PublicDrop, Reward, Source, Tier } from "./types";

/** Anonymous visitor id, set by proxy.ts on claim pages. */
export const VISITOR_COOKIE = "tk_vid";

/** The card this browser claimed from a drop ("This browser already claimed"). */
export function claimCookie(dropId: string): string {
  return `tk_c_${dropId}`;
}

const TIER_ORDER: Tier[] = ["legendary", "rare", "thank_you"];

export const SOURCES: Source[] = ["wa", "ig", "qr", "web", "ads", "market"];

/** `?c=` on the drop link → source. Anything else is "direct". */
export function parseSource(c: string | string[] | undefined): Source {
  const v = Array.isArray(c) ? c[0] : c;
  return SOURCES.includes(v as Source) ? (v as Source) : "direct";
}

/** Status from the clock and what's left; a drop with nothing left is sold out. */
export function publicStatus(d: Pick<Drop, "status" | "startsAt" | "endsAt">, left: number, now: Date): PublicDrop["status"] {
  if (d.status === "ended" || new Date(d.endsAt) <= now) return "ended";
  if (left <= 0 || d.status === "sold_out") return "sold_out";
  if (new Date(d.startsAt) > now) return "scheduled";
  return "live";
}

export function toPublicDrop(d: Drop, extraClaims: number, newOnly: boolean, now: Date): PublicDrop {
  const left = Math.max(0, d.total - d.claimed - extraClaims);
  const tierSum = (t: Tier) => d.rewards.filter((r) => r.tier === t).reduce((a, r) => a + r.count, 0);
  return {
    id: d.id,
    slug: d.slug,
    name: d.name,
    status: publicStatus(d, left, now),
    total: d.total,
    left,
    startsAt: d.startsAt,
    endsAt: d.endsAt,
    finish: d.finish,
    contents: { legendary: tierSum("legendary"), rare: tierSum("rare"), thankYou: tierSum("thank_you") },
    items: TIER_ORDER.flatMap((tier) => d.rewards.filter((r) => r.tier === tier && r.count > 0).map((r) => ({ tier, count: r.count, reward: r.label }))),
    note: newOnly ? "Every Tikka holds something. New customers only." : "Every Tikka holds something. One per WhatsApp number.",
  };
}

/** Stable number from a string, to seed a drop's demo deck. */
export function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * The card at deck position `index` (0-based, in claim order): which reward and which serial.
 * `batches` are Tikkas added after publishing (counts per reward, in the drop's proportions):
 * they go on the end of the deck, so cards already handed out never move.
 * DEMO: decks are rebuilt from a seed; the real one is stored at publish and read with
 * FOR UPDATE SKIP LOCKED.
 */
export function cardAt(dropId: string, rewards: Reward[], index: number, batches: number[][] = []): { reward: Reward; serial: number } | null {
  const parts = [rewards.map((r) => r.count), ...batches];
  const total = parts.reduce((a, p) => a + p.reduce((x, y) => x + y, 0), 0);
  if (index < 0 || index >= total) return null;
  let offset = 0;
  for (let b = 0; b < parts.length; b++) {
    const size = parts[b].reduce((x, y) => x + y, 0);
    if (index < offset + size) {
      const deck = buildDeck(
        parts[b].map((count, i) => ({ id: String(i), count })),
        seededRng(seedOf(b === 0 ? dropId : `${dropId}:add${b}`)),
      );
      // Serials run on across batches: the first 600 are 1–600 shuffled, the next 500 are 601–1100.
      const serial = offset + serials(size, seededRng(seedOf(b === 0 ? `${dropId}:serials` : `${dropId}:serials${b}`)))[index - offset];
      return { reward: rewards[Number(deck[index - offset])], serial };
    }
    offset += size;
  }
  return null;
}

/** How many of each reward the first `n` claims took (cards left by reward). Builds each deck once. */
export function dealtCounts(dropId: string, rewards: Reward[], n: number, batches: number[][] = []): number[] {
  const out = rewards.map(() => 0);
  const parts = [rewards.map((r) => r.count), ...batches];
  let left = n;
  for (let b = 0; b < parts.length && left > 0; b++) {
    const deck = buildDeck(
      parts[b].map((count, i) => ({ id: String(i), count })),
      seededRng(seedOf(b === 0 ? dropId : `${dropId}:add${b}`)),
    );
    for (const id of deck.slice(0, left)) out[Number(id)]++;
    left -= deck.length;
  }
  return out;
}

/** The one line an action card shows under its reward. */
export function actionInstruction(r: Pick<Reward, "type" | "action">): string | undefined {
  return r.type === "action" && r.action ? `${r.action} and show it at the counter` : undefined;
}

/** "0412" for serial 412 of 600; at least four digits. */
export function serialLabel(serial: number, total: number): string {
  return String(serial).padStart(Math.max(4, String(total).length), "0");
}

/** "Adaeze" from "  adaeze okafor ". */
export function firstName(input: string): string {
  const w = input.trim().split(/\s+/)[0] ?? "";
  return w.slice(0, 1).toUpperCase() + w.slice(1, 30);
}

/** What a claim or card page shows of the business: never the portfolio or the owner. */
export function claimProfile(b: Business) {
  return {
    name: b.name,
    about: b.about,
    hours: b.hours,
    area: b.area,
    city: b.city,
    services: b.services,
    actions: b.actions,
    rating: b.rating,
    reviewCount: b.reviewCount,
    hasVideo: b.hasVideo,
    videoPosterUrl: b.videoPosterUrl,
    videoUrl: b.videoUrl,
  } satisfies Partial<Business>;
}
