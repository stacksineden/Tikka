import { NextResponse } from "next/server";
import { startDepositCheckout } from "@/lib/deposit-checkout";
import { tooMany } from "@/lib/rate-limit";

// "Finish paying" from a booking pass whose deposit isn't paid yet (REVENUE_PLAN 5.4).
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { token?: string } | null;
  const token = String(body?.token ?? "");
  const fail = (reason: string, status = 409) => NextResponse.json({ ok: false, reason }, { status, headers: { "Cache-Control": "no-store" } });
  if (!/^[0-9a-f]{24}$/.test(token)) return fail("not_found", 404);
  if (await tooMany(request, "pay", token)) return fail("slow_down", 429);
  const r = await startDepositCheckout(token);
  if (r.kind !== "url") return fail(r.kind);
  return NextResponse.json({ ok: true, url: r.url }, { headers: { "Cache-Control": "no-store" } });
}
