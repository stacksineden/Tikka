import type { NextRequest } from "next/server";
import { getCardImage } from "@/lib/data";
import { cardImage } from "@/lib/og-art";
import { verifyClaim } from "@/lib/og-sign";

// The revealed card as an image (TECH_PLAN §13): the WhatsApp card message and "Share my Tikka".
// Signed, so claim ids can't be walked; it never shows the code.
export async function GET(request: NextRequest) {
  const c = request.nextUrl.searchParams.get("c") ?? "";
  const s = request.nextUrl.searchParams.get("s") ?? "";
  if (!c || !s || !verifyClaim(c, s)) return new Response("Not found", { status: 404 });
  const art = await getCardImage(c);
  if (!art) return new Response("Not found", { status: 404 });
  return cardImage(art);
}
