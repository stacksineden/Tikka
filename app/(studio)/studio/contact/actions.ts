"use server";

import { headers } from "next/headers";
import { getBusiness } from "@/lib/data";
import { requestPhone } from "@/lib/privacy";
import { tooMany } from "@/lib/rate-limit";
import { getOwnerUser } from "@/lib/session";
import { dbSubmitEnquiry } from "@/lib/studio-db";
import { BUDGET_RANGES, STUDIO_CATEGORIES } from "@/lib/studio-shared";

export type EnquiryState = { ok?: true; error?: string; fields?: Record<string, string> } | undefined;

const SERVICE_IDS = new Set<string>(STUDIO_CATEGORIES.map((c) => c.id));

/** /studio/contact (PRD B11): checked here, rate-limited, saved by submit_studio_enquiry(). */
export async function sendEnquiry(_prev: EnquiryState, form: FormData): Promise<EnquiryState> {
  const get = (k: string) => String(form.get(k) ?? "").trim();
  const fields = { name: get("name"), businessName: get("businessName"), phone: get("phone"), note: get("note"), budget: get("budget") };
  const services = form.getAll("services").map(String).filter((s) => SERVICE_IDS.has(s));
  const source = get("from");

  if (!fields.name) return { error: "Tell us your name.", fields };
  if (!fields.businessName) return { error: "Tell us your business name.", fields };
  const phone = requestPhone(fields.phone);
  if (!phone) return { error: "Type your WhatsApp number, like 0803 123 4567.", fields };
  if (!services.length) return { error: "Tick at least one thing you need help with.", fields };
  if (fields.note.length > 1000) return { error: "Keep the note under 1,000 characters.", fields };
  const budget = (BUDGET_RANGES as readonly string[]).includes(fields.budget) ? fields.budget : undefined;

  if (await tooMany({ headers: await headers() }, "enquiry", phone)) {
    return { error: "We've had a few enquiries from you already. Chat with us on WhatsApp instead.", fields };
  }

  // Linked to the business when the person is signed in as its owner.
  const owner = await getOwnerUser();
  const business = owner ? await getBusiness(owner) : null;
  const ok = await dbSubmitEnquiry({
    name: fields.name.slice(0, 80),
    businessName: fields.businessName.slice(0, 120),
    phone,
    services,
    budgetRange: budget,
    note: fields.note || undefined,
    sourceCaseStudy: /^[a-z0-9-]{1,80}$/.test(source) ? source : undefined,
    businessId: business?.id,
  });
  return ok ? { ok: true } : { error: "That didn't go through. Try again, or chat with us on WhatsApp.", fields };
}
