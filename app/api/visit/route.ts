import { NextResponse } from "next/server";
import { setVisitPlan } from "@/lib/data";
import type { VisitPart } from "@/lib/visit";

// "When will you come in?" (PRD A1). The card's view token is the only key, as on /t/[token].
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { token?: string; date?: string; part?: string } | null;
  if (!body?.token || !body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) return NextResponse.json({ ok: false }, { status: 400 });
  const status = await setVisitPlan(body.token, body.date, body.part as VisitPart);
  if (!status) return NextResponse.json({ ok: false }, { status: 409 });
  return NextResponse.json({ ok: true, status });
}
