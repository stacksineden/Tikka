import type { NextRequest } from "next/server";
import { getPublicDrop } from "@/lib/data";
import { dropImage } from "@/lib/og-art";

// Share kit (TECH_PLAN §15): the square post, 1080×1080. Add ?download=1 to save it.
export async function GET(request: NextRequest) {
  const b = request.nextUrl.searchParams.get("b") ?? "";
  const d = request.nextUrl.searchParams.get("d") ?? "";
  const found = await getPublicDrop(b, d);
  if (!found) return new Response("Not found", { status: 404 });
  const download = request.nextUrl.searchParams.get("download") ? `${b}-${d}-square.png` : undefined;
  return dropImage(found.business, found.drop, "square", `usetikka.com/d/${b}/${d}`, download);
}
