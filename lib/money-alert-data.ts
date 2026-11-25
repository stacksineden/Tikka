import "server-only";

// NEW DIRECTION: the evening and Sunday money alerts. Worked out from the ledger and bookings;
// sent by web push to the phones the owner turned alerts on for. Demo store only for now: the
// phones are kept in memory, and sending needs the VAPID keys (lib/push.ts, docs/LAUNCH.md).

import webpush from "web-push";
import { getBookings } from "./bookings-data";
import { todayKey, watInstant, watParts } from "./bookings";
import { getBusiness, isDbId } from "./data";
import { getLedger } from "./ledger-data";
import { moneyBetween, weekStart } from "./ledger";
import { eveningAlertText, weeklyAlertText } from "./money-alert";
import { pushConfigured } from "./push";
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

/** The scheduled send: every owner with a phone turned on gets this alert. Returns how many went. */
export async function sendMoneyAlerts(kind: "evening" | "weekly", now = new Date()): Promise<number> {
  if (!pushConfigured()) return 0;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT!, process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  let sent = 0;
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
