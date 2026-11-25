"use server";

// NEW DIRECTION: the money alerts on this phone (demo only for now).

import { moneyAlertFor, saveMoneyPhone, type MoneyAlert } from "@/lib/money-alert-data";
import { getOwnerUser } from "@/lib/session";

/** The alert as it would go out right now, for "Send it now". */
export async function previewMoneyAlert(kind: "evening" | "weekly"): Promise<MoneyAlert | null> {
  const user = await getOwnerUser();
  return user ? moneyAlertFor(user, kind) : null;
}

/** Remembers this phone so the scheduled alerts reach it (needs the push keys to send). */
export async function saveMoneyPhoneAction(sub: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }): Promise<{ ok: boolean }> {
  const user = await getOwnerUser();
  if (!user || !sub.endpoint?.startsWith("https://") || !sub.keys?.p256dh || !sub.keys.auth) return { ok: false };
  return { ok: saveMoneyPhone(user, { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } }) };
}
