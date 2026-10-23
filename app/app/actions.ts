"use server";

import { revalidatePath } from "next/cache";
import {
  addPortfolioPhoto,
  addPortfolioVideo,
  addPoster,
  addTikkas,
  cancelInvite,
  endDropEarly,
  extendDrop,
  adminGrantDrop,
  adminSavePack,
  adminSaveTier,
  adminSetFounding,
  buyPack,
  checkCode,
  completeOwnerPayment,
  confirmRedemption,
  deleteDropDraft,
  dismissGuaranteeNotice,
  getBusiness,
  getDropTemplates,
  getPayment,
  inviteStaff,
  publishProblem,
  publishWithVoucher,
  quoteForBusiness,
  removeStaff,
  reportReview,
  saveBusiness,
  saveDropDraft,
  saveOwnerAlerts,
  savePage,
  savePosterHook,
  saveServices,
  startDropPayment,
  takenPrefixes,
  takenSlugs,
  updatePortfolio,
  type AddTikkasResult,
} from "@/lib/data";
import { initializeTransaction, paystackConfigured, verifyTransaction } from "@/lib/paystack";
import { validateDraft, watToIso, withThankYouFilled, type DropDraft } from "@/lib/drop";
import { dropCheck } from "@/lib/dropcheck";
import { templateCategory } from "@/lib/templates";
import { paymentPlace, type Payment } from "@/lib/payments";
import { PORTFOLIO_MAX, slugAlternatives, slugError, suggestSlug } from "@/lib/slug";
import { getOwnerUser, getSessionUser } from "@/lib/session";
import { LIMITS, normalizeNgPhone, prefixAlternatives, validateCard, type CardDraft, type Errors } from "@/lib/setup";
import type { CheckResult } from "@/lib/redeem";
import type { BusinessPageInput } from "@/lib/page";
import type { Business, OpeningHours, PortfolioPhoto, ServeMode, ServiceItem } from "@/lib/types";

export type Extras = Partial<Pick<Business, "tagline" | "about" | "hours" | "services" | "hasVideo" | "videoPosterUrl" | "address" | "slug">>;
export type SaveResult = { ok: true } | { ok: false; errors: Errors };

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function validateExtras(x: Extras): Errors {
  const e: Errors = {};
  if ((x.tagline ?? "").length > LIMITS.tagline) e.tagline = `Keep it under ${LIMITS.tagline} characters.`;
  if ((x.about ?? "").length > LIMITS.about) e.about = `Keep it under ${LIMITS.about} characters.`;
  if (x.services) {
    if (x.services.length > LIMITS.services) e.services = `Up to ${LIMITS.services} services.`;
    x.services.forEach((s, i) => {
      if (!s.name.trim()) e[`service-${i}`] = "Name this service, or remove it.";
      if (s.price !== null && (!Number.isInteger(s.price) || s.price < 0)) e[`service-${i}`] = "Enter the price in naira, or leave it empty.";
    });
  }
  if ((x.address ?? "").length > 120) e.address = "Keep the address under 120 characters.";
  if (x.hours) {
    for (const [k, d] of Object.entries(x.hours as OpeningHours)) {
      if (d.open && (!TIME.test(d.from) || !TIME.test(d.to) || d.from >= d.to)) e[`hours-${k}`] = "Closing time must be after opening time.";
    }
  }
  return e;
}

/** Saves card setup and Settings edits. Sends only the fields that changed; the rest stay. */
export async function saveCard(input: Partial<CardDraft> & Extras): Promise<SaveResult> {
  const user = await getOwnerUser();
  if (!user || user.role !== "owner") return { ok: false, errors: { form: "Only the business owner can change the card." } };
  const current = await getBusiness(user);

  const merged = { ...(current ?? { actions: [], background: { type: "color" } }), ...input } as CardDraft & Extras;
  const card = validateCard(merged);
  const extraErrors = validateExtras(merged);
  const errors: Errors = { ...(card.ok ? {} : card.errors), ...extraErrors };

  if (card.ok && (await takenPrefixes(user)).has(card.card.codePrefix)) {
    errors.codePrefix = `${card.card.codePrefix} is taken by another business.`;
  }
  // The business page address: suggested from the name on first setup, checked every time.
  const slug = (merged.slug || current?.slug || suggestSlug(merged.name ?? "")).toLowerCase();
  const slugProblem = slugError(slug) ?? ((await takenSlugs(user)).has(slug) ? `usetikka.com/${slug} is taken.` : null);
  if (slugProblem) errors.slug = slugProblem;
  if (!card.ok || Object.keys(errors).length) return { ok: false, errors };

  const defaults: Pick<Business, "id" | "verified" | "reviewCount" | "hasVideo" | "portfolio" | "foundingMember" | "guaranteeUsed"> = {
    id: `biz_${user.id}`,
    verified: false,
    reviewCount: 0,
    hasVideo: false,
    portfolio: [],
    foundingMember: false,
    guaranteeUsed: false,
  };
  const next: Business = {
    ...defaults,
    ...current,
    ...merged,
    ...card.card,
    tagline: merged.tagline?.trim() || undefined,
    about: merged.about?.trim() || undefined,
    // Keep every field "Your page" adds (photo, description, group…); only tidy the name.
    services: (merged.services ?? current?.services ?? []).map((s) => ({ ...s, name: s.name.trim() })),
    address: merged.address?.trim() || undefined,
    slug,
  };
  await saveBusiness(user, next);
  revalidatePath("/app", "layout");
  return { ok: true };
}

