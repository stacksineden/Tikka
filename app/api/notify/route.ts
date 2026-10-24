import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { VISITOR_COOKIE } from "@/lib/claim";
import { startNotify } from "@/lib/data";

// Notify me (PRD A6). A real business: the NT-XXXXX code's WhatsApp link, and the webhook
// subscribes them and confirms there. DEMO businesses confirm here.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { business?: string; drop?: string } | null;
  if (!body?.business) return NextResponse.json({ ok: false, error: "Missing business" }, { status: 400 });
  const jar = await cookies();
  const visitorId = jar.get(VISITOR_COOKIE)?.value ?? crypto.randomUUID();
  const r = await startNotify(body.business, body.drop || undefined, visitorId);
  const res = NextResponse.json(r, { status: r.ok ? 200 : 404 });
  if (!jar.has(VISITOR_COOKIE)) res.cookies.set(VISITOR_COOKIE, visitorId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return res;
}
