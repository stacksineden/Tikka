import { NextResponse } from "next/server";
import { cronAllowed } from "@/lib/cron-auth";
import { runDailySummaries } from "@/lib/data";
import { removeOrphanMedia } from "@/lib/media-cleanup";
import { dbQueueDailySummaries } from "@/lib/summary-db";
import { processQueue } from "@/lib/whatsapp/send";

// The scheduler (Supabase pg_cron, see the scheduler migration) at 07:00 UTC (8:00 WAT): owner
// daily summaries with the seasonal "Run it again" line (TECH_PLAN §5). In production only the
// scheduler can call it (CRON_SECRET).
export async function GET(request: Request) {
  if (!cronAllowed(request)) return NextResponse.json({ ok: false }, { status: 401 });
  const now = new Date();
  // Real businesses go through the queue (sent now, and by the outbound cron if any are left).
  const queued = await dbQueueDailySummaries(now);
  const sent = await processQueue(100);
  // DEMO: the demo store's summaries.
  const demo = await runDailySummaries(now);
  // Files nothing points at any more (a week after upload), so storage doesn't fill up.
  const filesRemoved = await removeOrphanMedia().catch(() => -1);
  return NextResponse.json({ ok: true, queued, sent, demo, filesRemoved });
}
