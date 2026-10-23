import { NextResponse } from "next/server";
import { runReminders } from "@/lib/data";

// Vercel Cron (TECH_PLAN §5). Card replies are sent straight away; this sends the lower-priority
// queue. For now: the expiry reminders. With CRON_SECRET set, only Vercel Cron can call it.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ ok: false }, { status: 401 });
  const reminders = await runReminders(new Date());
  return NextResponse.json({ ok: true, reminders });
}
