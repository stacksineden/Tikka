// Permanent QR posters (PRD A7, TECH_PLAN §13). Pure: codes, where a scan goes, and what the
// printable says. The poster never needs reprinting, so nothing here is drop-specific by default.

import { ALPHABET } from "./codes";
import { cryptoRng, type Rng } from "./deck";

export interface Poster {
  id: string;
  businessId: string;
  /** 6 characters from the Tikka code alphabet, e.g. "K7M2QP". */
  code: string;
  label: string;
  hookLine?: string;
  createdAt: string;
}

export const POSTER_CODE_LENGTH = 6;
export const LABEL_MAX = 30;
export const HOOK_MAX = 80;
export const DEFAULT_HOOK = "Every Tikka holds something. See what's inside this week.";

export function newPosterCode(rng: Rng = cryptoRng()): string {
  let s = "";
  for (let i = 0; i < POSTER_CODE_LENGTH; i++) s += ALPHABET[Math.floor(rng() * ALPHABET.length)];
  return s;
}

/**
 * What people type at usetikka.com/q: any case, spaces or dashes. The alphabet has no
 * look-alikes, so nothing is guessed: a code that isn't one gets a plain "check the code".
 */
export function normalizePosterCode(input: string): string | null {
  const s = input.toUpperCase().replace(/[\s-]/g, "");
  if (s.length !== POSTER_CODE_LENGTH || [...s].some((c) => !ALPHABET.includes(c))) return null;
  return s;
}

/** Where a scan goes: the one live drop, else the business page (scheduled drop or Notify me). */
export function posterTarget(
  businessSlug: string,
  posterId: string,
  drops: { slug: string; status: string }[],
): string {
  const live = drops.filter((d) => d.status === "live");
  if (live.length === 1) return `/d/${businessSlug}/${live[0].slug}?c=qr&p=${encodeURIComponent(posterId)}`;
  return `/${businessSlug}?c=qr&p=${encodeURIComponent(posterId)}`;
}

export function validateLabel(label: string): string | null {
  const t = label.trim();
  if (!t) return "Name the place, like Shop counter or Mall.";
  if (t.length > LABEL_MAX) return `Keep it under ${LABEL_MAX} characters.`;
  return null;
}

const GAMBLING = /\b(win|wins|winner|winning|luck|lucky|jackpot|odds|bet|stake|lottery|raffle|prize draw)\b/i;

export function validateHook(hook: string): string | null {
  const t = hook.trim();
  if (t.length > HOOK_MAX) return `Keep it under ${HOOK_MAX} characters.`;
  if (GAMBLING.test(t)) return 'Say "Every Tikka holds something" instead of words like win or luck.';
  return null;
}

/** The current drop's best reward, as a hook line people can choose instead of the evergreen one. */
export function rewardHook(bestReward: string | undefined): string | null {
  return bestReward ? `${bestReward} and more inside. Every Tikka holds something.`.slice(0, HOOK_MAX) : null;
}

/** "K7M 2QP": easier to read off a poster. */
export function spacedCode(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

/** The print kit formats, at trim size in millimetres; every one gets 3 mm bleed. */
export const BLEED_MM = 3;
export const FORMATS = {
  a4: { label: "A4 window poster", w: 210, h: 297 },
  a5: { label: "A5 counter standee", w: 148, h: 210 },
  tent: { label: "Table tent (A4, folds to A5)", w: 297, h: 210 },
  sticker: { label: "5 cm sticker", w: 50, h: 50 },
} as const;
export type PrintFormat = keyof typeof FORMATS;
