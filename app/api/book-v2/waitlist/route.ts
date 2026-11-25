import { NextResponse } from "next/server";
import { joinWaitlist } from "@/lib/bookings-data";
import { firstName } from "@/lib/claim";
import { demoAllowed } from "@/lib/session";
import { normalizeNgPhone } from "@/lib/setup";

// NEW DIRECTION: "Join the waitlist" on a full day (demo businesses only, in memory).

export async function POST(request: Request) {
  if (!demoAllowed) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { slug?: string; serviceId?: string; day?: string; name?: string; phone?: string } | null;
  const name = firstName(String(body?.name ?? ""));
  const phone = normalizeNgPhone(String(body?.phone ?? ""));
  if (!body?.slug || !body.serviceId || !body.day) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 400 });
  if (!name) return NextResponse.json({ ok: false, reason: "bad_name" }, { status: 400 });
  if (!phone) return NextResponse.json({ ok: false, reason: "bad_phone" }, { status: 400 });
  const r = await joinWaitlist(body.slug, { serviceId: body.serviceId, day: body.day, name, phone });
  return NextResponse.json(r, { status: r.ok ? 200 : 409, headers: { "Cache-Control": "no-store" } });
}
