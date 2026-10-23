import { NextResponse } from "next/server";
import { getDropFeed } from "@/lib/data";
import { getOwnerUser } from "@/lib/session";

// The drop dashboard's live feed. Polled every few seconds until Supabase Realtime (M1).
export async function GET(_request: Request, { params }: RouteContext<"/api/drops/[id]/feed">) {
  const user = await getOwnerUser();
  if (!user) return NextResponse.json({ error: "Owners only" }, { status: 403 });
  const { id } = await params;
  const items = await getDropFeed(user, id);
  if (!items) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ now: new Date().toISOString(), items }, { headers: { "Cache-Control": "no-store" } });
}
