import { cookies } from "next/headers";
import { parseSource, VISITOR_COOKIE } from "@/lib/claim";
import { dropExists, recordEvent } from "@/lib/data";
import type { EventKind } from "@/lib/types";

// Link activity beacons from the claim page (TECH_PLAN §12). `view` is written by the page
// itself and `claim_completed` by the claim, so only these three come from the browser.
const BEACONS: EventKind[] = ["unwrap", "claim_tap", "claim_continue"];

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { dropId?: string; kind?: string; source?: string } | null;
  const visitorId = (await cookies()).get(VISITOR_COOKIE)?.value;
  const kind = body?.kind as EventKind;
  if (!visitorId || !body?.dropId || !BEACONS.includes(kind) || !(await dropExists(body.dropId))) {
    return new Response(null, { status: 204 });
  }
  await recordEvent(body.dropId, kind, parseSource(body.source), visitorId);
  return new Response(null, { status: 204 });
}
