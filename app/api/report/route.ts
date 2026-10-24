import { cookies } from "next/headers";
import { VISITOR_COOKIE } from "@/lib/claim";
import { reportDrop } from "@/lib/data";
import { tooMany } from "@/lib/rate-limit";

// "Report this drop" (PRD A5): goes to Tikka's admin queue (C2).
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { dropId?: string; reason?: string } | null;
  const visitorId = (await cookies()).get(VISITOR_COOKIE)?.value ?? "anonymous";
  if (!body?.dropId || !body.reason) return new Response(null, { status: 400 });
  if (await tooMany(request, "report", visitorId === "anonymous" ? null : visitorId)) return new Response(null, { status: 429 });
  const ok = await reportDrop(body.dropId, body.reason, visitorId);
  return new Response(null, { status: ok ? 204 : 404 });
}
