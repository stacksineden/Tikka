import { NextResponse } from "next/server";
import { dbPriceBooking } from "@/lib/bookings-db";
import { getBusinessBySlug, isDbId } from "@/lib/data";
import { paystackMode } from "@/lib/paystack";

// What the booking sheet shows before Book or Pay, for real businesses (docs/DB_MOVE.md step 2):
// price_booking() works out the total and deposit with the same sums book_time_v2() charges.
// Amounts only, never anyone's booking. The demo prices in the browser (lib/booking-price.ts).

const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { slug?: string; serviceId?: string; option?: number; people?: number[]; extras?: number[]; home?: boolean; qty?: number } | null;
  if (!body?.slug || !body.serviceId) return NextResponse.json({ price: null }, { status: 400, headers: noStore });
  const found = await getBusinessBySlug(body.slug);
  if (!found || !isDbId(found.ownerId)) return NextResponse.json({ price: null }, { status: 404, headers: noStore });
  const nums = (a: unknown) => (Array.isArray(a) ? a.filter((n) => Number.isInteger(n) && n >= 0 && n < 50).slice(0, 20) : undefined);
  const price = await dbPriceBooking(
    found.business.id,
    body.serviceId,
    { option: Number.isInteger(body.option) ? body.option : undefined, people: nums(body.people), extras: nums(body.extras), home: !!body.home, qty: Number.isInteger(body.qty) && (body.qty as number) > 0 && (body.qty as number) <= 50 ? body.qty : undefined },
    paystackMode(),
  );
  return NextResponse.json({ price }, { status: price ? 200 : 404, headers: noStore });
}
