import type { NextRequest } from "next/server";
import { getPublicDrop } from "@/lib/data";
import { dropImage } from "@/lib/og-art";

// The link preview for a drop (PRD A1): the sealed wrapper with the business seal.
// What people see when the link is pasted into WhatsApp, Instagram or X.
export async function GET(request: NextRequest) {
  const b = request.nextUrl.searchParams.get("b") ?? "";
  const d = request.nextUrl.searchParams.get("d") ?? "";
  const found = await getPublicDrop(b, d);
  if (!found) return new Response("Not found", { status: 404 });
  return dropImage(found.business, found.drop, "preview", `usetikka.com/d/${b}/${d}`);
}
