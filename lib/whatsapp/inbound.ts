import "server-only";

import { routeInbound } from "../notify";
import { adminClient } from "../supabase/admin";
import type { Reply } from "../wa-text";

// What happens when someone messages Tikka on WhatsApp (TECH_PLAN §5): the real webhook and the
// development test phone both come through here. Claims go through claim_card() (rules 1–3),
// Notify me through subscribe_notify(), STOP through handle_stop(); every answer is queued, and
// card replies go first (rule 7).

export interface InboundMessage {
  /** Meta's message id: repeats of the same delivery are ignored. */
  id: string;
  /** Meta sends digits ("2348012345678"); stored as +234…. */
  from: string;
  /** Their WhatsApp profile name, if Meta sent one. */
  name?: string;
  text: string;
}

const CLAIM_REPLIES: Record<string, Reply> = {
  sold_out: "sold_out",
  market_sold_out: "market_sold_out",
  blocked_new_only: "blocked_new_only",
  blocked_period: "blocked_period",
  expired: "expired",
  invalid: "invalid",
};

/** Handles one message. Returns false for a repeat delivery (nothing done). */
export async function handleInbound(msg: InboundMessage): Promise<boolean> {
  const admin = adminClient();
  const phone = `+${msg.from.replace(/\D/g, "")}`;
  const { data: fresh } = await admin.rpc("record_inbound", { p_wa_message_id: msg.id, p_phone: phone, p_profile_name: msg.name ?? null, p_body: { text: msg.text } });
  if (!fresh) return false;
  const enqueue = (kind: string, payload: Record<string, unknown>, key: string, business: string | null = null) =>
    admin.rpc("enqueue_message", { p_phone: phone, p_kind: kind, p_payload: payload, p_business: business, p_dedupe_key: key });

  const route = routeInbound(msg.text);
  if (route.kind === "claim") {
    const { data } = await admin.rpc("claim_card", { p_intent_token: route.code, p_phone: phone, p_wa_name: msg.name ?? null });
    const r = (data as { result: string; claim_id: string | null; view_token: string | null }[] | null)?.[0];
    if (r && (r.result === "claimed" || r.result === "duplicate") && r.view_token) {
      const { data: card } = await admin.rpc("claim_by_view_token", { p_view_token: r.view_token });
      const c = card as Record<string, unknown>;
      const payload = { business_name: c.business_name, reward: c.reward, tier: c.tier, code: c.code, expires_at: c.expires_at, view_token: c.view_token };
      // The card once per claim; a repeat (a new code, or the same message sent again) resends it (rule 3).
      const first = r.result === "claimed" ? (await enqueue("card", payload, `card:${r.claim_id}`)).data : null;
      if (!first) await enqueue("resend", payload, `resend:${msg.id}`);
      return true;
    }
    const { data: ctx } = await admin.rpc("intent_context", { p_token: route.code });
    await enqueue("reply", { ...((ctx as Record<string, unknown>) ?? {}), reply: CLAIM_REPLIES[r?.result ?? "invalid"] ?? "invalid" }, `reply:${msg.id}`);
    return true;
  }

  if (route.kind === "notify") {
    const { data } = await admin.rpc("subscribe_notify", { p_token: route.code, p_phone: phone });
    const r = (data ?? { kind: "invalid" }) as Record<string, unknown>;
    if (r.kind === "subscribed" || r.kind === "already") await enqueue("notify_confirm", { ...r, already: r.kind === "already" }, `notify:${msg.id}`);
    else await enqueue("reply", { ...r, reply: r.kind === "live" ? "notify_live" : "notify_invalid" }, `reply:${msg.id}`);
    return true;
  }

  if (route.kind === "stop") {
    const { data } = await admin.rpc("handle_stop", { p_phone: phone, p_all: route.all });
    const r = (data ?? {}) as Record<string, unknown>;
    await enqueue("reply", { ...r, reply: r.scope === "business" ? "stopped" : "stopped_all" }, `reply:${msg.id}`);
    return true;
  }

  // Anything else: a short help reply, at most once an hour per number.
  await enqueue("reply", { reply: "help" }, `help:${phone}:${new Date().toISOString().slice(0, 13)}`);
  return true;
}
