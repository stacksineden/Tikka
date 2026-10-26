"use server";

import { headers } from "next/headers";
import { getBusiness } from "@/lib/data";
import { requestPhone } from "@/lib/privacy";
import { tooMany } from "@/lib/rate-limit";
import { getOwnerUser } from "@/lib/session";
import { dbJoinEarlyAccessContact, dismissTeaser, joinSparkForBusiness, type Teaser } from "@/lib/studio-db";

// Spark early access (PRD B12). Spark itself isn't built: these only record interest and hide a
// teaser. Owners sign their own business up in one tap; signed-out visitors leave an email or number.

export async function joinSparkAction(): Promise<{ ok: boolean }> {
  const owner = await getOwnerUser();
  const business = owner ? await getBusiness(owner) : null;
  if (!business) return { ok: false };
  return { ok: await joinSparkForBusiness(business.id) };
}

export async function dismissSparkAction(teaser: Teaser): Promise<{ ok: boolean }> {
  const owner = await getOwnerUser();
  const business = owner ? await getBusiness(owner) : null;
  if (!business || (teaser !== "spark_builder" && teaser !== "spark_dashboard")) return { ok: false };
  return { ok: await dismissTeaser(business.id, teaser) };
}

export type SparkContactState = { ok?: true; error?: string; value?: string } | undefined;

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

/** The landing page, signed out: an email or a WhatsApp number. Twice changes nothing. */
export async function joinSparkContactAction(_prev: SparkContactState, form: FormData): Promise<SparkContactState> {
  const raw = String(form.get("contact") ?? "").trim();
  const contact = EMAIL.test(raw) ? raw.toLowerCase() : requestPhone(raw);
  if (!contact || raw.length > 160) return { error: "Type your email or WhatsApp number.", value: raw };
  if (await tooMany({ headers: await headers() }, "early_access", contact)) return { error: "You're already on the list. We'll be in touch.", value: raw };
  return (await dbJoinEarlyAccessContact(contact)) ? { ok: true } : { error: "That didn't go through. Try again.", value: raw };
}
