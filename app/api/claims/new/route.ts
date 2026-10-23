import { NextResponse } from "next/server";
import { getNewClaims } from "@/lib/data";
import { getOwnerUser } from "@/lib/session";

// The dashboard's "just claimed" prompt polls this until Realtime arrives (M1). Owners only:
// staff never see who claimed (rule 4).
export async function GET(request: Request) {
  const user = await getOwnerUser();
  if (!user) return NextResponse.json([], { status: 403 });
  const since = new URL(request.url).searchParams.get("since") ?? new Date().toISOString();
  return NextResponse.json(await getNewClaims(user, since), { headers: { "Cache-Control": "no-store" } });
}
