"use server";

import { redirect } from "next/navigation";
import { devRecord, devWhatsAppAllowed } from "@/lib/whatsapp/dev-outbox";
import { handleInbound } from "@/lib/whatsapp/inbound";
import { processQueue } from "@/lib/whatsapp/send";

/**
 * DEMO (development only): a message from the test phone goes through exactly what the Meta
 * webhook runs, then the queue is sent, so Tikka's reply shows up straight away.
 */
export async function sendTestMessage(form: FormData) {
  if (!devWhatsAppAllowed) redirect("/");
  const digits = String(form.get("phone") ?? "").replace(/\D/g, "").replace(/^0/, "234");
  const text = String(form.get("text") ?? "").trim();
  const name = String(form.get("name") ?? "").trim() || undefined;
  if (digits.length < 10 || !text) redirect(`/dev/whatsapp?phone=${digits}&error=1`);
  devRecord({ phone: `+${digits}`, direction: "in", text });
  await handleInbound({ id: `dev.in.${crypto.randomUUID()}`, from: digits, name, text });
  await processQueue(20);
  redirect(`/dev/whatsapp?phone=${digits}${name ? `&name=${encodeURIComponent(name)}` : ""}`);
}
