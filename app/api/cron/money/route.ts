import { NextResponse } from "next/server";
import { cronAllowed } from "@/lib/cron-auth";
import { sendMoneyAlerts } from "@/lib/money-alert-data";
import { alertDue } from "@/lib/money-alert";

// NEW DIRECTION: the money alerts. The scheduler calls this every hour; it sends the evening alert
// at 20:00 WAT and the week's summary on Sunday at 19:00 WAT. In development, ?kind=evening or
// ?kind=weekly sends one now. In production only the scheduler can call it (CRON_SECRET).
export async function GET(request: Request) {
  if (!cronAllowed(request)) return NextResponse.json({ ok: false }, { status: 401 });
  const asked = new URL(request.url).searchParams.get("kind");
  const kind = process.env.NODE_ENV !== "production" && (asked === "evening" || asked === "weekly") ? asked : alertDue(new Date());
  if (!kind) return NextResponse.json({ ok: true, kind: null, sent: 0 });
  return NextResponse.json({ ok: true, kind, sent: await sendMoneyAlerts(kind) });
}
