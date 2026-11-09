import { NextResponse } from "next/server";
import { getCardStatus } from "@/lib/data";
import { tooMany } from "@/lib/rate-limit";

// The card page's light check while the customer is at the counter (page-claim mode): once staff
// confirm the code, the card turns "used" and the review stars appear. The view token is the key,
// as on /t/[token]; only the status comes back, never the code.
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("t") ?? "";
  if (!token) return NextResponse.json({ ok: false }, { status: 400 });
  if (await tooMany(request, "card_status", token)) return NextResponse.json({ ok: false }, { status: 429 });
  const status = await getCardStatus(token);
  if (!status) return NextResponse.json({ ok: false }, { status: 404 });
  return NextResponse.json({ ok: true, status }, { headers: { "Cache-Control": "no-store" } });
}
