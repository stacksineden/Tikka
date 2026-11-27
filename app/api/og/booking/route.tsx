import type { NextRequest } from "next/server";
import { getBusinessBySlug } from "@/lib/data";
import { bookingImage } from "@/lib/og-art";

// "We now take bookings": a business's ready-made WhatsApp status (?f=status, 1080×1920) or
// Instagram post (?f=square, 1080×1080), with its best photo, name and link. Add ?download=1 to save it.
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const found = await getBusinessBySlug(sp.get("b") ?? "");
  if (!found) return new Response("Not found", { status: 404 });
  const b = found.business;
  const layout = sp.get("f") === "square" ? "square" : "status";
  const photo = b.page?.heroImageUrl ?? b.portfolio.find((p) => p.kind !== "video")?.url;
  const abs = photo && photo.startsWith("/") ? new URL(photo, request.url).toString() : photo;
  return bookingImage(b, abs, layout, sp.get("download") ? `${b.slug}-bookings-${layout}.${"png"}` : undefined);
}
