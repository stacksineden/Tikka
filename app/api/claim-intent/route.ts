import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { claimCookie, firstName, parseSource, VISITOR_COOKIE } from "@/lib/claim";
import { dbClaimResult, dbCreateIntent, dbRevealCard } from "@/lib/claim-db";
import { claimMessageUrl } from "@/lib/claim-map";
import { getPublicDrop, isDbId, posterOf } from "@/lib/data";
import { qrSvg } from "@/lib/qr";

// Click-to-claim for drops in the database (TECH_PLAN §5). POST: the claim sheet gets its
// TK-XXXXX code and the WhatsApp link. GET: the waiting page asks whether WhatsApp has confirmed;
// the card comes back only to the visitor who started the claim.

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { business?: string; drop?: string; name?: string; source?: string; posterId?: string; futureDrops?: boolean } | null;
  const visitorId = (await cookies()).get(VISITOR_COOKIE)?.value;
  if (!body?.business || !body.drop || !visitorId) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 400 });
  const name = firstName(String(body.name ?? ""));
  if (!name) return NextResponse.json({ ok: false, reason: "name" }, { status: 400 });

  const found = await getPublicDrop(body.business, body.drop);
  if (!found || !isDbId(found.drop.id)) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  const source = parseSource(body.source);
  const posterId = source === "qr" ? await posterOf(body.business, body.posterId) : undefined;
  // The future-drops box is unticked unless they ticked it (rule 12).
  const r = await dbCreateIntent(found.drop.id, name, body.futureDrops === true, visitorId, source, posterId);
  if (r.kind !== "intent") return NextResponse.json({ ok: false, reason: r.kind }, { status: 409 });
  const number = process.env.NEXT_PUBLIC_TIKKA_WHATSAPP;
  // DEMO (development only): until Tikka's number is set, the claim message goes to the test phone.
  const waUrl =
    !number && process.env.NODE_ENV !== "production"
      ? `/dev/whatsapp?text=${encodeURIComponent(`Claim my Tikka ${r.token} from ${found.business.name}`)}`
      : claimMessageUrl(r.token, found.business.name, number);
  return NextResponse.json({ ok: true, token: r.token, waUrl });
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const visitorId = (await cookies()).get(VISITOR_COOKIE)?.value;
  if (!token || !visitorId) return NextResponse.json({ kind: "invalid" }, { headers: { "Cache-Control": "no-store" } });
  const r = await dbClaimResult(token, visitorId);
  if (r.kind !== "ready") return NextResponse.json({ kind: r.kind }, { headers: { "Cache-Control": "no-store" } });
  // They're about to flip it here, so the WhatsApp link later opens it straight away.
  await dbRevealCard(r.card.token);
  // The QR encodes the code only (TECH_PLAN §7).
  const res = NextResponse.json({ kind: "ready", card: r.card, qr: await qrSvg(r.card.code), status: r.status }, { headers: { "Cache-Control": "no-store" } });
  // Coming back to the page shows the card again.
  res.cookies.set(claimCookie(r.dropId), r.card.token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 60 });
  return res;
}