export async function checkSlug(slug: string, city: string): Promise<{ available: boolean; problem?: string; alternatives: string[] }> {
  const user = await getOwnerUser();
  if (!user) return { available: false, alternatives: [] };
  const taken = await takenSlugs(user);
  const problem = slugError(slug) ?? (taken.has(slug) ? `usetikka.com/${slug} is taken.` : null);
  return { available: !problem, problem: problem ?? undefined, alternatives: problem ? slugAlternatives(slug, city, taken) : [] };
}

/* -------------------------------------------------------------- portfolio */

/** One photo per call (each well under the request limit), like a Storage upload. */
export async function addPhoto(photo: Omit<PortfolioPhoto, "id">): Promise<{ ok: true; portfolio: PortfolioPhoto[] } | { ok: false; error: string }> {
  const user = await getOwnerUser();
  if (!user || user.role !== "owner") return { ok: false, error: "Only the business owner can change the page." };
  const portfolio = await addPortfolioPhoto(user, { ...photo, caption: photo.caption?.slice(0, 80) });
  if (!portfolio) return { ok: false, error: `Up to ${PORTFOLIO_MAX} photos.` };
  revalidatePath("/app", "layout");
  return { ok: true, portfolio };
}

/** Remove, reorder or caption photos (ids must already exist). */
export async function savePortfolio(next: { id: string; caption?: string }[]): Promise<PortfolioPhoto[]> {
  const user = await getOwnerUser();
  if (!user || user.role !== "owner") return [];
  const b = await getBusiness(user);
  if (!b) return [];
  const byId = new Map(b.portfolio.map((p) => [p.id, p]));
  const portfolio = next.flatMap((n) => {
    const p = byId.get(n.id);
    return p ? [{ ...p, caption: n.caption?.trim().slice(0, 80) || undefined }] : [];
  });
  await updatePortfolio(user, portfolio);
  revalidatePath("/app", "layout");
  return portfolio;
}

export async function checkPrefix(prefix: string, name: string): Promise<{ available: boolean; alternatives: string[] }> {
  const user = await getOwnerUser();
  if (!user) return { available: false, alternatives: [] };
  const taken = await takenPrefixes(user);
  const p = prefix.toUpperCase();
  return { available: /^[A-Z]{2}$/.test(p) && !taken.has(p), alternatives: prefixAlternatives(name || p, taken) };
}

/* ------------------------------------------------------------------ drops */

export type DropResult = { ok: true; id: string } | { ok: false; errors: Errors };

/** Saves the builder's draft at each step; nothing is validated until publish. */
export async function saveDrop(draft: DropDraft): Promise<DropResult> {
  const user = await getOwnerUser();
  if (!user || user.role !== "owner") return { ok: false, errors: { form: "Only the business owner can create drops." } };
  if (!(await getBusiness(user))) return { ok: false, errors: { form: "Set up your card before creating a drop." } };
  const id = await saveDropDraft(user, withThankYouFilled(draft));
  return { ok: true, id };
}

export type PublishResult =
  | { ok: true; id: string; published: true }
  | { ok: true; id: string; published: false; paymentId: string }
  | { ok: false; errors: Errors };

/**
 * publish_drop. Re-checks everything and prices the drop on the server (rule 11); the browser's
 * checks and price are only a preview. Covered (first drop, season pack, earned, gifted) →
 * publish now. Paid → a pending payment; the drop stays a draft until the payment completes.
 */
