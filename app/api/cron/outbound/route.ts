import { NextResponse } from "next/server";
import { cronAllowed } from "@/lib/cron-auth";
import { runReminders } from "@/lib/data";
import { adminClient } from "@/lib/supabase/admin";
import { processQueue } from "@/lib/whatsapp/send";

// The scheduler every 5 minutes (Supabase pg_cron, see the scheduler migration; TECH_PLAN §5). Queues what's due (expiry reminders, drop-live alerts), tidies
// payments left open, checks the guarantee for drops that are done, then sends the queue in
// priority order. Card replies don't wait for this: the webhook sends them straight away.
// In production only the scheduler can call it (CRON_SECRET).
export async function GET(request: Request) {
  if (!cronAllowed(request)) return NextResponse.json({ ok: false }, { status: 401 });
  const admin = adminClient();
  const [reminders, alerts, abandoned, guarantees] = await Promise.all([
    admin.rpc("enqueue_due_reminders"),
    admin.rpc("enqueue_drop_alerts", { p_cap: 1000 }),
    admin.rpc("abandon_stale_payments"),
    admin.rpc("evaluate_due_guarantees"),
  ]);
  const sent = await processQueue(100);
  // DEMO: the demo store's reminders.
  const demoReminders = await runReminders(new Date());
  return NextResponse.json({
    ok: true,
    queued: { reminders: reminders.data, alerts: alerts.data },
    abandoned: abandoned.data,
    guarantees: guarantees.data,
    sent,
    demoReminders,
  });
}
