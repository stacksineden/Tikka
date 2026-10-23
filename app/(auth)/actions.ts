"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { clearDemoSession, demoAllowed, getSessionUser, rememberRole, setDemoSession, STAFF_HINT } from "@/lib/session";
import { googleEnabled, siteUrl } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

// Supabase Auth: email + password (with email confirmation) and Google. Business owners, staff
// and admins only; claimers never sign in.

export type FormState = { error?: string; fields?: Record<string, string> } | undefined;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Only our own pages after sign-in: never an outside address. */
function safeNext(value: FormDataEntryValue | string | null | undefined, fallback = "/app"): string {
  const next = typeof value === "string" ? value : "";
  return /^\/(app|invite\/|reset-password)/.test(next) && !next.startsWith("//") ? next : fallback;
}

/** Where an email link or Google sends them back to, then on to `next`. */
function callbackUrl(next: string): string {
  return `${siteUrl()}/auth/callback?next=${encodeURIComponent(next)}`;
}

export async function signIn(_prev: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!EMAIL.test(email)) return { error: "Enter the email you signed up with.", fields: { email } };
  if (!password) return { error: "Enter your password.", fields: { email } };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.code === "email_not_confirmed") return { error: "Confirm your email first: tap the link we sent you.", fields: { email } };
    if (error.status === 429) return { error: "Too many tries. Wait a minute and try again.", fields: { email } };
    return { error: "That email and password don't match.", fields: { email } };
  }
  await rememberRole(supabase, data.user.id);
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

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name }, emailRedirectTo: callbackUrl("/app/welcome") },
  });
  if (error) return { error: authError(error, "We couldn't create your account. Try again in a minute."), fields };
  // An email that already has an account comes back with no identities (and no email is sent).
  if (data.user && data.user.identities?.length === 0) return { error: "There's already an account for this email. Sign in instead.", fields };
  if (data.session) redirect("/app/welcome");
  redirect(`/check-email?email=${encodeURIComponent(email)}`);
}

export async function continueWithGoogle(form: FormData) {
  const intent = form.get("intent");
  const next = intent === "sign-up" ? "/app/welcome" : safeNext(form.get("next"));
  if (!(await googleEnabled())) redirect(`/${intent === "sign-up" ? "sign-up" : "sign-in"}?error=google`);
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: callbackUrl(next) } });
  if (error || !data.url) redirect(`/${intent === "sign-up" ? "sign-up" : "sign-in"}?error=google`);
  redirect(data.url);
}

export async function requestReset(_prev: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim();
  if (!EMAIL.test(email)) return { error: "Enter the email you signed up with.", fields: { email } };
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: callbackUrl("/reset-password") });
  // Never say whether the email has an account; only a rate limit is worth telling them about.
  if (error?.status === 429) return { error: "We just sent one. Wait a minute before asking again.", fields: { email } };
  redirect(`/forgot-password/sent?email=${encodeURIComponent(email)}`);
}

export async function resetPassword(_prev: FormState, form: FormData): Promise<FormState> {
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  if (password.length < 8) return { error: "Use at least 8 characters." };
  if (password !== confirm) return { error: "The two passwords don't match." };
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return { error: "This reset link has expired. Ask for a new one from Forgot password." };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.code === "same_password" ? "That's your current password. Choose a new one." : authError(error, "We couldn't save it. Try again.") };
  redirect("/app");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  await clearDemoSession();
  (await cookies()).delete(STAFF_HINT);
  redirect("/");
}

export async function finishTour(form: FormData) {
  const user = await getSessionUser();
  if (user && demoAllowed && user.id === "user_demo") {
    await setDemoSession({ ...user, isNew: false });
  } else if (user) {
    const supabase = await createClient();
    await supabase.auth.updateUser({ data: { tour_done: true } });
    // The tour flag rides in the token, so get a fresh one now rather than at the next refresh.
    await supabase.auth.refreshSession();
  }
  redirect(form.get("next") === "setup" ? "/app/setup" : "/app");
}

/**
 * Joining as staff (TECH_PLAN §2). Google, or a new password for the invited email; either way
 * they come back to /invite/[token]/accept, which checks the email matches and adds them.
 */
export async function acceptStaffInvite(token: string, _prev: FormState, form: FormData): Promise<FormState> {
  const accept = `/invite/${encodeURIComponent(token)}/accept`;
  const supabase = await createClient();
  if (form.get("method") === "google") {
    if (!(await googleEnabled())) return { error: "Google sign-in isn't available right now. Use a password instead." };
    const { data, error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: callbackUrl(accept) } });
    if (error || !data.url) return { error: "Google sign-in isn't available right now. Use a password instead." };
    redirect(data.url);
  }
  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!name) return { error: "Tell us your name, so the owner knows who redeemed.", fields: { name } };
  if (password.length < 8) return { error: "Use at least 8 characters for your password.", fields: { name } };

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name }, emailRedirectTo: callbackUrl(accept) },
  });
  if (error) return { error: authError(error, "We couldn't create your account. Try again in a minute."), fields: { name } };
  if (data.user && data.user.identities?.length === 0) {
    redirect(`/sign-in?next=${encodeURIComponent(accept)}&notice=existing`);
  }
  if (data.session) redirect(accept);
  redirect(`/check-email?email=${encodeURIComponent(email)}`);
}

/** DEMO (development only): opens the Glow Studio demo business without an account. */
export async function openDemoBusiness() {
  if (!demoAllowed) redirect("/sign-in");
  await setDemoSession({ id: "user_demo", email: "funmi@glowstudio.ng", name: "Funmi", role: "owner", isAdmin: true, isNew: false });
  redirect("/app");
}

// ---------------------------------------------------------------- helpers

function authError(error: { status?: number; code?: string; message: string }, fallback: string): string {
  if (error.status === 429 || error.code === "over_email_send_rate_limit") return "Too many emails sent just now. Wait a few minutes and try again.";
  if (error.code === "weak_password") return "Choose a stronger password: at least 8 characters.";
  if (error.code === "signup_disabled") return "New accounts are paused right now.";
  return fallback;
}
