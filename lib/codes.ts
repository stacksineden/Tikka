// Redemption codes (TECH_PLAN §7): business prefix + "-" + 4 random characters + 1 check
// character, e.g. GS-7X4QP. The alphabet drops look-alikes (0/O, 1/I/L, 2/Z, 5/S, 8/B), and
// the check character catches every single-character typo and every adjacent swap before the
// code reaches the database.

import { cryptoRng, type Rng } from "./deck";

export const ALPHABET = "ACDEFGHJKMNPQRTUVWXY34679";
const N = ALPHABET.length;

// Prefix letters outside the alphabet map to a fixed stand-in, so every prefix feeds the check.
const PREFIX_MAP: Record<string, string> = { B: "P", I: "J", L: "T", O: "Q", S: "9", Z: "7" };

function point(ch: string): number {
  return ALPHABET.indexOf(PREFIX_MAP[ch] ?? ch);
}

/**
 * Weighted sum mod 25 over the prefix and body, weights 2, 1, 2, 1… from the right (the check
 * character itself weighs 1). Both weights and their difference are units mod 25, so any one
 * changed character or any adjacent swap changes the sum. (Luhn mod N, the first plan, needs an
 * even N: with 25 its doubling step sends C and R to the same value.)
 */
function checkPoint(chars: string): number {
  let sum = 0;
  for (let i = chars.length - 1, w = 2; i >= 0; i--, w = 3 - w) sum += w * point(chars[i]);
  return (N - (sum % N)) % N;
}

/** A new code for a business prefix. Production uses the crypto RNG. */
export function generate(prefix: string, rng: Rng = cryptoRng()): string {
  const p = prefix.toUpperCase();
  if (!/^[A-Z]{2}$/.test(p)) throw new Error("prefix must be two letters");
  let body = "";
  for (let i = 0; i < 4; i++) body += ALPHABET[Math.floor(rng() * N)];
  return `${p}-${body}${ALPHABET[checkPoint(p + body)]}`;
}

/** Uppercase, strip spaces and dashes. Null if it can't be a code (wrong length or characters). */
export function normalize(input: string): string | null {
  const s = input.toUpperCase().replace(/[\s-]+/g, "");
  if (!/^[A-Z]{2}/.test(s) || s.length !== 7) return null;
  const body = s.slice(2);
  if ([...body].some((c) => !ALPHABET.includes(c))) return null;
  return `${s.slice(0, 2)}-${body}`;
}

/** Offline check: the shape is right and the check character matches. */
export function isWellFormed(input: string): boolean {
  const code = normalize(input);
  if (!code) return false;
  const chars = code.replace("-", "");
  return ALPHABET[checkPoint(chars.slice(0, 6))] === chars[6];
}
