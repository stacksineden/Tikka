import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { VISITOR_COOKIE } from "@/lib/claim";
import { scanPoster } from "@/lib/data";
import { normalizePosterCode } from "@/lib/posters";

// A business's permanent QR poster (PRD A7): the live drop, else the business page.
export async function GET(request: Request, { params }: RouteContext<"/q/[code]">) {
  const { code: raw } = await params;
  const code = normalizePosterCode(raw);
  const target = code ? await scanPoster(code, (await cookies()).get(VISITOR_COOKIE)?.value) : null;
  const url = new URL(target ?? `/q?code=${encodeURIComponent(raw)}&missing=1`, request.url);
  return NextResponse.redirect(url, 307);
}
