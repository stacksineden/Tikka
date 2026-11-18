import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { after, NextResponse } from "next/server";
import { firstName, VISITOR_COOKIE } from "@/lib/claim";
import { bookForTikka, bookTime, getBookingRules, type BookResult } from "@/lib/bookings-data";
import { isDbId } from "@/lib/data";
import { sendBookingAlert } from "@/lib/push";
import { getBusinessBySlug } from "@/lib/data";
import { tooMany } from "@/lib/rate-limit";
import { normalizeNgPhone } from "@/lib/setup";

// The booking calendar on a business page (docs/BOOKINGS.md). GET: the free-time rules (times
// only, never who booked). POST: book a free time; book_time() checks everything again, under a
// lock, so the last place can't go twice.

const noStore = { "Cache-Control": "no-store" };
const fail = (reason: string, status = 409) => NextResponse.json({ ok: false, reason }, { status, headers: noStore });

export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get("slug") ?? "";
  const found = slug ? await getBusinessBySlug(slug) : null;
  if (!found) return NextResponse.json({ rules: null }, { status: 404, headers: noStore });
  return NextResponse.json({ rules: await getBookingRules(found.ownerId, found.business) }, { headers: noStore });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    slug?: string;
    serviceId?: string;
    startsAt?: string;
    name?: string;
    phone?: string;
    futureOffers?: boolean;
    /** "Book a time to use it": the Tikka's card link. Name and number come from the claim. */
    tikka?: string;
  } | null;
  if (!body?.slug || !body.serviceId || !body.startsAt || Number.isNaN(Date.parse(body.startsAt))) return fail("not_found", 400);
  const jar = await cookies();
  let visitorId = jar.get(VISITOR_COOKIE)?.value;
  const fresh = !visitorId;
  visitorId ??= randomUUID();
  if ((await tooMany(request, "book", visitorId)) || (await tooMany(request, "book_day", visitorId))) return fail("slow_down", 429);

  let r: BookResult;
  if (typeof body.tikka === "string" && body.tikka) {
    r = await bookForTikka(body.slug, body.tikka, body.serviceId, new Date(body.startsAt).toISOString());
    if (r.kind === "already" && "token" in r) return NextResponse.json({ ok: true, token: r.token, already: true }, { headers: noStore });
  } else {
    const name = firstName(String(body.name ?? ""));
    if (!name) return fail("bad_name", 400);
    const phone = normalizeNgPhone(String(body.phone ?? ""));
    if (!phone) return fail("bad_phone", 400);

    r = await bookTime(body.slug, {
      serviceId: body.serviceId,
      startsAt: new Date(body.startsAt).toISOString(),
      firstName: name,
      phone,
      futureOffers: body.futureOffers === true,
      visitorId,
    });
  }
  if (r.kind !== "booked" || !("token" in r)) return fail(r.kind);
  // New booking alert to the owner's phone, after the response: it never slows or blocks the booking.
  const id = r.id;
  if (id && isDbId(id)) after(() => sendBookingAlert(id));
  const res = NextResponse.json({ ok: true, token: r.token }, { headers: noStore });
  if (fresh) res.cookies.set(VISITOR_COOKIE, visitorId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return res;
}
