import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { joinWaitlist } from "@/lib/bookings-data";
import { firstName, VISITOR_COOKIE } from "@/lib/claim";
import { getBusinessBySlug, isDbId } from "@/lib/data";
import { tooMany } from "@/lib/rate-limit";
import { demoAllowed } from "@/lib/session";
import { normalizeNgPhone } from "@/lib/setup";

// "Join the waitlist" on a full day. Real businesses (docs/DB_MOVE.md step 3): rate-limited like
// bookings, and join_waitlist() keeps one entry per number per day. Demo businesses: the demo store
// (no rate limit: the limiter writes to Supabase).

const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { slug?: string; serviceId?: string; day?: string; name?: string; phone?: string } | null;
  const name = firstName(String(body?.name ?? ""));
  const phone = normalizeNgPhone(String(body?.phone ?? ""));
  if (!body?.slug || !body.serviceId || !body.day) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 400, headers: noStore });
  if (!name) return NextResponse.json({ ok: false, reason: "bad_name" }, { status: 400, headers: noStore });
  if (!phone) return NextResponse.json({ ok: false, reason: "bad_phone" }, { status: 400, headers: noStore });
  const found = await getBusinessBySlug(body.slug);
  if (!found) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404, headers: noStore });
  const real = isDbId(found.ownerId);
  if (!real && !demoAllowed) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404, headers: noStore });

  let visitorId: string | undefined;
  let fresh = false;
  if (real) {
    const jar = await cookies();
    visitorId = jar.get(VISITOR_COOKIE)?.value;
    fresh = !visitorId;
    visitorId ??= randomUUID();
    if (await tooMany(request, "waitlist", visitorId)) return NextResponse.json({ ok: false, reason: "slow_down" }, { status: 429, headers: noStore });
  }
  const r = await joinWaitlist(body.slug, { serviceId: body.serviceId, day: body.day, name, phone, visitorId });
  const res = NextResponse.json(r, { status: r.ok ? 200 : 409, headers: noStore });
  if (fresh && visitorId) res.cookies.set(VISITOR_COOKIE, visitorId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return res;
}
