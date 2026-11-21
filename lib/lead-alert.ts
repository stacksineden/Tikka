// What a new lead alert says (web push to the owner's phone). Pure, so the wording is pinned by
// tests. Never a phone number: the notification shows on the lock screen. No gambling words (rule 8).
import { naira } from "./format";

export interface LeadAlertInput {
  businessName: string;
  firstName: string;
  /** rewards.tier: 'legendary' | 'rare' | 'common' (thank-you). */
  tier: string;
  reward: string;
  /** This drop's claims in the last 10 minutes, this one included. */
  recent: number;
}

const TIER: Record<string, string> = { legendary: "a Legendary", rare: "a Rare", common: "a Thank-you" };

/** "New lead · Glow Studio" / "Adaeze just claimed a Rare Tikka: 20% off any service. Tap to message her." */
export function leadAlertText(a: LeadAlertInput): { title: string; body: string } {
  const who = a.firstName.trim() || "Someone";
  const what = `${TIER[a.tier] ?? "a"} Tikka`;
  if (a.recent > 1) {
    return {
      title: `${a.recent} new leads · ${a.businessName}`,
      body: `Latest: ${who} claimed ${what} (${a.reward}). Tap to see them all.`,
    };
  }
  return { title: `New lead · ${a.businessName}`, body: `${who} just claimed ${what}: ${a.reward}. Tap to message them.` };
}

/** The test from Settings. */
export function testAlertText(businessName: string): { title: string; body: string } {
  return { title: `Alerts are on · ${businessName}`, body: "This is how a new lead will show on this phone." };
}

/** Where a tap goes. */
export const LEAD_ALERT_URL = "/app/leads";

/** "New booking · Glow Studio" / "Adaeze booked Braids for Sat 15 Nov, 2:00pm. Tap to see your bookings." */
export function bookingAlertText(a: { businessName: string; firstName: string; service: string; when: string }): { title: string; body: string } {
  const who = a.firstName.trim() || "Someone";
  return { title: `New booking · ${a.businessName}`, body: `${who} booked ${a.service} for ${a.when}. Tap to see your bookings.` };
}

/** Where a booking alert's tap goes. */
export const BOOKING_ALERT_URL = "/app/bookings";

/** "₦5,000 paid · Glow Studio" / "Bisi paid: Braids balance. It goes to your bank the next working day." */
export function payAlertText(a: { businessName: string; firstName: string; amountKobo: number; note: string }): { title: string; body: string } {
  const who = a.firstName.trim() || "A customer";
  const amount = naira(a.amountKobo / 100);
  return { title: `${amount} paid · ${a.businessName}`, body: `${who} paid: ${a.note.trim()}. It goes to your bank the next working day.` };
}

/** Where a payment alert's tap goes. */
export const PAY_ALERT_URL = "/app/money";
