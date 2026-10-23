import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { rememberRole } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

/**
 * Tikka's own email links (supabase/templates, once custom SMTP is set up): a token hash that
 * works in any browser, unlike the code in /auth/callback.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(searchParams.get("next"));
  if (tokenHash && type) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error && data.user) {
      await rememberRole(supabase, data.user.id);
      return NextResponse.redirect(new URL(next, origin));
    }
  }
  return NextResponse.redirect(new URL(`/sign-in?error=link&next=${encodeURIComponent(next)}`, origin));
}

function safeNext(next: string | null): string {
  return next && /^\/(app|invite\/|reset-password)/.test(next) && !next.startsWith("//") ? next : "/app";
}
