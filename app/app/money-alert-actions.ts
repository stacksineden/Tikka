"use server";

// The money alerts on this phone. Real businesses: the phone is saved with the owner's other
// alerts (push_subscriptions, one switch per phone; docs/DB_MOVE.md step 7). The demo: in memory.

import { headers } from "next/headers";
import { getBusiness, isDbId } from "@/lib/data";
import { moneyAlertFor, saveMoneyPhone, type MoneyAlert } from "@/lib/money-alert-data";
import { dbSavePush } from "@/lib/push";
import { getOwnerUser } from "@/lib/session";

/** The alert as it would go out right now, for "Send it now". */
export async function previewMoneyAlert(kind: "evening" | "weekly"): Promise<MoneyAlert | null> {
  const user = await getOwnerUser();
  return user ? moneyAlertFor(user, kind) : null;
}

/** Remembers this phone so the scheduled alerts reach it (needs the push keys to send). */
export async function saveMoneyPhoneAction(sub: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }): Promise<{ ok: boolean }> {
  const user = await getOwnerUser();
  if (!user || !sub.endpoint?.startsWith("https://") || sub.endpoint.length > 1000 || !sub.keys?.p256dh || !sub.keys.auth) return { ok: false };
  if (isDbId(user.id)) {
    const b = await getBusiness(user);
    if (!b || !isDbId(b.id)) return { ok: false };
    const ua = (await headers()).get("user-agent");
    return { ok: await dbSavePush(b.id, { endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth }, ua) };
  }
  return { ok: saveMoneyPhone(user, { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } }) };
}
