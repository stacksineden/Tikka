import "server-only";

import { siteUrl } from "../supabase/env";
import { adminClient } from "../supabase/admin";
import { compose, type Composed } from "../wa-text";
import { devRecord, devWhatsAppAllowed } from "./dev-outbox";

// The sending side of the queue (TECH_PLAN §5): take a batch in priority order (card replies
// first, rule 7), send each through the Cloud API, record the result. take_outbound() has already
// skipped opted-out numbers, closed 24-hour windows and unapproved templates.

interface Outbound {
  id: string;
  phone: string;
  kind: string;
  template_name: string | null;
  payload: Record<string, unknown>;
  attempts: number;
}

export function whatsappConfigured(): boolean {
  return !!process.env.WHATSAPP_TOKEN && !!process.env.WHATSAPP_PHONE_NUMBER_ID;
}

/** One message out. Returns Meta's message id (or the test inbox's, in development). */
async function deliver(phone: string, m: Composed, template: string | null): Promise<string> {
  if (!whatsappConfigured()) {
    if (!devWhatsAppAllowed) throw new Error("WhatsApp isn't connected (WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID).");
    return devRecord({ phone, direction: "out", text: m.text, template });
  }
  const to = phone.replace(/^\+/, "");
  const body = template
    ? {
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: { name: template, language: { code: "en" }, components: [{ type: "body", parameters: (m.params ?? []).map((text) => ({ type: "text", text: text || " " })) }] },
      }
    : { messaging_product: "whatsapp", to, type: "text", text: { body: m.text, preview_url: true } };
  const res = await fetch(`https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
  if (!res.ok || !json.messages?.[0]?.id) throw new Error(json.error?.message ?? `WhatsApp said ${res.status}`);
  return json.messages[0].id;
}

/** Sends up to `limit` queued messages. Returns how many went out. */
export async function processQueue(limit = 50): Promise<number> {
  const admin = adminClient();
  const { data, error } = await admin.rpc("take_outbound", { p_limit: limit });
  if (error) throw new Error(`take_outbound: ${error.message}`);
  let sent = 0;
  for (const m of (data ?? []) as Outbound[]) {
    try {
      const wamid = await deliver(m.phone, compose(m.kind, m.payload, siteUrl()), m.template_name);
      await admin.rpc("finish_outbound", { p_id: m.id, p_wa_message_id: wamid });
      sent++;
    } catch (e) {
      await admin.rpc("finish_outbound", { p_id: m.id, p_error: (e as Error).message });
    }
  }
  return sent;
}
