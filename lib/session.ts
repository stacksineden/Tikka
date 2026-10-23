import "server-only";

import { cookies } from "next/headers";
import type { SessionUser } from "./types";

// DEMO AUTH. A readable cookie standing in for Supabase Auth until M1.
// Nothing here is secure; it exists so the screens can be clicked through end to end.
export const SESSION_COOKIE = "tikka_demo_session";

export async function getSessionUser(): Promise<SessionUser | null> {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as SessionUser;
  } catch {
    return null;
  }
}

/** The signed-in owner, or null (staff can only redeem: TECH_PLAN §2). */
export async function getOwnerUser(): Promise<SessionUser | null> {
  const user = await getSessionUser();
  return user?.role === "owner" ? user : null;
}

export async function setSessionUser(user: SessionUser) {
  (await cookies()).set(SESSION_COOKIE, Buffer.from(JSON.stringify(user)).toString("base64url"), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSession() {
  (await cookies()).delete(SESSION_COOKIE);
}
