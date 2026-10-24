import "server-only";

// DEMO (development only): where messages go until Meta is connected, so the test phone at
// /dev/whatsapp can show them. Kept in memory; a restart empties it.

export interface DevMessage {
  id: string;
  phone: string;
  direction: "in" | "out";
  text: string;
  at: string;
  /** Template messages: which template Meta would have sent. */
  template?: string | null;
}

const box: DevMessage[] = ((globalThis as { __tikkaDevWhatsApp?: DevMessage[] }).__tikkaDevWhatsApp ??= []);

export const devWhatsAppAllowed = process.env.NODE_ENV !== "production";

export function devRecord(m: Omit<DevMessage, "id" | "at">): string {
  const id = `dev.${crypto.randomUUID()}`;
  box.push({ ...m, id, at: new Date().toISOString() });
  return id;
}

export function devConversation(phone: string): DevMessage[] {
  return box.filter((m) => m.phone === phone);
}

export function devPhones(): string[] {
  return [...new Set(box.map((m) => m.phone))];
}
