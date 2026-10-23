import "server-only";

import { randomBytes } from "node:crypto";

// DEMO STORE for uploaded videos, until Supabase Storage (M1). Lost on restart.
const media: Map<string, { bytes: Buffer; type: string }> = ((globalThis as { __tikkaMedia?: Map<string, { bytes: Buffer; type: string }> }).__tikkaMedia ??= new Map());

export function putDemoMedia(bytes: Buffer, type: string): string {
  const id = randomBytes(8).toString("hex");
  media.set(id, { bytes, type });
  return id;
}

export function getDemoMedia(id: string) {
  return media.get(id);
}
