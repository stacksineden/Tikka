import { NextResponse, type NextRequest } from "next/server";
import { rememberRole } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { dbInviteAcceptPath } from "@/lib/team-db";

/**
 * Back from Google, or from a Supabase email link (confirm, reset): swaps the one-time code for
 * a session, then goes on to `next` (our own pages only).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));
  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      // Invited staff confirming a new account: join the business that invited them, not the
      // welcome tour for setting up a business of their own.
      const invite = next.startsWith("/app/welcome") ? await dbInviteAcceptPath(data.user.email).catch(() => null) : null;
      if (invite) return NextResponse.redirect(new URL(invite, origin));
      await rememberRole(supabase, data.user.id);
      return NextResponse.redirect(new URL(next, origin));
    }
  }
  // Expired, used already, or opened in a different browser from the one that asked for it.
  return NextResponse.redirect(new URL(`/sign-in?error=link&next=${encodeURIComponent(next)}`, origin));
}

function safeNext(next: string | null): string {
  return next && /^\/(app|invite\/|reset-password)/.test(next) && !next.startsWith("//") ? next : "/app";
}
