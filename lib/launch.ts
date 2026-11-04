import "server-only";

import { getSessionUser } from "./session";
import { createClient } from "./supabase/server";

/**
 * Pre-launch mode (TIKKA_PRELAUNCH=1): the site is online, but the public can't claim a Tikka or
 * sign up for Notify me, because both collect WhatsApp numbers and the privacy policy and terms
 * are still drafts (PRD C1). Tikka admins and the business's own team can still claim, to test.
 * While it's on, a production build is allowed with draft legal pages (scripts/check-legal.ts);
 * turning it off without the final legal text makes the build fail again.
 */
export function prelaunch(): boolean {
  return process.env.TIKKA_PRELAUNCH === "1";
}

/** Who gets through while pre-launch is on. Pure, so it can be tested. */
export function prelaunchAllows(who: { isAdmin: boolean; isMember: boolean }, action: "claim" | "notify"): boolean {
  if (who.isAdmin) return true;
  return action === "claim" && who.isMember;
}

/** True when this request may claim (or subscribe) now. Always true outside pre-launch. */
export async function openForThisVisitor(action: "claim" | "notify", businessId?: string): Promise<boolean> {
  if (!prelaunch()) return true;
  const user = await getSessionUser();
  if (!user) return false;
  let isMember = false;
  if (action === "claim" && businessId && !user.isAdmin) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("business_members")
      .select("business_id")
      .eq("user_id", user.id)
      .eq("business_id", businessId)
      .maybeSingle();
    isMember = !!data;
  }
  return prelaunchAllows({ isAdmin: !!user.isAdmin, isMember }, action);
}
