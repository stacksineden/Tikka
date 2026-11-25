import { NextResponse } from "next/server";
import { changeFromPass } from "@/lib/bookings-data";
import { demoAllowed } from "@/lib/session";

// NEW DIRECTION, stage 3: the customer moves or cancels from their pass (demo businesses only).

export async function POST(request: Request) {
  if (!demoAllowed) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { token?: string; kind?: string; startsAt?: string } | null;
  if (!body?.token) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 400 });
  const r =
    body.kind === "cancel"
      ? await changeFromPass(body.token, { kind: "cancel" })
      : body.kind === "move" && body.startsAt && !Number.isNaN(Date.parse(body.startsAt))
        ? await changeFromPass(body.token, { kind: "move", startsAt: new Date(body.startsAt).toISOString() })
        : { ok: false as const, reason: "not_found" };
  return NextResponse.json(r, { status: r.ok ? 200 : 409, headers: { "Cache-Control": "no-store" } });
}
