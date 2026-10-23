import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { cache } from "react";
import { demoStaffOwner } from "./data";
import { createClient } from "./supabase/server";
import type { SessionUser } from "./types";

/**
 * Who's signed in, from Supabase Auth (the token is verified, not just read). Once per request.
 * The name and admin flag come from `profiles`; the role from `business_members`.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const demo = await demoSession();
  if (demo) return demo;

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  const id = claims.sub;
  const meta = (claims.user_metadata ?? {}) as { name?: string; full_name?: string; tour_done?: boolean };

  const [{ data: profile }, { data: membership }] = await Promise.all([
    supabase.from("profiles").select("display_name, is_admin").eq("user_id", id).maybeSingle(),
    supabase.from("business_members").select("role").eq("user_id", id).limit(1).maybeSingle(),
  ]);
  const name = (profile?.display_name ?? meta.name ?? meta.full_name ?? String(claims.email ?? "").split("@")[0]).split(" ")[0] || "there";

  // DEMO: staff redeem for a business in the demo store until Team moves to business_members.
  const staffOf = demoStaffOwner(id);
  const role = membership?.role === "staff" || staffOf ? "staff" : "owner";
  return {
    id,
    email: String(claims.email ?? ""),
    name,
    role,
    businessOwnerId: staffOf ?? undefined,
    isAdmin: !!profile?.is_admin,
    isNew: role === "owner" && !meta.tour_done,
  };
});

/** The signed-in owner, or null (staff can only redeem: TECH_PLAN §2). */
export async function getOwnerUser(): Promise<SessionUser | null> {
  const user = await getSessionUser();
  return user?.role === "owner" ? user : null;
}

/** Read by the proxy to send staff straight to Redeem. Only a shortcut: every page checks the role. */
export const STAFF_HINT = "tikka_staff";

/** After signing in: remember whether this person is staff, for the proxy's shortcut. */
export async function rememberRole(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase.from("business_members").select("role").eq("user_id", userId).limit(1).maybeSingle();
  const staff = data?.role === "staff" || !!demoStaffOwner(userId);
  const jar = await cookies();
  if (staff) jar.set(STAFF_HINT, "1", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  else jar.delete(STAFF_HINT);
}

// ------------------------------------------------------------------ DEMO
// The Glow Studio demo business lives in the demo store under a fixed id, so a real sign-in
// can't reach it. In development only, "Open the demo business" on the sign-in page sets this
// cookie instead. Never in production. Remove with the demo store.

export const DEMO_COOKIE = "tikka_demo_session";
export const demoAllowed = process.env.NODE_ENV !== "production";

async function demoSession(): Promise<SessionUser | null> {
  if (!demoAllowed) return null;
  const raw = (await cookies()).get(DEMO_COOKIE)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as SessionUser;
  } catch {
    return null;
  }
}

export async function setDemoSession(user: SessionUser) {
  if (!demoAllowed) return;
  (await cookies()).set(DEMO_COOKIE, Buffer.from(JSON.stringify(user)).toString("base64url"), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearDemoSession() {
  (await cookies()).delete(DEMO_COOKIE);
}
