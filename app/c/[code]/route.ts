import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { VISITOR_COOKIE } from "@/lib/claim";
import { normalizeContactCode } from "@/lib/contact-cards";
import { scanContactCard } from "@/lib/contact-cards-data";

// A business card's QR (docs/BUSINESS_CARDS.md): always the business page, never a drop, tagged
// as a business card visit. Counts once per visitor per day. A removed card still works (it may be
// printed); a code that isn't one, or a suspended business's, goes to Tikka's home page.
export async function GET(request: Request, { params }: RouteContext<"/c/[code]">) {
  const { code: raw } = await params;
  const code = normalizeContactCode(raw);
  const target = code ? await scanContactCard(code, (await cookies()).get(VISITOR_COOKIE)?.value) : null;
  return NextResponse.redirect(new URL(target ?? "/", request.url), 307);
}
