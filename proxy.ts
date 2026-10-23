import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { VISITOR_COOKIE } from "@/lib/claim";

export function proxy(request: NextRequest) {
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

  // Optimistic check only: /app needs a session cookie. Real role checks
  // (/admin → is_admin) arrive with Supabase in M1.
  const session = request.cookies.get("tikka_demo_session")?.value;
  if (!session) {
    const url = new URL("/sign-in", request.url);
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  // Staff use Redeem only (TECH_PLAN §2). The pages and data functions check the role again.
  if (demoRole(session) === "staff" && !request.nextUrl.pathname.startsWith("/app/redeem")) {
    return NextResponse.redirect(new URL("/app/redeem", request.url));
  }
  return NextResponse.next();
}

/** DEMO: the session cookie is base64url JSON (lib/session.ts). */
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
