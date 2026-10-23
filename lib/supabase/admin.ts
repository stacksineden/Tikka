import "server-only";

import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./env";

/**
 * Supabase as the server itself (the secret key: RLS doesn't apply). Only for what no person
 * does directly: completing a payment (Paystack's webhook), the crons, the WhatsApp webhook.
 * Never import this into anything that runs in the browser.
 */
export function adminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("Set SUPABASE_SECRET_KEY in .env.local");
  return createClient(supabaseEnv().url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
