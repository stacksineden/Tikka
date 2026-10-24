import { NextResponse } from "next/server";
import { cronAllowed } from "@/lib/cron-auth";
import { runDailySummaries } from "@/lib/data";
import { dbQueueDailySummaries } from "@/lib/summary-db";
import { processQueue } from "@/lib/whatsapp/send";

// Vercel Cron at 07:00 UTC (8:00 WAT): owner daily summaries with the seasonal "Run it again"
// line (TECH_PLAN §5). Only Vercel Cron can call it in production (CRON_SECRET).
export async function GET(request: Request) {
  if (!cronAllowed(request)) return NextResponse.json({ ok: false }, { status: 401 });
  const now = new Date();
  // Real businesses go through the queue (sent now, and by the outbound cron if any are left).
  const queued = await dbQueueDailySummaries(now);
  const sent = await processQueue(100);
  // DEMO: the demo store's summaries.
  const demo = await runDailySummaries(now);
  return NextResponse.json({ ok: true, queued, sent, demo });
}
