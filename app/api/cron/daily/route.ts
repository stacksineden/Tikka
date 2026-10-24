import { NextResponse } from "next/server";
import { runDailySummaries } from "@/lib/data";
import { dbQueueDailySummaries } from "@/lib/summary-db";
import { processQueue } from "@/lib/whatsapp/send";

// Vercel Cron at 07:00 UTC (8:00 WAT): owner daily summaries with the seasonal "Run it again"
// line (TECH_PLAN §5). With CRON_SECRET set, only Vercel Cron can call it.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ ok: false }, { status: 401 });
  const now = new Date();
  // Real businesses go through the queue (sent now, and by the outbound cron if any are left).
  const queued = await dbQueueDailySummaries(now);
  const sent = await processQueue(100);
  // DEMO: the demo store's summaries.
  const demo = await runDailySummaries(now);
  return NextResponse.json({ ok: true, queued, sent, demo });
}
