import { NextResponse, type NextRequest } from "next/server";
import { getPublicDrop } from "@/lib/data";

// The live counter on the claim page. Polled while the page is open until Realtime (M5).
export async function GET(request: NextRequest) {
  const b = request.nextUrl.searchParams.get("b") ?? "";
  const d = request.nextUrl.searchParams.get("d") ?? "";
  const found = await getPublicDrop(b, d);
  if (!found) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { left, total, status } = found.drop;
  return NextResponse.json({ left, total, status }, { headers: { "Cache-Control": "no-store" } });
}
