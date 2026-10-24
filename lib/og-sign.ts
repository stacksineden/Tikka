import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// The card image's address (/api/og/card?c=<claim id>&s=<signature>) is signed so nobody can walk
// through claim ids. The key is OG_SIGNING_SECRET, or else one derived from the Supabase secret key
// (changing either one makes old image links stop working, nothing more).

function key(): string {
  const own = process.env.OG_SIGNING_SECRET;
  if (own) return own;
  const base = process.env.SUPABASE_SECRET_KEY;
  if (!base) throw new Error("Set OG_SIGNING_SECRET or SUPABASE_SECRET_KEY to sign card images.");
  return createHash("sha256").update(`tikka-card-image:${base}`).digest("hex");
}

export function signClaim(claimId: string, secret = key()): string {
  return createHmac("sha256", secret).update(claimId).digest("base64url").slice(0, 22);
}

export function verifyClaim(claimId: string, sig: string, secret = key()): boolean {
  const want = Buffer.from(signClaim(claimId, secret));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** The card image for a claim, as an absolute address (WhatsApp fetches it). */
export function cardImageUrl(site: string, claimId: string): string {
  return `${site}/api/og/card?c=${encodeURIComponent(claimId)}&s=${signClaim(claimId)}`;
}
