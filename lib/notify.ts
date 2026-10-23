// Notify me (PRD A6, TECH_PLAN §5). Pure rules the webhook and the drop-live cron share:
// reading what someone sent Tikka on WhatsApp, and who gets a "drop is live" alert.

import { ALPHABET } from "./codes";
import { cryptoRng, type Rng } from "./deck";

/** Pilot cap: Tikka pays for up to 1,000 alerts per drop. */
export const ALERT_CAP = 1000;

/** NT-7KQ4A: the code in "Notify me about Glow Studio NT-7KQ4A". */
export function notifyCode(rng: Rng = cryptoRng()): string {
  let s = "";
  for (let i = 0; i < 5; i++) s += ALPHABET[Math.floor(rng() * ALPHABET.length)];
  return `NT-${s}`;
}

export type Inbound = { kind: "claim"; code: string } | { kind: "notify"; code: string } | { kind: "stop"; all: boolean } | { kind: "other" };

/** Routes an incoming WhatsApp message: TK- claims, NT- notify, STOP / STOP ALL. */
export function routeInbound(text: string): Inbound {
  const t = text.trim().toUpperCase();
  if (/^STOP\s+ALL\b/.test(t)) return { kind: "stop", all: true };
  if (/^(STOP|UNSUBSCRIBE)\b/.test(t)) return { kind: "stop", all: false };
  const nt = t.match(/\bNT-([A-Z0-9]{5})\b/);
  if (nt) return { kind: "notify", code: `NT-${nt[1]}` };
  const tk = t.match(/\bTK-([A-Z0-9]{4,8})\b/);
  if (tk) return { kind: "claim", code: `TK-${tk[1]}` };
  return { kind: "other" };
}

export interface Subscription {
  id: string;
  phone: string;
  businessId: string;
  /** Set for "this drop"; empty for "this business's next drop" (stays until STOP). */
  dropId?: string;
  usedAt?: string;
}

export interface OptOut {
  phone: string;
  /** Empty means STOP ALL: no Tikka messages at all. */
  businessId?: string;
}

/** A past claimer (leads row). Only the future-drops box makes them a recipient (rule 12). */
export interface PastClaimer {
  phone: string;
  businessId: string;
  marketingOptIn: boolean;
}

/**
 * Who gets the drop-live alert: people waiting for this drop, people following the business,
 * and past claimers who ticked "Tell me about future drops". One alert per number, never to
 * anyone who said STOP, at most `cap`. Drop subscriptions are used up by the alert; business
 * ones stay.
 */
export function alertRecipients(
  subs: Subscription[],
  optOuts: OptOut[],
  drop: { id: string; businessId: string },
  cap = ALERT_CAP,
  pastClaimers: PastClaimer[] = [],
) {
  const stopped = (phone: string) => optOuts.some((o) => o.phone === phone && (!o.businessId || o.businessId === drop.businessId));
  const seen = new Set<string>();
  const send: Subscription[] = [];
  for (const s of subs) {
    if (s.usedAt || s.businessId !== drop.businessId) continue;
    if (s.dropId && s.dropId !== drop.id) continue;
    if (stopped(s.phone) || seen.has(s.phone)) continue;
    if (send.length >= cap) break;
    seen.add(s.phone);
    send.push(s);
  }
  const claimers: string[] = [];
  for (const c of pastClaimers) {
    if (!c.marketingOptIn || c.businessId !== drop.businessId) continue;
    if (stopped(c.phone) || seen.has(c.phone)) continue;
    if (send.length + claimers.length >= cap) break;
    seen.add(c.phone);
    claimers.push(c.phone);
  }
  return { send, claimers, useUp: send.filter((s) => s.dropId).map((s) => s.id) };
}
