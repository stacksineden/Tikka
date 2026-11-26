import { NextResponse } from "next/server";
import { changeFromPass } from "@/lib/bookings-data";

// The customer moves or cancels from their pass. Real bookings: change_from_pass() checks the 24
// hours' notice and the free time under a lock (docs/DB_MOVE.md step 2); demo bookings: the demo
// store. The pass link is the only key, as for the pass itself.

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { token?: string; kind?: string; startsAt?: string } | null;
  if (!body?.token || !/^[0-9a-f]{24}$/.test(body.token)) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 400 });
  const r =
    body.kind === "cancel"
      ? await changeFromPass(body.token, { kind: "cancel" })
      : body.kind === "move" && body.startsAt && !Number.isNaN(Date.parse(body.startsAt))
        ? await changeFromPass(body.token, { kind: "move", startsAt: new Date(body.startsAt).toISOString() })
        : { ok: false as const, reason: "not_found" };
  return NextResponse.json(r, { status: r.ok ? 200 : 409, headers: { "Cache-Control": "no-store" } });
}
