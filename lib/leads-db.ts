import "server-only";

import { leadFrom, type LeadRow } from "./claim-map";
import { createClient } from "./supabase/server";
import type { Lead } from "./types";

// Leads for businesses in Supabase. get_leads() checks the caller owns the business and errors
// for anyone else (rule 4): the check lives in the database, not here.

export async function dbLeads(businessId: string): Promise<Lead[]> {
  const sb = await createClient();
  const { data, error } = await sb.rpc("get_leads", { p_business: businessId });
  if (error) throw new Error("Only the owner sees leads.");
  return ((data ?? []) as LeadRow[]).map(leadFrom);
}

/** "Message on WhatsApp" was tapped. */
export async function dbLogFollowup(claimId: string): Promise<boolean> {
  const sb = await createClient();
  const { data } = await sb.rpc("log_followup", { p_claim: claimId });
  return data === true;
}

/** The owner's newest claims since a time, with the number (new_claims_since() refuses anyone else). */
export async function dbNewClaims(businessId: string, since: string): Promise<{ view_token: string; first_name: string; tier: string; reward: string; claimed_at: string; expires_at: string; phone: string }[]> {
  const sb = await createClient();
  const { data, error } = await sb.rpc("new_claims_since", { p_business: businessId, p_since: since });
  if (error) return [];
  return data ?? [];
}
