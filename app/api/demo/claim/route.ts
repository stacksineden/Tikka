import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { claimCookie, parseSource, VISITOR_COOKIE } from "@/lib/claim";
import { demoClaim, getClaimStatus, posterOf, recordEvent } from "@/lib/data";
import { qrSvg } from "@/lib/qr";

// DEMO: stands in for click-to-claim on WhatsApp until M5. The real flow creates a claim
// intent here and the card comes from claim_card() once the WhatsApp message arrives.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { business?: string; drop?: string; name?: string; source?: string; posterId?: string; futureDrops?: boolean } | null;
  const visitorId = (await cookies()).get(VISITOR_COOKIE)?.value;
  if (!body?.business || !body.drop || !visitorId) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 400 });
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ ok: false, reason: "name" }, { status: 400 });

  // The future-drops box is unticked unless they ticked it (rule 12).
  const result = await demoClaim(body.business, body.drop, name, visitorId, body.futureDrops === true);
  if (!result.ok) return NextResponse.json(result, { status: 409 });

  const source = parseSource(body.source);
  const posterId = source === "qr" ? await posterOf(body.business, body.posterId) : undefined;
  await recordEvent(result.dropId, "claim_completed", source, visitorId, posterId);
  // The QR encodes the code only (TECH_PLAN §7).
  const qr = await qrSvg(result.card.code);
  const res = NextResponse.json({ ok: true, card: result.card, qr, status: await getClaimStatus(result.card.token) });
  res.cookies.set(claimCookie(result.dropId), result.card.token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 60 });
  return res;
}
