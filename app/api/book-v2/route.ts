import { NextResponse } from "next/server";
import { bookTimeV2 } from "@/lib/bookings-data";
import { firstName } from "@/lib/claim";
import { demoAllowed } from "@/lib/session";
import { normalizeNgPhone } from "@/lib/setup";

// NEW DIRECTION, stage 3: the new booking sheet (docs/OWNER_JOURNEYS.md journeys 2 and 3). Demo
// businesses only, in memory: no rate limit here because the limiter writes to Supabase. The
// deposit is pretend in the demo; the real version goes through Paystack like /api/book.

const noStore = { "Cache-Control": "no-store" };
const fail = (reason: string, status = 409) => NextResponse.json({ ok: false, reason }, { status, headers: noStore });

export async function POST(request: Request) {
  if (!demoAllowed) return fail("not_found", 404);
  const body = (await request.json().catch(() => null)) as {
    slug?: string;
    serviceId?: string;
    startsAt?: string;
    option?: number;
    people?: number[];
    extras?: number[];
    home?: boolean;
    address?: string;
    area?: string;
    answers?: string;
    name?: string;
    phone?: string;
  } | null;
  if (!body?.slug || !body.serviceId || !body.startsAt || Number.isNaN(Date.parse(body.startsAt))) return fail("not_found", 400);
  const name = firstName(String(body.name ?? ""));
  if (!name) return fail("bad_name", 400);
  const phone = normalizeNgPhone(String(body.phone ?? ""));
  if (!phone) return fail("bad_phone", 400);
  const nums = (a: unknown) => (Array.isArray(a) ? a.filter((n) => Number.isInteger(n) && n >= 0 && n < 50).slice(0, 20) : undefined);
  const r = await bookTimeV2(body.slug, {
    serviceId: body.serviceId,
    startsAt: new Date(body.startsAt).toISOString(),
    choice: { option: Number.isInteger(body.option) ? body.option : undefined, people: nums(body.people), extras: nums(body.extras), home: !!body.home },
    firstName: name,
    phone,
    address: typeof body.address === "string" ? body.address.slice(0, 120) : undefined,
    area: typeof body.area === "string" ? body.area.slice(0, 60) : undefined,
    answers: typeof body.answers === "string" ? body.answers.slice(0, 160) : undefined,
  });
  if (r.kind === "booked" && "token" in r) return NextResponse.json({ ok: true, token: r.token }, { headers: noStore });
  return fail(r.kind);
}
