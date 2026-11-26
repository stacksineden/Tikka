import "server-only";

// The evening and Sunday money alerts. Worked out from the ledger and bookings; sent by web push.
// Real businesses: the owner's phones in push_subscriptions (the same phones as lead, booking and
// payment alerts), read with money_alert_data() since the scheduled send has no signed-in owner
// (docs/DB_MOVE.md step 7). The demo: phones kept in memory. Sending needs the VAPID keys.

import webpush from "web-push";
import { getBookings } from "./bookings-data";
import { todayKey, watInstant, watParts } from "./bookings";
import { getBusiness, isDbId } from "./data";
import { getLedger } from "./ledger-data";
import { moneyBetween, weekStart } from "./ledger";
import { eveningAlertText, weeklyAlertText } from "./money-alert";
import { payAlertText } from "./lead-alert";
import { pushConfigured } from "./push";
import { ledgerFrom } from "./ledger-db";
import { adminClient } from "./supabase/admin";
import type { SessionUser } from "./types";

type Sub = { endpoint: string; keys: { p256dh: string; auth: string } };
const phones: Map<string, Sub[]> = ((globalThis as { __tikkaMoneyPhones?: Map<string, Sub[]> }).__tikkaMoneyPhones ??= new Map());

export type MoneyAlert = { title: string; body: string; url: string };

export async function moneyAlertFor(user: Pick<SessionUser, "id" | "role">, kind: "evening" | "weekly", now = new Date()): Promise<MoneyAlert | null> {
  if (user.role !== "owner") return null;
  const b = await getBusiness(user);
  if (!b) return null;
  const owner = { ...user, businessOwnerId: undefined };
  const [ledger, bookings] = await Promise.all([getLedger(user), getBookings(owner, new Date(now.getTime() - 60 * 86_400_000), new Date(now.getTime() + 120 * 86_400_000))]);
  const deposits = bookings.filter((x) => x.depositPaidKobo).map((x) => ({ at: x.createdAt, kobo: x.depositPaidKobo!, name: x.firstName, item: x.service }));
  if (kind === "weekly") {
    const from = weekStart(now);
    const m = moneyBetween(ledger, deposits, from, new Date(from.getTime() + 7 * 86_400_000));
    return weeklyAlertText({ businessName: b.name, inKobo: m.inKobo, spentKobo: m.spentKobo, keptKobo: m.keptKobo, best: m.best?.service });
  }
  const start = new Date(watInstant(todayKey(now), 0));
  const m = moneyBetween(ledger, deposits, start, new Date(start.getTime() + 86_400_000));
  const paid = new Set(ledger.sales.map((s) => s.bookingId).filter(Boolean));
  const unpaid = bookings.filter((x) => watParts(x.startsAt).day === todayKey(now) && new Date(x.startsAt) < now && x.status !== "cancelled" && x.status !== "no_show" && !paid.has(x.id)).length;
  return eveningAlertText({ businessName: b.name, inKobo: m.inKobo, unpaid });
}

/** This phone wants the money alerts (demo only for now). */
export function saveMoneyPhone(user: Pick<SessionUser, "id" | "role">, sub: Sub): boolean {
  if (user.role !== "owner" || isDbId(user.id)) return false;
  const list = (phones.get(user.id) ?? []).filter((s) => s.endpoint !== sub.endpoint);
  phones.set(user.id, [...list, sub].slice(-5));
  return true;
}

type Row = Record<string, unknown>;

/** The alert for one real business, from money_alert_data()'s row (same sums as moneyAlertFor). */
export function realMoneyAlert(row: Row, kind: "evening" | "weekly", now: Date): MoneyAlert {
  const ledger = ledgerFrom((row.ledger as Row) ?? {});
  const deposits = ((row.deposits as Row[] | null) ?? []).map((d) => ({ at: String(d.at), kobo: Number(d.kobo), name: String(d.name), item: String(d.item) }));
  const businessName = String(row.business_name);
  if (kind === "weekly") {
    const from = weekStart(now);
    const m = moneyBetween(ledger, deposits, from, new Date(from.getTime() + 7 * 86_400_000));
    return weeklyAlertText({ businessName, inKobo: m.inKobo, spentKobo: m.spentKobo, keptKobo: m.keptKobo, best: m.best?.service });
  }
  const start = new Date(watInstant(todayKey(now), 0));
  const m = moneyBetween(ledger, deposits, start, new Date(start.getTime() + 86_400_000));
  const paid = new Set(ledger.sales.map((s) => s.bookingId).filter(Boolean));
  const unpaid = ((row.today as Row[] | null) ?? []).filter(
    (x) => new Date(String(x.starts_at)) < now && x.status !== "cancelled" && x.status !== "no_show" && !paid.has(String(x.id)),
  ).length;
  return eveningAlertText({ businessName, inKobo: m.inKobo, unpaid });
}

/** The scheduled send: every owner with a phone turned on gets this alert. Returns how many went. */
export async function sendMoneyAlerts(kind: "evening" | "weekly", now = new Date()): Promise<number> {
  if (!pushConfigured()) return 0;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT!, process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  let sent = 0;
  // Real businesses.
  const admin = adminClient();
  const { data } = await admin.rpc("money_alert_data");
  for (const row of (data ?? []) as Row[]) {
    const alert = realMoneyAlert(row, kind, now);
    for (const s of (row.subscriptions as { endpoint: string; p256dh: string; auth: string }[] | null) ?? []) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ ...alert, tag: `money-${kind}` }), { TTL: 6 * 3600 });
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await admin.rpc("forget_push_endpoint", { p_endpoint: s.endpoint });
      }
    }
  }
  // The demo (development only).
  for (const [id, subs] of phones) {
    const alert = await moneyAlertFor({ id, role: "owner" }, kind, now).catch(() => null);
    if (!alert) continue;
    for (const s of subs) {
      try {
        await webpush.sendNotification(s, JSON.stringify({ ...alert, tag: `money-${kind}` }), { TTL: 6 * 3600 });
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) phones.set(id, (phones.get(id) ?? []).filter((x) => x.endpoint !== s.endpoint));
      }
    }
  }
  return sent;
}

/**
 * A pay link was paid: "₦26,500 paid · Ada Hair Studio" to the phones the owner turned alerts on for
 * (the same phones as the money alerts, demo only). Never throws: a payment never depends on its alert.
 */
export async function sendDemoPayAlert(ownerId: string, a: { businessName: string; firstName: string; amountKobo: number; note: string; linkId: string }): Promise<number> {
  try {
    const subs = phones.get(ownerId) ?? [];
    if (!subs.length || !pushConfigured()) return 0;
    webpush.setVapidDetails(process.env.VAPID_SUBJECT!, process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
    const payload = JSON.stringify({ ...payAlertText(a), url: "/app/money/links", tag: `paid-${a.linkId}` });
    let sent = 0;
    for (const s of subs) {
      try {
        await webpush.sendNotification(s, payload, { TTL: 24 * 3600 });
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) phones.set(ownerId, (phones.get(ownerId) ?? []).filter((x) => x.endpoint !== s.endpoint));
      }
    }
    return sent;
  } catch {
    return 0;
  }
}
