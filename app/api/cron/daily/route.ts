import { NextResponse } from "next/server";
import { runDailySummaries } from "@/lib/data";

// Vercel Cron at 07:00 UTC (8:00 WAT): owner daily summaries with the seasonal "Run it again"
// line (TECH_PLAN §5). With CRON_SECRET set, only Vercel Cron can call it.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ ok: false }, { status: 401 });
  const summaries = await runDailySummaries(new Date());
  return NextResponse.json({ ok: true, summaries });
}
