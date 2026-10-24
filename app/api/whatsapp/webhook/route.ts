import { createHmac, timingSafeEqual } from "node:crypto";
import { after, type NextRequest } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { handleInbound } from "@/lib/whatsapp/inbound";
import { processQueue } from "@/lib/whatsapp/send";

// Meta's webhook (TECH_PLAN §5). GET is the one-time verification handshake; POST carries
// incoming messages and delivery statuses. Only requests signed with the app secret count.
// Everything is answered within a second: replies are queued, and the queue is sent right after.

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  if (token && p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === token) return new Response(p.get("hub.challenge") ?? "", { status: 200 });
  return new Response("Forbidden", { status: 403 });
}

function signedByMeta(raw: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(raw).digest("hex"));
  const given = Buffer.from(header.slice(7));
  return expected.length === given.length && timingSafeEqual(expected, given);
}

interface MetaChange {
  value?: {
    contacts?: { wa_id: string; profile?: { name?: string } }[];
    messages?: { id: string; from: string; type: string; text?: { body: string }; button?: { text: string }; interactive?: { button_reply?: { title: string } } }[];
    statuses?: { id: string; status: string; errors?: { title?: string }[] }[];
  };
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (!signedByMeta(raw, request.headers.get("x-hub-signature-256"))) return new Response("Invalid signature", { status: 401 });
  const body = JSON.parse(raw) as { entry?: { changes?: MetaChange[] }[] };
  const admin = adminClient();
  for (const change of (body.entry ?? []).flatMap((e) => e.changes ?? [])) {
    const v = change.value ?? {};
    for (const m of v.messages ?? []) {
      const name = v.contacts?.find((c) => c.wa_id === m.from)?.profile?.name;
      const text = m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? "";
      try {
        await handleInbound({ id: m.id, from: m.from, name, text });
      } catch {
        // Meta retries on a non-200; the message id makes a retry harmless, so just carry on.
      }
    }
    for (const s of v.statuses ?? []) {
      if (s.status === "delivered" || s.status === "read" || s.status === "failed") {
        await admin.rpc("record_outbound_status", { p_wa_message_id: s.id, p_status: s.status, p_error: s.errors?.[0]?.title ?? null });
      }
    }
  }
  // Card replies leave within seconds instead of waiting for the cron.
  after(() => processQueue(20).catch(() => {}));
  return new Response("ok", { status: 200 });
}