export async function publishDrop(draft: DropDraft): Promise<PublishResult> {
  const user = await getOwnerUser();
  if (!user || user.role !== "owner") return { ok: false, errors: { form: "Only the business owner can publish drops." } };
  const business = await getBusiness(user);
  if (!business) return { ok: false, errors: { form: "Set up your card before creating a drop." } };
  const now = new Date();
  const checked = withThankYouFilled(draft);
  const errors = validateDraft(checked, now);
  if (Object.keys(errors).length) return { ok: false, errors };
  // Warnings still showing are recorded; the guarantee reads them (PRD B5).
  // Only a real template for this business's category counts as "from a template".
  const templates = await getDropTemplates(templateCategory(business.category));
  const templateId = templates.some((t) => t.id === checked.templateId) ? checked.templateId : undefined;
  const filled = { ...checked, templateId, ignoredWarnings: dropCheck(checked).map((w) => w.id) };

  const problem = await publishProblem(user, filled, now);
  if (problem) return { ok: false, errors: { form: problem } };
  const quote = await quoteForBusiness(user, filled.total);
  if (quote.kind === "contact") return { ok: false, errors: { total: `For drops over ${quote.maxSelfServe.toLocaleString("en-NG")} Tikkas, talk to us.` } };
  if (quote.kind === "voucher") {
    const id = await publishWithVoucher(user, filled, quote.voucher, now);
    revalidatePath("/app", "layout");
    return { ok: true, id, published: true };
  }
  const { dropId, payment } = await startDropPayment(user, filled, quote.tier, quote.amountKobo);
  revalidatePath("/app/drops");
  return { ok: true, id: dropId, published: false, paymentId: payment.id };
}

/**
 * DEMO ONLY: stands in for Paystack's webhook (charge.success) until M7. It passes the payment's own
 * amount to complete_drop_payment, exactly as the verified webhook will.
 */
export async function completeTestPayment(paymentId: string): Promise<{ ok: boolean; next?: string; error?: string }> {
  const user = await getOwnerUser();
  if (!user) return { ok: false, error: "Only the business owner can pay for drops." };
  const payment = await getPayment(user, paymentId);
  if (!payment) return { ok: false, error: "We couldn't find that payment." };
  const result = await completeOwnerPayment(user, payment.reference, payment.amountKobo, new Date());
  if (result.effect === "failed") return { ok: false, error: "The amount didn't match, so nothing was published." };
  revalidatePath("/app", "layout");
  return { ok: true, next: afterPayment(payment) };
}

/** Where the owner lands once a payment is paid. */
function afterPayment(p: Payment): string {
  return paymentPlace(p).done;
}

/** buy_pack: opens a pending payment and sends the owner to pay it. */
export async function buyPackAction(packId: string): Promise<{ ok: true; paymentId: string } | { ok: false; error: string }> {
  const user = await getOwnerUser();
  if (!user) return { ok: false, error: "Only the business owner can buy season packs." };
  const r = await buyPack(user, packId);
  if (!r.ok) return r;
  revalidatePath("/app/settings/payments");
  return { ok: true, paymentId: r.payment.id };
}

export async function dismissGuaranteeAction(): Promise<void> {
  const user = await getOwnerUser();
  if (!user) return;
  await dismissGuaranteeNotice(user);
  revalidatePath("/app", "layout");
}

/* ------------------------------------------------------------ your page */

export type PageSaveResult = { ok: true } | { ok: false; errors: Record<string, string | undefined> };

export async function savePageAction(input: BusinessPageInput & { serveMode?: ServeMode }): Promise<PageSaveResult> {
  const user = await getOwnerUser();
  if (!user) return { ok: false, errors: { form: "Only the owner can edit the page." } };
  const r = await savePage(user, input);
  if (!r.ok) return r;
  revalidatePath(`/${r.business.slug}`);
  revalidatePath("/app", "layout");
  return { ok: true };
}

export async function saveServicesAction(services: ServiceItem[]): Promise<PageSaveResult> {
  const user = await getOwnerUser();
  if (!user) return { ok: false, errors: { form: "Only the owner can edit services." } };
  const r = await saveServices(user, services);
  if (!r.ok) return r;
  revalidatePath("/app", "layout");
  return { ok: true };
}

export async function addVideoAction(v: { url: string; thumbUrl: string; seconds: number }): Promise<{ ok: true; portfolio: PortfolioPhoto[] } | { ok: false; error: string }> {
  const user = await getOwnerUser();
  if (!user) return { ok: false, error: "Only the owner can add videos." };
  const r = await addPortfolioVideo(user, v);
  if (r.ok) revalidatePath("/app", "layout");
  return r;
}

/* ------------------------------------------------------------ posters */

export async function addPosterAction(_prev: { error?: string } | undefined, form: FormData): Promise<{ error?: string }> {
  const user = await getOwnerUser();
  if (!user) return { error: "Only the owner can add posters." };
  const r = await addPoster(user, String(form.get("label") ?? ""));
  if (!r.ok) return { error: r.error };
  revalidatePath("/app/posters");
  return {};
}

