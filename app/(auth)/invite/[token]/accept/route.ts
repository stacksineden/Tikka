import { NextResponse, type NextRequest } from "next/server";
import { acceptInvite, getInvite } from "@/lib/data";
import { rememberRole } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

/**
 * After signing in from a staff invite: joins the business if the signed-in email is the one
 * that was invited, then opens Redeem.
 */
export async function GET(request: NextRequest, { params }: RouteContext<"/invite/[token]/accept">) {
  const { token } = await params;
  const back = (path: string) => NextResponse.redirect(new URL(path, request.nextUrl.origin));
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return back(`/sign-in?next=${encodeURIComponent(`/invite/${token}/accept`)}`);

  const invite = await getInvite(token);
  if (!invite || invite.state !== "open") return back(`/invite/${token}`);
  if (String(claims.email ?? "").toLowerCase() !== invite.email.toLowerCase()) return back(`/invite/${token}?error=email`);

  const meta = (claims.user_metadata ?? {}) as { name?: string; full_name?: string };
  const name = (meta.name ?? meta.full_name ?? "Staff").split(" ")[0];
  if (!(await acceptInvite(token, name, claims.sub))) return back(`/invite/${token}`);
  await rememberRole(supabase, claims.sub);
  return back("/app/redeem");
}
