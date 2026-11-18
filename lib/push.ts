import "server-only";

import webpush from "web-push";
import { whenLabel } from "./bookings";
import { BOOKING_ALERT_URL, bookingAlertText, LEAD_ALERT_URL, leadAlertText, testAlertText } from "./lead-alert";
import { adminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";

// New lead alerts by web push (the owner's phone). The keys (VAPID) live in the environment:
// NEXT_PUBLIC_VAPID_PUBLIC_KEY (the browser needs it), VAPID_PRIVATE_KEY and VAPID_SUBJECT (a
// mailto: or https: contact). Without them, alerts are off and the dashboard hides the card.
// Sending never blocks or fails a claim: callers run it after the response, and errors are swallowed.

type Sub = { endpoint: string; p256dh: string; auth: string };

export function pushConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
}

let ready = false;
function setup(): boolean {
  if (!pushConfigured()) return false;
  if (!ready) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT!, process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
    ready = true;
  }
  return true;
}

/** Sends to each phone; a phone that's gone (404/410) is forgotten. Returns how many accepted it. */
async function sendAll(subs: Sub[], payload: Record<string, unknown>): Promise<number> {
  const body = JSON.stringify(payload);
  const results = await Promise.all(
    subs.map(async (s) => {
      try {
        // TTL: a lead alert older than a day isn't worth showing. Urgency high: it's what they asked for.
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 86_400, urgency: "high" });
        return 1;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await adminClient().rpc("forget_push_endpoint", { p_endpoint: s.endpoint });
        return 0;
      }
    }),
  );
  return results.reduce<number>((a, b) => a + b, 0);
}

/** After a claim: tell the business's owner(s). Never throws. */
export async function sendLeadAlert(viewToken: string): Promise<void> {
  try {
    if (!setup()) return;
    const { data } = await adminClient().rpc("lead_alert", { p_view_token: viewToken });
    const a = data as { business_name: string; drop_id: string; first_name: string; tier: string; reward: string; recent: number; subscriptions: Sub[] } | null;
    if (!a || !a.subscriptions?.length) return;
    const text = leadAlertText({ businessName: a.business_name, firstName: a.first_name, tier: a.tier, reward: a.reward, recent: Number(a.recent) || 1 });
    // One notification per drop: the phone replaces the last one with the same tag.
    await sendAll(a.subscriptions, { ...text, tag: `lead-${a.drop_id}`, url: LEAD_ALERT_URL });
  } catch {
    // Alerts are a nice-to-have; a claim never depends on them.
  }
}

/** After a booking: tell the business's owner(s). Never throws, never shows the customer's number. */
export async function sendBookingAlert(bookingId: string): Promise<void> {
  try {
    if (!setup()) return;
    const { data } = await adminClient().rpc("booking_alert", { p_booking: bookingId });
    const a = data as { business_id: string; business_name: string; first_name: string; service: string; starts_at: string; subscriptions: Sub[] } | null;
    if (!a || !a.subscriptions?.length) return;
    const text = bookingAlertText({ businessName: a.business_name, firstName: a.first_name, service: a.service, when: whenLabel(a.starts_at) });
    await sendAll(a.subscriptions, { ...text, tag: `booking-${bookingId}`, url: BOOKING_ALERT_URL });
  } catch {
    // A booking never depends on its alert.
  }
}

/** "Send a test notification": the signed-in owner's own phones for this business. */
export async function sendTestAlert(businessId: string, businessName: string): Promise<number> {
  if (!setup()) return 0;
  const sb = await createClient();
  const { data, error } = await sb.rpc("my_push_subscriptions", { p_business: businessId });
  if (error) return 0;
  return sendAll((data ?? []) as Sub[], { ...testAlertText(businessName), tag: "lead-test", url: LEAD_ALERT_URL });
}

/* ------------------------------------------------- the owner's phone, from the dashboard */

/** Turn alerts on for this phone (owner only, checked in SQL). */
export async function dbSavePush(businessId: string, sub: Sub, userAgent: string | null): Promise<boolean> {
  const sb = await createClient();
  const { data, error } = await sb.rpc("save_push_subscription", {
    p_business: businessId,
    p_endpoint: sub.endpoint,
    p_p256dh: sub.p256dh,
    p_auth: sub.auth,
    p_user_agent: userAgent,
  });
  return !error && data === true;
}

/** Turn alerts off for this phone (only the caller's own). */
export async function dbRemovePush(endpoint: string): Promise<boolean> {
  const sb = await createClient();
  const { error } = await sb.rpc("remove_push_subscription", { p_endpoint: endpoint });
  return !error;
}

/** Whether this phone has alerts on for this business. */
export async function dbPushSubscribed(businessId: string, endpoint: string): Promise<boolean> {
  const sb = await createClient();
  const { data } = await sb.rpc("push_subscribed", { p_business: businessId, p_endpoint: endpoint });
  return data === true;
}