export async function savePosterHookAction(posterId: string, _prev: { error?: string; saved?: boolean } | undefined, form: FormData): Promise<{ error?: string; saved?: boolean }> {
  const user = await getOwnerUser();
  if (!user) return { error: "Only the owner can change posters." };
  const error = await savePosterHook(user, posterId, String(form.get("hook") ?? ""));
  if (error) return { error };
  revalidatePath("/app/posters");
  return { saved: true };
}

/** Settings › Account: where Tikka's alerts and the daily summary go, and whether to send it. */
export async function saveOwnerAlertsAction(_prev: { error?: string; saved?: boolean } | undefined, form: FormData): Promise<{ error?: string; saved?: boolean }> {
  const user = await getOwnerUser();
  if (!user) return { error: "Only the owner can change this." };
  const raw = String(form.get("ownerWhatsapp") ?? "").trim();
  const number = raw ? normalizeNgPhone(raw) : "";
  if (raw && !number) return { error: "Enter a Nigerian WhatsApp number, like 0803 123 4567." };
  if (!(await saveOwnerAlerts(user, number ?? "", form.get("dailySummary") === "on"))) return { error: "Set up your card first." };
  revalidatePath("/app/settings/account");
  return { saved: true };
}

/* --------------------------------------------------------------- admin */

/** DEMO: is_admin comes from the profile in M1; here the demo owner is the admin. */
async function getAdmin() {
  const user = await getOwnerUser();
  return user && user.role === "owner" && user.isAdmin ? user : null;
}

export async function adminSetFoundingAction(ownerId: string, founding: boolean): Promise<void> {
  if (!(await getAdmin())) return;
  await adminSetFounding(ownerId, founding);
  revalidatePath("/admin");
}

/** Grant a free drop: a size, and an optional last day to use it (WAT). Never expires without one. */
export async function adminGrantDropAction(ownerId: string, form: FormData): Promise<void> {
  if (!(await getAdmin())) return;
  const tierId = String(form.get("tier") ?? "");
  const expiresOn = String(form.get("expiresOn") ?? "");
  await adminGrantDrop(ownerId, tierId, /^\d{4}-\d{2}-\d{2}$/.test(expiresOn) ? watToIso(`${expiresOn}T23:59`) : undefined);
  revalidatePath("/admin");
}

const naira = (form: FormData, key: string) => Number(String(form.get(key) ?? "").replace(/[^\d.]/g, ""));

export async function adminSaveTierAction(id: string, form: FormData): Promise<void> {
  if (!(await getAdmin())) return;
  const price = naira(form, "price");
  const founding = naira(form, "founding");
  const min = Math.floor(Number(form.get("guaranteeMin") ?? 0));
  if (![price, founding].every((n) => Number.isFinite(n) && n > 0)) return;
  await adminSaveTier(id, { priceKobo: Math.round(price * 100), foundingPriceKobo: Math.round(founding * 100), guaranteeMinRedemptions: min > 0 ? min : null });
  revalidatePath("/admin");
}

export async function adminSavePackAction(id: string, form: FormData): Promise<void> {
  if (!(await getAdmin())) return;
  const price = naira(form, "price");
  if (!Number.isFinite(price) || price <= 0) return;
  await adminSavePack(id, Math.round(price * 100), form.get("active") === "on");
  revalidatePath("/admin");
}

/* ------------------------------------------------------------ Paystack */

/** Starts Paystack checkout for a pending payment. The amount comes from the payment row, never the browser. */
export async function startPaystack(paymentId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const user = await getOwnerUser();
  if (!user) return { ok: false, error: "Only the business owner can pay for drops." };
  const payment = await getPayment(user, paymentId);
  if (!payment || payment.status !== "pending") return { ok: false, error: "This payment isn't waiting any more. Start again." };
  try {
    const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    const { authorizationUrl } = await initializeTransaction({
      email: user.email,
      amountKobo: payment.amountKobo,
      reference: payment.reference,
      callbackUrl: `${site}/app/pay/confirm?payment=${payment.id}`,
      metadata: { payment_id: payment.id, business_id: payment.businessId },
    });
    return { ok: true, url: authorizationUrl };
  } catch {
    return { ok: false, error: "Paystack didn't respond. Nothing was charged. Try again in a moment." };
  }
}

export type PaymentPoll = { status: "pending" | "paid" | "failed" | "abandoned"; next?: string };

