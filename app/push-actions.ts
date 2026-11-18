"use server";

import { headers } from "next/headers";
import { getBusiness, isDbId } from "@/lib/data";
import { dbPushSubscribed, dbRemovePush, dbSavePush, pushConfigured, sendTestAlert } from "@/lib/push";
import { getOwnerUser } from "@/lib/session";

// New lead alerts on the owner's phone (web push). Owners only: staff never get lead alerts (rule 4),
// and the database checks again. The demo business has no real account, so alerts are off for it.

type Sub = { endpoint: string; p256dh: string; auth: string };

const isSub = (s: unknown): s is Sub => {
  const v = s as Partial<Sub> | null;
  return !!v && typeof v.endpoint === "string" && v.endpoint.startsWith("https://") && v.endpoint.length <= 1000 && typeof v.p256dh === "string" && v.p256dh.length <= 200 && typeof v.auth === "string" && v.auth.length <= 100;
};

async function ownerBusiness() {
  const owner = await getOwnerUser();
  const business = owner ? await getBusiness(owner) : null;
  return business && isDbId(business.id) ? business : null;
}

export async function savePushAction(sub: unknown): Promise<{ ok: true } | { ok: false; reason: "not_owner" | "off" | "failed" }> {
  if (!pushConfigured()) return { ok: false, reason: "off" };
  const business = await ownerBusiness();
  if (!business) return { ok: false, reason: "not_owner" };
  if (!isSub(sub)) return { ok: false, reason: "failed" };
  const ua = (await headers()).get("user-agent");
  return (await dbSavePush(business.id, sub, ua)) ? { ok: true } : { ok: false, reason: "failed" };
}

export async function removePushAction(endpoint: string): Promise<{ ok: boolean }> {
  if (typeof endpoint !== "string" || !endpoint) return { ok: false };
  return { ok: await dbRemovePush(endpoint) };
}

export async function pushStateAction(endpoint: string): Promise<{ on: boolean }> {
  const business = await ownerBusiness();
  if (!business || typeof endpoint !== "string" || !endpoint) return { on: false };
  return { on: await dbPushSubscribed(business.id, endpoint) };
}

export async function testPushAction(): Promise<{ sent: number }> {
  const business = await ownerBusiness();
  if (!business) return { sent: 0 };
  return { sent: await sendTestAlert(business.id, business.name) };
}
