import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { after, NextResponse } from "next/server";
import { bookForTikka, bookTimeV2 } from "@/lib/bookings-data";
import { dbBookTimeV2, type BookResult } from "@/lib/bookings-db";
import { firstName, VISITOR_COOKIE } from "@/lib/claim";
import { getBusinessBySlug, isDbId } from "@/lib/data";
import { startDepositCheckout } from "@/lib/deposit-checkout";
import { paystackMode } from "@/lib/paystack";
import { sendBookingAlert } from "@/lib/push";
import { tooMany } from "@/lib/rate-limit";
import { demoAllowed } from "@/lib/session";
import { normalizeNgPhone } from "@/lib/setup";

// The booking sheet with choices (docs/OWNER_JOURNEYS.md journeys 2 and 3). Real businesses
// (docs/DB_MOVE.md step 2): rate-limited like /api/book, book_time_v2() prices the picks and works
// out the deposit under a lock, and a deposit goes straight on to Paystack. Demo businesses: the
// demo store, with a pretend deposit and no rate limit (the limiter writes to Supabase).

const noStore = { "Cache-Control": "no-store" };
const fail = (reason: string, status = 409) => NextResponse.json({ ok: false, reason }, { status, headers: noStore });

export async function POST(request: Request) {
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
    /** For Paystack's receipt, when the booking takes a deposit. */
    email?: string;
    futureOffers?: boolean;
    /** "Book a time to use it": the Tikka's card link. Name and number come from the claim. */
    tikka?: string;
  } | null;
  if (!body?.slug || !body.serviceId || !body.startsAt || Number.isNaN(Date.parse(body.startsAt))) return fail("not_found", 400);
  const found = await getBusinessBySlug(body.slug);
  if (!found) return fail("not_found", 404);
  const real = isDbId(found.ownerId);
  if (!real && !demoAllowed) return fail("not_found", 404);

  const tikka = typeof body.tikka === "string" && /^[\w-]{6,80}$/.test(body.tikka) ? body.tikka : undefined;
  const name = tikka ? "" : firstName(String(body.name ?? ""));
  if (!tikka && !name) return fail("bad_name", 400);
  const phone = tikka ? "" : (normalizeNgPhone(String(body.phone ?? "")) ?? "");
  if (!tikka && !phone) return fail("bad_phone", 400);
  const nums = (a: unknown) => (Array.isArray(a) ? a.filter((n) => Number.isInteger(n) && n >= 0 && n < 50).slice(0, 20) : undefined);
  const choice = { option: Number.isInteger(body.option) ? body.option : undefined, people: nums(body.people), extras: nums(body.extras), home: !!body.home };
  const startsAt = new Date(body.startsAt).toISOString();
  const address = typeof body.address === "string" ? body.address.slice(0, 120) : undefined;
  const area = typeof body.area === "string" ? body.area.slice(0, 60) : undefined;
  const answers = typeof body.answers === "string" ? body.answers.slice(0, 300) : undefined;

  if (!real) {
    const r = await bookTimeV2(body.slug, { serviceId: body.serviceId, startsAt, choice, firstName: name, phone, address, area, answers, tikka });
    if ((r.kind === "booked" || r.kind === "already") && "token" in r) return NextResponse.json({ ok: true, token: r.token, already: r.kind === "already" }, { headers: noStore });
    return fail(r.kind);
  }

  const jar = await cookies();
  let visitorId = jar.get(VISITOR_COOKIE)?.value;
  const fresh = !visitorId;
  visitorId ??= randomUUID();
  if ((await tooMany(request, "book", visitorId)) || (await tooMany(request, "book_day", visitorId))) return fail("slow_down", 429);
  const withVisitor = (res: NextResponse) => {
    if (fresh) res.cookies.set(VISITOR_COOKIE, visitorId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
    return res;
  };

  let r: BookResult;
  if (tikka) {
    // A Tikka booking takes no deposit and keeps the Tikka's own rules (book_for_claim()).
    r = await bookForTikka(body.slug, tikka, body.serviceId, startsAt);
    if (r.kind === "already" && "token" in r) return withVisitor(NextResponse.json({ ok: true, token: r.token, already: true }, { headers: noStore }));
  } else {
    r = await dbBookTimeV2({
      businessId: found.business.id,
      serviceId: body.serviceId,
      startsAt,
      firstName: name,
      phone,
      choice,
      address,
      area,
      answers,
      futureOffers: body.futureOffers === true,
      visitorId,
      mode: paystackMode(),
      email: typeof body.email === "string" ? body.email.trim().slice(0, 120) : null,
    });
  }
  // A deposit holds the time for 10 minutes: straight on to Paystack (REVENUE_PLAN 5.4).
  if (r.kind === "pay" && "token" in r) {
    const start = await startDepositCheckout(r.token);
    if (start.kind !== "url") return fail(start.kind === "paystack" ? "paystack" : "closed");
    return withVisitor(NextResponse.json({ ok: true, pay: start.url, token: r.token }, { headers: noStore }));
  }
  if (r.kind !== "booked" || !("token" in r)) return fail(r.kind);
  // New booking alert to the owner's phone, after the response: it never slows or blocks the booking.
  const id = r.id;
  if (id && isDbId(id)) after(() => sendBookingAlert(id));
  return withVisitor(NextResponse.json({ ok: true, token: r.token }, { headers: noStore }));
}
