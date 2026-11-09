import "server-only";

import { createHash } from "node:crypto";
import { adminClient } from "./supabase/admin";

// Limits on the public endpoints, counted in the database (rate_hit) so they hold across servers.
// Per visitor (the tk_vid cookie) and per IP address, both hashed before they're stored. IP limits
// are generous because many people on the same mobile network share one address. If the counter
// itself fails, the request goes through: a hiccup must never block a real claim.

type Rule = { max: number; seconds: number };

/** [per visitor, per IP] for each endpoint. */
export const LIMITS = {
  claim: [{ max: 20, seconds: 600 }, { max: 300, seconds: 600 }],
  // Claiming on the page with a typed number (lib/claim-mode.ts): a few tries per person an hour.
  claim_page: [{ max: 6, seconds: 3600 }, { max: 120, seconds: 3600 }],
  notify: [{ max: 10, seconds: 3600 }, { max: 150, seconds: 3600 }],
  report: [{ max: 5, seconds: 86_400 }, { max: 60, seconds: 86_400 }],
  events: [{ max: 300, seconds: 600 }, { max: 5000, seconds: 600 }],
  visit: [{ max: 30, seconds: 600 }, { max: 300, seconds: 600 }],
  enquiry: [{ max: 5, seconds: 3600 }, { max: 40, seconds: 3600 }],
  early_access: [{ max: 10, seconds: 3600 }, { max: 100, seconds: 3600 }],
} satisfies Record<string, [Rule, Rule]>;

export type Limited = keyof typeof LIMITS;

/** The caller's address as Vercel passes it (the first in x-forwarded-for). */
export function clientIp(request: Request | { headers: Headers }): string | null {
  const fwd = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || request.headers.get("x-real-ip") || null;
}

function hashed(value: string): string {
  const salt = process.env.SUPABASE_SECRET_KEY ?? "";
  return createHash("sha256").update(`tikka-rate:${salt}:${value}`).digest("base64url").slice(0, 22);
}

/** True when this caller has gone over the endpoint's limit (and the request should get a 429). */
export async function tooMany(request: Request | { headers: Headers }, endpoint: Limited, visitorId?: string | null): Promise<boolean> {
  const [perVisitor, perIp] = LIMITS[endpoint];
  const ip = clientIp(request);
  const checks: [string, Rule][] = [];
  if (visitorId) checks.push([`${endpoint}:v:${hashed(visitorId)}`, perVisitor]);
  if (ip) checks.push([`${endpoint}:ip:${hashed(ip)}`, perIp]);
  if (!checks.length) return false;
  try {
    const admin = adminClient();
    const results = await Promise.all(checks.map(([key, r]) => admin.rpc("rate_hit", { p_key: key, p_max: r.max, p_window_seconds: r.seconds })));
    return results.some((r) => r.data === false);
  } catch {
    return false;
  }
}