/** The confirm page polls this; after 10 s it asks for the verify fallback. */
export async function pollPayment(paymentId: string, verify: boolean): Promise<PaymentPoll | null> {
  const user = await getOwnerUser();
  if (!user) return null;
  let payment = await getPayment(user, paymentId);
  if (!payment) return null;
  if (payment.status === "pending" && verify && paystackConfigured()) {
    try {
      const v = await verifyTransaction(payment.reference);
      if (v.status === "success") await completeOwnerPayment(user, payment.reference, v.amountKobo, new Date());
    } catch {}
    payment = await getPayment(user, paymentId);
    if (!payment) return null;
  }
  if (payment.status === "paid") revalidatePath("/app", "layout");
  return { status: payment.status, next: payment.status === "paid" ? afterPayment(payment) : undefined };
}

/* --------------------------------------------------------- add Tikkas */

export async function addTikkasAction(dropId: string, extra: number): Promise<AddTikkasResult> {
  const user = await getOwnerUser();
  if (!user) return { ok: false, error: "Only the owner can add Tikkas." };
  const r = await addTikkas(user, dropId, extra);
  if (r.ok) revalidatePath("/app", "layout");
  return r;
}

export async function deleteDraft(id: string): Promise<void> {
  const user = await getOwnerUser();
  if (!user || user.role !== "owner") return;
  await deleteDropDraft(user, id);
  revalidatePath("/app/drops");
}

/* ------------------------------------------------------------- redeem */

/** check_code: never uses the code (rule 5). Owners and staff. */
export async function checkCodeAction(code: string): Promise<CheckResult | { kind: "no_access" }> {
  const user = await getSessionUser();
  if (!user) return { kind: "no_access" };
  return checkCode(user, code);
}

export type ConfirmActionResult = { ok: true; name: string } | { ok: false; result: CheckResult | { kind: "needs_action" | "no_access"; code?: string } };

export async function confirmRedemptionAction(
  code: string,
  billNaira: number | null,
  actionConfirmed: boolean,
  customerStatus?: "new" | "returning",
): Promise<ConfirmActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, result: { kind: "no_access" } };
  const r = await confirmRedemption(user, code, {
    billKobo: billNaira && billNaira > 0 ? Math.round(billNaira * 100) : undefined,
    actionConfirmed,
    customerStatus: customerStatus === "returning" ? "returning" : customerStatus === "new" ? "new" : undefined,
  });
  if (!r.ok) return { ok: false, result: r.result };
  revalidatePath("/app", "layout");
  return { ok: true, name: r.name };
}

/* --------------------------------------------------------------- team */

export type InviteState = { ok?: boolean; link?: string; email?: string; error?: string } | undefined;

export async function inviteStaffAction(_prev: InviteState, form: FormData): Promise<InviteState> {
  const user = await getOwnerUser();
  if (!user) return { error: "Only the owner can invite staff." };
  const r = await inviteStaff(user, String(form.get("email") ?? ""));
  if (!r.ok) return { error: r.error };
  revalidatePath("/app/settings/team");
  // DEMO: the invite email goes out with Supabase in M1; until then the owner shares the link.
  return { ok: true, email: r.invite.email, link: `/invite/${r.invite.token}` };
}

export async function cancelInviteAction(form: FormData): Promise<void> {
  const user = await getOwnerUser();
  if (!user) return;
  await cancelInvite(user, String(form.get("token") ?? ""));
  revalidatePath("/app/settings/team");
}

export async function removeStaffAction(form: FormData): Promise<void> {
  const user = await getOwnerUser();
  if (!user) return;
  await removeStaff(user, String(form.get("userId") ?? ""));
  revalidatePath("/app/settings/team");
}

/* ------------------------------------------------------------ reviews */

export async function reportReviewAction(id: string, reason: string): Promise<{ ok: boolean }> {
  const user = await getOwnerUser();
  if (!user) return { ok: false };
  const ok = await reportReview(user, id, reason.trim().slice(0, 200) || "No reason given");
  if (ok) revalidatePath("/app/reviews");
  return { ok };
}

/* ----------------------------------------------------- extend / end */

export async function extendDropAction(dropId: string, endsAtWat: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getOwnerUser();
  if (!user) return { ok: false, error: "Only the owner can change a drop." };
  const r = await extendDrop(user, dropId, watToIso(endsAtWat));
  if (r.ok) revalidatePath("/app", "layout");
  return r;
}

export async function endDropEarlyAction(dropId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getOwnerUser();
  if (!user) return { ok: false, error: "Only the owner can change a drop." };
  const r = await endDropEarly(user, dropId);
  if (r.ok) revalidatePath("/app", "layout");
  return r;
}
