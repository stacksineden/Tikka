import { NextResponse, type NextRequest } from "next/server";
import { REF_COOKIE } from "@/lib/pilot-db";

// An invite from another business (usetikka.com/join/<code>): remember the code for 30 days, then
// sign up. The new business is linked to the inviter when it's created (app/app/start/actions.ts).
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const res = NextResponse.redirect(new URL("/sign-up", request.url));
  if (/^[a-z0-9]{6}$/i.test(code)) {
    res.cookies.set(REF_COOKIE, code.toLowerCase(), { maxAge: 30 * 86_400, httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production" });
  }
  return res;
}
