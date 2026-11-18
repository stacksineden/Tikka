// What a new lead alert says (web push to the owner's phone). Pure, so the wording is pinned by
// tests. Never a phone number: the notification shows on the lock screen. No gambling words (rule 8).

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
