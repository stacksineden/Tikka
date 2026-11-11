import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { claimCookie, firstName, parseSource, VISITOR_COOKIE } from "@/lib/claim";
import { dbCardByViewToken, dbClaimOnPage, dbClaimResult, dbCreateIntent, dbRevealCard } from "@/lib/claim-db";
import { claimMode } from "@/lib/claim-mode";
import { getPublicDrop, isDbId, posterOf } from "@/lib/data";
import { openForThisVisitor } from "@/lib/launch";
import { qrSvg } from "@/lib/qr";
import { clientIp, tooMany } from "@/lib/rate-limit";
import { normalizeNgPhone } from "@/lib/setup";
import { verifyTurnstile } from "@/lib/turnstile";

// Claiming on the page (TIKKA_CLAIM_MODE=page, while WhatsApp waits for Meta): the claimer types a
// Nigerian mobile number, claim_on_page() hands out the card through claim_card() (rules 1–3), and
// the card comes back only to this visitor. A number that already claimed this drop never gets the
// other person's card back. Off unless the mode is on.

const noStore = { "Cache-Control": "no-store" };
const fail = (reason: string, status = 409) => NextResponse.json({ ok: false, reason }, { status, headers: noStore });

export async function POST(request: Request) {
  if (claimMode() !== "page") return fail("not_found", 404);
  const body = (await request.json().catch(() => null)) as {
    business?: string;
    drop?: string;
    name?: string;
    phone?: string;
    source?: string;
    posterId?: string;
    futureDrops?: boolean;
    turnstile?: string;
  } | null;
  const jar = await cookies();
  const visitorId = jar.get(VISITOR_COOKIE)?.value;
  if (!body?.business || !body.drop || !visitorId) return fail("not_found", 400);
  // The hour, then the day (lib/rate-limit.ts, LIMITS).
  if ((await tooMany(request, "claim_page", visitorId)) || (await tooMany(request, "claim_page_day", visitorId))) return fail("slow_down", 429);

  const name = firstName(String(body.name ?? ""));
  if (!name) return fail("name", 400);
  const phone = normalizeNgPhone(String(body.phone ?? ""));
  if (!phone) return fail("phone", 400);
  if (!(await verifyTurnstile(body.turnstile, clientIp(request)))) return fail("check", 403);

  const found = await getPublicDrop(body.business, body.drop);
  if (!found || !isDbId(found.drop.id)) return fail("not_found", 404);
  // Pre-launch: only Tikka admins and the business's own team can claim (lib/launch.ts).
  if (!(await openForThisVisitor("claim", found.business.id))) return fail("prelaunch", 403);

  const source = parseSource(body.source);
  const posterId = source === "qr" ? await posterOf(body.business, body.posterId) : undefined;
  // The future-drops tick is only recorded on drops with the WhatsApp check at the counter: an
  // unproven number gets no drop alerts until it passes the check (claim_on_page clears the opt-in;
  // confirm_redemption brings it back). Rule 12.
  const futureDrops = body.futureDrops === true && found.drop.counterCheck;
  const intent = await dbCreateIntent(found.drop.id, name, futureDrops, visitorId, source, posterId);
  if (intent.kind !== "intent") return fail(intent.kind);

  const r = await dbClaimOnPage(intent.token, phone);
  let viewToken: string | null = null;
  if (r.kind === "claimed") {
    const res = await dbClaimResult(intent.token, visitorId);
    if (res.kind === "ready") viewToken = res.card.token;
  } else if (r.kind === "already_this_browser") {
    viewToken = r.viewToken;
  } else {
    return fail(r.kind);
  }
  if (!viewToken) return fail("invalid");

  const card = await dbCardByViewToken(viewToken);
  if (!card) return fail("invalid");
  await dbRevealCard(viewToken);
  const res = NextResponse.json({ ok: true, card: card.card, qr: await qrSvg(card.card.code), status: card.status }, { headers: noStore });
  // Coming back to the page shows the card again.
  res.cookies.set(claimCookie(card.dropId), viewToken, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 60 });
  return res;
}
