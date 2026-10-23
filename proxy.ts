import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { VISITOR_COOKIE } from "@/lib/claim";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  // Claim pages: an anonymous visitor id (random, 1 year) for link activity (TECH_PLAN §12).
  // Set on the request too, so the very first view already counts.
  // Poster scans (/q/…) get it too, so a scan counts once per person.
  if (request.nextUrl.pathname.startsWith("/d/") || request.nextUrl.pathname.startsWith("/q/")) {
    if (request.cookies.has(VISITOR_COOKIE)) return NextResponse.next();
    const id = crypto.randomUUID();
    request.cookies.set(VISITOR_COOKIE, id);
    const res = NextResponse.next({ request });
    res.cookies.set(VISITOR_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
    return res;
  }

  // DEMO (development only): the demo business's cookie (lib/session.ts).
  const demo = process.env.NODE_ENV !== "production" ? request.cookies.get("tikka_demo_session")?.value : undefined;
  if (demo) return staffToRedeem(request, demoRole(demo) === "staff") ?? NextResponse.next();

  // /app and /admin need a signed-in person. This refreshes their Supabase session; the pages
  // and the database check the role again (/admin → is_admin, staff → Redeem only).
  const { response, userId } = await updateSession(request);
  if (!userId) {
    const url = new URL("/sign-in", request.url);
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return staffToRedeem(request, request.cookies.has("tikka_staff")) ?? response;
}

/** Staff use Redeem only (TECH_PLAN §2). */
function staffToRedeem(request: NextRequest, staff: boolean): NextResponse | null {
  if (!staff || request.nextUrl.pathname.startsWith("/app/redeem")) return null;
  return NextResponse.redirect(new URL("/app/redeem", request.url));
}

/** DEMO: the demo cookie is base64url JSON (lib/session.ts). */
function demoRole(cookie: string): string | undefined {
  try {
    return JSON.parse(atob(cookie.replace(/-/g, "+").replace(/_/g, "/"))).role;
  } catch {
    return undefined;
  }
}

export const config = {
  matcher: ["/app/:path*", "/admin/:path*", "/admin", "/d/:path*", "/q/:path*"],
};
