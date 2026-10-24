import "server-only";

import { seasonalNudge } from "./nudges";
import { summaryCounts, worthSending } from "./summary";
import { adminClient } from "./supabase/admin";
import { watDate } from "./visit";

// The owner's daily summary for businesses in Supabase (TECH_PLAN §5): daily_summary_rows() has the
// counts and the owner's number; this adds the seasonal line and queues one message per business
// per WAT day (the dedupe key), skipping days with nothing to say.

interface Row {
  business_id: string;
  business_name: string;
  phone: string;
  new_claims: number;
  planning_tomorrow: number;
  expiring_soon: number;
  last_drop_id: string | null;
  last_drop_title: string | null;
  last_drop_customers: number | null;
}

export async function dbQueueDailySummaries(now: Date): Promise<number> {
  const admin = adminClient();
  const { data, error } = await admin.rpc("daily_summary_rows");
  if (error) throw new Error(`daily_summary_rows: ${error.message}`);
  const day = watDate(now);
  let queued = 0;
  for (const r of (data ?? []) as Row[]) {
    const counts: ReturnType<typeof summaryCounts> = { newClaims: r.new_claims, planningTomorrow: r.planning_tomorrow, expiringSoon: r.expiring_soon };
    const last = r.last_drop_id ? { id: r.last_drop_id, name: r.last_drop_title ?? "", customers: r.last_drop_customers ?? 0 } : null;
    const nudge = seasonalNudge(now, last)?.text ?? null;
    if (!worthSending(counts, nudge)) continue;
    const { data: id } = await admin.rpc("enqueue_message", {
      p_phone: r.phone,
      p_kind: "owner_daily",
      p_payload: { business_name: r.business_name, new_claims: r.new_claims, planning_tomorrow: r.planning_tomorrow, expiring_soon: r.expiring_soon, nudge },
      p_business: r.business_id,
      p_dedupe_key: `daily:${r.business_id}:${day}`,
    });
    if (id) queued++;
  }
  return queued;
}
