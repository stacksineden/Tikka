"use server";

import { redirect } from "next/navigation";
import { acceptInvite } from "@/lib/data";
import { clearSession, getSessionUser, setSessionUser } from "@/lib/session";

// DEMO AUTH: these become Supabase Auth calls in M1 (signInWithPassword, signUp with
// email confirmation, signInWithOAuth('google'), resetPasswordForEmail, updateUser).

export type FormState = { error?: string; fields?: Record<string, string> } | undefined;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** DEMO: one id per email, so each sign-up gets its own business in the demo store. */
function demoUserId(email: string) {
  return "user_" + email.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/app") ? next : "/app";
}

export async function signIn(_prev: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!EMAIL.test(email)) return { error: "Enter the email you signed up with.", fields: { email } };
  if (password.length < 8) return { error: "That email and password don't match.", fields: { email } };

  await setSessionUser({ id: "user_demo", email, name: "Funmi", role: "owner", isAdmin: true, isNew: false });
  redirect(safeNext(form.get("next")));
}

export async function signUp(_prev: FormState, form: FormData): Promise<FormState> {
  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const fields = { name, email };
  if (!name) return { error: "Tell us your name.", fields };
  if (!EMAIL.test(email)) return { error: "Enter a real email address. We send a link to confirm it.", fields };
  if (password.length < 8) return { error: "Use at least 8 characters for your password.", fields };

  redirect(`/check-email?email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}`);
}

/** Stands in for the link in the confirmation email. */
export async function confirmEmail(form: FormData) {
  const email = String(form.get("email") ?? "you@business.com");
  const name = String(form.get("name") ?? "").split(" ")[0] || "there";
  await setSessionUser({ id: demoUserId(email), email, name, role: "owner", isNew: true });
  redirect("/app/welcome");
}

export async function continueWithGoogle(form: FormData) {
  const intent = form.get("intent");
  if (intent === "sign-up") {
    await setSessionUser({ id: demoUserId(`google_${Date.now()}@gmail.com`), email: "you@gmail.com", name: "Funmi", role: "owner", isNew: true });
    redirect("/app/welcome");
  }
  await setSessionUser({ id: "user_demo", email: "funmi@glowstudio.ng", name: "Funmi", role: "owner", isAdmin: true, isNew: false });
  redirect(safeNext(form.get("next")));
}

export async function requestReset(_prev: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim();
  if (!EMAIL.test(email)) return { error: "Enter the email you signed up with.", fields: { email } };
  redirect(`/forgot-password/sent?email=${encodeURIComponent(email)}`);
}

export async function resetPassword(_prev: FormState, form: FormData): Promise<FormState> {
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  if (password.length < 8) return { error: "Use at least 8 characters." };
  if (password !== confirm) return { error: "The two passwords don't match." };
  await setSessionUser({ id: "user_demo", email: "funmi@glowstudio.ng", name: "Funmi", role: "owner", isAdmin: true, isNew: false });
  redirect("/app");
}

export async function signOut() {
  await clearSession();
  redirect("/");
}

export async function finishTour(form: FormData) {
  const user = await getSessionUser();
  if (user) await setSessionUser({ ...user, isNew: false });
  redirect(form.get("next") === "setup" ? "/app/setup" : "/app");
}

/**
 * Accepting a staff invite (TECH_PLAN §2): signs them in (Google or email) and adds the
 * membership. Staff land on the redeem screen; it's the only part of the dashboard they see.
 */
export async function acceptStaffInvite(token: string, _prev: FormState, form: FormData): Promise<FormState> {
  const google = form.get("method") === "google";
  const name = google ? "Staff" : String(form.get("name") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!google) {
    if (!name) return { error: "Tell us your name, so the owner knows who redeemed.", fields: { name } };
    if (password.length < 8) return { error: "Use at least 8 characters for your password.", fields: { name } };
  }
  const email = String(form.get("email") ?? "");
  const id = "staff_" + email.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
  const joined = await acceptInvite(token, name.split(" ")[0] || "Staff", id);
  if (!joined) return { error: "This invite has expired or was already used. Ask the owner to send a new one." };
  await setSessionUser({ id, email: joined.email, name: name.split(" ")[0] || "Staff", role: "staff", businessOwnerId: joined.ownerId, isNew: false });
  redirect("/app/redeem");
}
