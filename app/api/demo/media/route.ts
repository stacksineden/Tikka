import { NextResponse } from "next/server";
import { putDemoMedia } from "@/lib/demo-media";
import { getOwnerUser } from "@/lib/session";

// DEMO: stands in for a Supabase Storage upload until M1. Files are too big for a server
// action (1 MB), so the browser sends the already-compressed file here and saves the URL it gets.
export async function POST(request: Request) {
  const user = await getOwnerUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in as the owner." }, { status: 403 });
  const type = request.headers.get("content-type") ?? "";
  const video = /^video\/(mp4|quicktime)$/.test(type);
  if (!video && type !== "image/webp") return NextResponse.json({ ok: false, error: "Use a photo or an MP4 or MOV video." }, { status: 415 });
  const bytes = Buffer.from(await request.arrayBuffer());
  if (bytes.length > (video ? 15 : 2) * 1024 * 1024) return NextResponse.json({ ok: false, error: video ? "Keep videos under 15 MB." : "That photo is too big." }, { status: 413 });
  return NextResponse.json({ ok: true, url: `/api/demo/media/${putDemoMedia(bytes, type)}` });
}
