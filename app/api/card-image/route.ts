import { NextResponse, type NextRequest } from "next/server";
import { dbClaimIdByViewToken } from "@/lib/claim-db";
import { cardImageUrl } from "@/lib/og-sign";

// "Share my Tikka": the claimer's page knows its own card link (the view token), not the claim id,
// so this turns one into the signed card image. The image itself never shows the code.
export async function GET(request: NextRequest) {
  const t = request.nextUrl.searchParams.get("t") ?? "";
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(t)) return new Response(null, { status: 404 });
  const claimId = await dbClaimIdByViewToken(t);
  if (!claimId) return new Response(null, { status: 404 });
  return NextResponse.redirect(cardImageUrl(request.nextUrl.origin, claimId), { headers: { "Cache-Control": "private, max-age=3600" } });
}
