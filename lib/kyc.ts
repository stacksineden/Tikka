// ID verification before customer payments (supabase/migrations/20261129100000_id_verification.sql).
// Pure rules shared by the owner's Get paid steps and Tikka admin's review; pinned by lib/kyc.test.ts.

export type IdType = "nin" | "drivers_licence" | "passport" | "voters_card";
export type Registered = "bn" | "rc" | "no";
export type KycStatus = "submitted" | "approved" | "again";

export const ID_TYPES: { id: IdType; label: string }[] = [
  { id: "nin", label: "NIN slip or card" },
  { id: "drivers_licence", label: "Driver's licence" },
  { id: "passport", label: "International passport" },
  { id: "voters_card", label: "Voter's card" },
];

export const REGISTERED: { id: Registered; label: string }[] = [
  { id: "bn", label: "Yes, business name (BN)" },
  { id: "rc", label: "Yes, company (RC)" },
  { id: "no", label: "Not registered yet" },
];

export const idTypeLabel = (t: string) => ID_TYPES.find((x) => x.id === t)?.label ?? t;

/** The limit per payment Tikka allows: ₦1,000 to ₦1,000,000. */
export const LIMIT_MIN_KOBO = 100_000;
export const LIMIT_MAX_KOBO = 100_000_000;

/** "BN 1234567" / "RC 1234567": the letters (optional when the type is picked) and 4 to 10 digits. */
export function cacNumber(type: "bn" | "rc", input: string): string | null {
  const t = input.trim().toUpperCase().replace(/\s+/g, " ");
  const m = t.match(/^(?:(BN|RC)\s*)?(\d{4,10})$/);
  if (!m || (m[1] && m[1] !== type.toUpperCase())) return null;
  return `${type.toUpperCase()} ${m[2]}`;
}

/**
 * The limit to suggest at review, from the business's own prices: its biggest deposit plus about a
 * quarter, rounded up to ₦10,000. With no deposits set yet, half its priciest service the same
 * way. Never below ₦20,000 or above ₦1,000,000.
 */
export function suggestLimitKobo(p: { topDepositKobo?: number | null; topPriceKobo?: number | null }): number {
  const base = p.topDepositKobo && p.topDepositKobo > 0 ? p.topDepositKobo : p.topPriceKobo && p.topPriceKobo > 0 ? p.topPriceKobo / 2 : 0;
  const step = 1_000_000; // ₦10,000
  const rounded = Math.ceil((base * 1.25) / step) * step;
  return Math.min(LIMIT_MAX_KOBO, Math.max(2_000_000, rounded));
}

/** Naira typed in a box ("100,000") to kobo, or null when it's outside Tikka's limits. */
export function limitFromInput(input: string): number | null {
  const n = Number(String(input).replace(/[^\d]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  const kobo = n * 100;
  return kobo >= LIMIT_MIN_KOBO && kobo <= LIMIT_MAX_KOBO ? kobo : null;
}

/** Where a business stands, for admin's list and the owner's reminder. */
export type KycStanding = "verified" | "waiting" | "asked_again" | "id_missing" | "paused";

export function kycStanding(r: { kyc?: { status: KycStatus } | null; enabled: boolean; graceUntil?: string | null }, now: Date): KycStanding {
  if (r.kyc?.status === "approved") return "verified";
  if (r.kyc?.status === "submitted") return "waiting";
  if (r.kyc?.status === "again") return "asked_again";
  if (r.enabled && r.graceUntil && new Date(r.graceUntil) > now) return "id_missing";
  return "paused";
}

export const STANDING_LABEL: Record<KycStanding, string> = {
  verified: "Verified",
  waiting: "Waiting for review",
  asked_again: "Asked again",
  id_missing: "Payments on · ID missing",
  paused: "Paused · ID missing",
};

/** The last day of the grace period, in WAT ("7 December"): the deadline is midnight at its end. */
export function graceDay(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "Africa/Lagos" }).format(new Date(new Date(iso).getTime() - 60_000));
}
