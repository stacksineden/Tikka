// How customers claim. Normally on WhatsApp (TECH_PLAN §5): the message proves the number. While
// Tikka's WhatsApp number waits for Meta's business verification, TIKKA_CLAIM_MODE=page lets them
// claim on the page with a typed number instead (claim_on_page(); those numbers are marked
// unconfirmed and Tikka never messages them). Remove the setting to go back to WhatsApp.

export type ClaimMode = "whatsapp" | "page";

export function claimMode(): ClaimMode {
  return process.env.TIKKA_CLAIM_MODE === "page" ? "page" : "whatsapp";
}

/** Cloudflare Turnstile's public key for the claim sheet's bot check, when it's set up. */
export function turnstileSiteKey(): string | undefined {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY ? process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY : undefined;
}
