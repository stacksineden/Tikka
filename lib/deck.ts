// The shuffled deck of a drop (TECH_PLAN §4). Pure, so the publish transaction can use it
// and the tests can pin it with a seeded RNG. Production passes a crypto-backed RNG.

export type Rng = () => number;

/** Deterministic RNG for tests (mulberry32). */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Crypto-backed RNG for real decks. */
export function cryptoRng(): Rng {
  const buf = new Uint32Array(1);
  return () => {
    crypto.getRandomValues(buf);
    return buf[0] / 4294967296;
  };
}

function shuffle<T>(xs: T[], rng: Rng): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [xs[i], xs[j]] = [xs[j], xs[i]];
  }
  return xs;
}

/** Splits `n` into parts proportional to `weights`, exact total, largest remainder rounding. */
export function apportion(n: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || n <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (n * w) / sum);
  const out = exact.map(Math.floor);
  let left = n - out.reduce((a, b) => a + b, 0);
  const order = exact.map((e, i) => [e - Math.floor(e), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) {
    if (left <= 0) break;
    out[i]++;
    left--;
  }
  return out;
}

export interface DeckReward {
  id: string;
  count: number;
}

export const CHUNK = 50;

/**
 * Spread shuffle: cut the deck into chunks of ~50, give each chunk its share of every reward
 * (from what's still left, so totals stay exact), shuffle inside each chunk, concatenate.
 * Rare and legendary cards end up spread through the drop instead of clumping.
 * Returns one reward id per card, in deck order.
 */
export function buildDeck(rewards: DeckReward[], rng: Rng, chunk = CHUNK): string[] {
  const total = rewards.reduce((a, r) => a + r.count, 0);
  if (total === 0) return [];
  const chunks = Math.ceil(total / chunk);
  const sizes = apportion(total, Array(chunks).fill(1));
  const remaining = rewards.map((r) => r.count);
  let cardsLeft = total;
  const deck: string[] = [];

  for (const size of sizes) {
    const take = apportion(size, remaining);
    const part: string[] = [];
    take.forEach((k, i) => {
      for (let j = 0; j < k; j++) part.push(rewards[i].id);
      remaining[i] -= k;
    });
    cardsLeft -= size;
    deck.push(...shuffle(part, rng));
  }
  if (cardsLeft !== 0 || remaining.some((r) => r !== 0)) throw new Error("deck totals don't add up");
  return deck;
}

/** Serial numbers: a random permutation of 1..n (so serial order says nothing about rewards). */
export function serials(n: number, rng: Rng): number[] {
  return shuffle(
    Array.from({ length: n }, (_, i) => i + 1),
    rng,
  );
}

/** "Add more Tikkas": K extra cards in the drop's existing proportions. */
export function appendCounts(rewards: DeckReward[], extra: number): DeckReward[] {
  const add = apportion(
    extra,
    rewards.map((r) => r.count),
  );
  return rewards.map((r, i) => ({ id: r.id, count: add[i] }));
}
