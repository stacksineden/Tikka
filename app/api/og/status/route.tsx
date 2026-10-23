import type { NextRequest } from "next/server";
import { getPublicDrop } from "@/lib/data";
import { dropImage } from "@/lib/og-art";

// Share kit (TECH_PLAN §15): the WhatsApp status image, 1080×1920. Add ?download=1 to save it.
export async function GET(request: NextRequest) {
  const b = request.nextUrl.searchParams.get("b") ?? "";
  const d = request.nextUrl.searchParams.get("d") ?? "";
  const found = await getPublicDrop(b, d);
  if (!found) return new Response("Not found", { status: 404 });
  const download = request.nextUrl.searchParams.get("download") ? `${b}-${d}-status.png` : undefined;
  return dropImage(found.business, found.drop, "status", `usetikka.com/d/${b}/${d}`, download);
}
