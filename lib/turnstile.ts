import "server-only";

// Cloudflare Turnstile: a free, mostly invisible check that a page claim comes from a person, not a
// script. It runs only when both keys are set (NEXT_PUBLIC_TURNSTILE_SITE_KEY for the claim sheet,
// TURNSTILE_SECRET_KEY here), so half a setup never blocks real claims; the rate limits apply either way.

const VERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function turnstileEnabled(): boolean {
  return !!process.env.TURNSTILE_SECRET_KEY && !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
}

/** True when the token is a fresh, valid Turnstile pass (or when Turnstile isn't set up). */
export async function verifyTurnstile(token: string | undefined, ip: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret || !turnstileEnabled()) return true;
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip) body.set("remoteip", ip);
    const res = await fetch(VERIFY, { method: "POST", body, signal: AbortSignal.timeout(5000) });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
