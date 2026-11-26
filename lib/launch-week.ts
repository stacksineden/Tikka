// Launch week in /admin (supabase/migrations/20261221100000_admin_launch_week.sql): where each real
// business is with the new version, and the WhatsApp nudge Tikka's team sends for what's left. Pure,
// so it's unit-tested.

import { normalizeNgPhone } from "./setup";

export interface LaunchRow {
  id: string;
  name: string;
  slug: string;
  city: string;
  suspended: boolean;
  ownerWhatsapp?: string;
  setupDone: boolean;
  listed: boolean;
  termsAt?: string;
  graceUntil?: string;
  spacePhotos: number;
  services: number;
  bookingsOn: boolean;
  depositsOn: boolean;
  hasBank: boolean;
  paymentsOn: boolean;
  kycStatus?: "submitted" | "approved" | "again";
  kycGraceUntil?: string;
  bookings7d: number;
  fromSearch7d: number;
}

export type LaunchStep = "setup" | "listing" | "id" | "bookings" | "deposits";

/** The last full day of a grace period ending at midnight WAT: "9 December". */
export function lastDay(iso: string): string {
  return new Date(new Date(iso).getTime() - 1).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "Africa/Lagos" });
}

/** What a business still has to do, most urgent first. */
export function stepsLeft(r: LaunchRow, now: Date = new Date()): LaunchStep[] {
  const out: LaunchStep[] = [];
  if (!r.setupDone) out.push("setup");
  if (!r.termsAt) out.push("listing");
  const idDue = r.kycGraceUntil && new Date(r.kycGraceUntil).getTime() > now.getTime();
  if ((r.kycStatus === undefined || r.kycStatus === "again") && (idDue || r.paymentsOn || r.hasBank)) out.push("id");
  if (!r.bookingsOn) out.push("bookings");
  else if (!r.depositsOn && r.paymentsOn) out.push("deposits");
  return out;
}

/** One line per step, in the owner's words. */
export function stepText(step: LaunchStep, r: LaunchRow): string {
  switch (step) {
    case "setup":
      return "tap “Finish setting up” on Today (about a minute)";
    case "listing":
      return r.graceUntil
        ? `tap “Stay in Tikka's search” and add a photo of your space, before the end of ${lastDay(r.graceUntil)}`
        : "tap “Get listed on Tikka” so customers searching near you find you (free for now)";
    case "id":
      return r.kycStatus === "again"
        ? "fix your ID details in Settings → Get paid"
        : `add your ID in Settings → Get paid${r.kycGraceUntil ? ` before the end of ${lastDay(r.kycGraceUntil)}, so deposits keep working` : ""}`;
    case "bookings":
      return "switch bookings on in Booking settings, so customers can pick a free time";
    case "deposits":
      return "switch deposits on in Booking settings, so no-shows stop costing you";
  }
}

/** The nudge from Tikka's founder, ready in WhatsApp. */
export function nudgeText(r: LaunchRow, steps: LaunchStep[] = stepsLeft(r)): string {
  const lines = steps.map((s, i) => `${i + 1}. ${stepText(s, r)}`);
  return [
    `Hi ${r.name}! The new Tikka is live: your page, bookings, deposits and your money in one place.`,
    steps.length ? `To get the most from it:\n${lines.join("\n")}` : "You're all set. Thank you for being one of the first!",
    "Open it at usetikka.com/app. Any questions, reply here.",
    "Samuel Adebisi, Founder, Tikka",
  ].join("\n\n");
}

/** wa.me link with the nudge, or null without a number. */
export function nudgeLink(r: LaunchRow, now: Date = new Date()): string | null {
  if (!r.ownerWhatsapp || !/^\+234\d{10}$/.test(r.ownerWhatsapp)) return null;
  return `https://wa.me/${r.ownerWhatsapp.slice(1)}?text=${encodeURIComponent(nudgeText(r, stepsLeft(r, now)))}`;
}

export function launchRowFrom(x: Record<string, unknown>): LaunchRow {
  const s = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  return {
    id: String(x.id),
    name: String(x.name),
    slug: String(x.slug),
    city: String(x.city ?? ""),
    suspended: x.suspended === true,
    // The alert number, or the Chat on WhatsApp button's, which owners type in any shape.
    ownerWhatsapp: normalizeNgPhone(s(x.owner_whatsapp) ?? "") ?? undefined,
    setupDone: x.setup_done === true,
    listed: x.listed === true,
    termsAt: s(x.terms_at),
    graceUntil: s(x.grace_until),
    spacePhotos: Number(x.space_photos ?? 0),
    services: Number(x.services ?? 0),
    bookingsOn: x.bookings_on === true,
    depositsOn: x.deposits_on === true,
    hasBank: x.has_bank === true,
    paymentsOn: x.payments_on === true,
    kycStatus: (s(x.kyc_status) as LaunchRow["kycStatus"]) ?? undefined,
    kycGraceUntil: s(x.kyc_grace_until),
    bookings7d: Number(x.bookings_7d ?? 0),
    fromSearch7d: Number(x.from_search_7d ?? 0),
  };
}
