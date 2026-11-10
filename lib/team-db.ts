import "server-only";

import { checkFrom } from "./claim-map";
import type { CheckResult } from "./redeem";
import { adminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";
import type { Business } from "./types";
import { fromStored } from "./media-path";
import { initialsFrom } from "./setup";

// The counter and the team for businesses in Supabase, as the signed-in owner or staff member
// (the database checks membership; staff never get a phone number).

export type ConfirmDbResult =
  | { ok: true; name: string; bounceBack: boolean }
  | { ok: false; result: CheckResult | { kind: "needs_action"; code: string } };

/** check_code(): read-only (rule 5). */
export async function dbCheckCode(businessId: string, code: string): Promise<CheckResult> {
  const sb = await createClient();
  const { data, error } = await sb.rpc("check_code", { p_business: businessId, p_code: code });
  return error ? { kind: "unknown", code } : checkFrom(data as Record<string, unknown>);
}

/** confirm_redemption(): locks the claim, checks again, needs the tick on action cards. It also queues the thank-you. */
export async function dbConfirm(
  businessId: string,
  code: string,
  input: { billKobo?: number; actionConfirmed: boolean; customerStatus?: "new" | "returning" },
): Promise<ConfirmDbResult> {
  const sb = await createClient();
  const { data, error } = await sb.rpc("confirm_redemption", {
    p_business: businessId,
    p_code: code,
    p_bill_amount_kobo: input.billKobo ?? null,
    p_action_confirmed: input.actionConfirmed,
    p_customer_status: input.customerStatus ?? null,
  });
  if (error) return { ok: false, result: { kind: "unknown", code } };
  const r = data as Record<string, unknown>;
  if (r.kind === "redeemed") return { ok: true, name: String(r.name ?? ""), bounceBack: !!r.bounce_back };
  if (r.kind === "needs_action") return { ok: false, result: { kind: "needs_action", code: String(r.code ?? code) } };
  return { ok: false, result: checkFrom(r) };
}

/**
 * After confirm_redemption() succeeded for this team: whether the claim's number was typed on the
 * page (never confirmed on WhatsApp), so Tikka can't send the thank-you and staff should ask for the
 * review at the counter. Only a yes/no reaches the screen, never the number.
 */
export async function dbRedeemedOnPage(code: string): Promise<boolean> {
  const { data } = await adminClient().from("claims").select("phone_confirmed").eq("code", code.trim().toUpperCase()).not("redeemed_at", "is", null).maybeSingle();
  return data?.phone_confirmed === false;
}

/* -------------------------------------------------------------------- team */

export interface DbTeam {
  staff: { userId: string; name: string; email: string; addedAt: string }[];
  invites: { token: string; email: string; createdAt: string; expiresAt: string }[];
}

export async function dbTeam(businessId: string): Promise<DbTeam> {
  const sb = await createClient();
  const [{ data: members }, { data: invites }] = await Promise.all([
    sb.rpc("team_members", { p_business: businessId }),
    sb.from("business_invites").select("token, email, created_at, expires_at").eq("business_id", businessId).is("accepted_at", null).gt("expires_at", new Date().toISOString()).order("created_at"),
  ]);
  return {
    staff: ((members ?? []) as { user_id: string; name: string; email: string; role: string; added_at: string }[])
      .filter((m) => m.role === "staff")
      .map((m) => ({ userId: m.user_id, name: m.name, email: m.email, addedAt: m.added_at })),
    invites: (invites ?? []).map((i) => ({ token: i.token, email: i.email, createdAt: i.created_at, expiresAt: i.expires_at })),
  };
}

const INVITE_ERRORS: Record<string, string> = {
  bad_email: "Enter their email address.",
  own_email: "That's your own email.",
  already_staff: "They're already on your team.",
  too_many: "You can have up to 20 staff.",
};

export async function dbInviteStaff(businessId: string, email: string): Promise<{ ok: true; token: string; email: string } | { ok: false; error: string }> {
  const sb = await createClient();
  const { data, error } = await sb.rpc("invite_staff", { p_business: businessId, p_email: email });
  if (error) return { ok: false, error: "We couldn't send that invite. Try again." };
  const r = data as { kind: string; token?: string; email?: string };
  return r.kind === "invited" ? { ok: true, token: r.token!, email: r.email! } : { ok: false, error: INVITE_ERRORS[r.kind] ?? "We couldn't send that invite." };
}

export async function dbCancelInvite(businessId: string, token: string): Promise<void> {
  const sb = await createClient();
  await sb.rpc("cancel_invite", { p_business: businessId, p_token: token });
}

export async function dbRemoveStaff(businessId: string, userId: string): Promise<void> {
  const sb = await createClient();
  await sb.rpc("remove_staff", { p_business: businessId, p_user: userId });
}

/**
 * A new account's way in when its email has an open staff invite: the invite's accept path, so the
 * person joins that business instead of being walked through setting up their own. The email
 * that confirms a new account always points at the welcome tour, whatever page asked for it, so
 * the auth routes ask here first. Server only; the accept route still checks the email itself.
 */
export async function dbInviteAcceptPath(email: string | undefined | null): Promise<string | null> {
  if (!email) return null;
  const { data } = await adminClient()
    .from("business_invites")
    .select("token")
    .ilike("email", email.replace(/[%_\\]/g, "\\$&"))
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.token ? `/invite/${encodeURIComponent(data.token)}/accept` : null;
}

/** The invite page: whose invite, for which email, and whether it's still open. */
export async function dbInviteInfo(
  token: string,
): Promise<{ state: "open" | "accepted" | "expired"; email: string; business: Pick<Business, "name" | "initials" | "brandColor" | "onBrandColor" | "logoUrl"> } | null> {
  const sb = await createClient();
  const { data } = await sb.rpc("invite_info", { p_token: token });
  const r = data as { state: "open" | "accepted" | "expired"; email: string; business: { name: string; logo_path: string | null; brand_color: string; on_brand_color: string } } | null;
  if (!r) return null;
  return {
    state: r.state,
    email: r.email,
    business: { name: r.business.name, initials: initialsFrom(r.business.name), brandColor: r.business.brand_color, onBrandColor: r.business.on_brand_color, logoUrl: fromStored(r.business.logo_path) },
  };
}

/** Joining with the invited email. Returns the business id, or null when it can't. */
export async function dbAcceptInvite(token: string): Promise<string | null> {
  const sb = await createClient();
  const { data } = await sb.rpc("accept_invite", { p_token: token });
  const r = data as { kind: string; business_id?: string } | null;
  return r?.kind === "joined" ? (r.business_id ?? null) : null;
}
