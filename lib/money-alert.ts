// NEW DIRECTION (docs/OWNER_JOURNEYS.md journey 6): the two money alerts on the owner's phone.
// 8pm every day: "Anything you spent today?" (with who still isn't marked paid). Sunday evening:
// what came in, what was spent and what they kept this week. Pure, so the tests read the words.

const naira = (kobo: number) => "₦" + Math.round(kobo / 100).toLocaleString("en-NG");

export const MONEY_ALERT_URL = "/app/money";
export const TODAY_ALERT_URL = "/app";

export function eveningAlertText(a: { businessName: string; inKobo: number; unpaid: number }): { title: string; body: string; url: string } {
  const unpaid = a.unpaid ? ` ${a.unpaid} ${a.unpaid === 1 ? "customer isn't" : "customers aren't"} marked paid yet.` : "";
  return {
    title: `Anything you spent today? · ${a.businessName}`,
    body: `${a.inKobo ? `${naira(a.inKobo)} came in today.` : "Nothing recorded today yet."}${unpaid} Tap to add what you spent.`,
    url: a.unpaid ? TODAY_ALERT_URL : MONEY_ALERT_URL,
  };
}

export function weeklyAlertText(a: { businessName: string; inKobo: number; spentKobo: number; keptKobo: number; best?: string }): { title: string; body: string; url: string } {
  return {
    title: `Your week · ${a.businessName}`,
    body: `${naira(a.inKobo)} in, ${naira(a.spentKobo)} spent, you kept ${naira(a.keptKobo)}.${a.best ? ` Best seller: ${a.best}.` : ""}`,
    url: MONEY_ALERT_URL,
  };
}

/** Which alert is due at this moment (WAT): the evening one at 20:00, Sunday's at 19:00. */
export function alertDue(now: Date): "evening" | "weekly" | null {
  const w = new Date(now.getTime() + 3_600_000);
  if (w.getUTCDay() === 0 && w.getUTCHours() === 19) return "weekly";
  if (w.getUTCHours() === 20) return "evening";
  return null;
}
