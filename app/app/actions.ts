"use server";

import { revalidatePath, updateTag } from "next/cache";
import { PRICES_TAG } from "@/lib/admin-db";
import { dbRedeemedOnPage } from "@/lib/team-db";
import { after } from "next/server";
import { VIDEO_UPLOADS } from "@/lib/features";
import { fromStored } from "@/lib/media-path";
import { PAGE_LIMITS } from "@/lib/page";
import { createUpload, streamConfigured, videoState, type UploadPass } from "@/lib/stream";
import {
  BusinessSaveError,
  confirmRedemptionDb,
  completeDbPayment,
  DropSaveError,
  isDbId,
  publishInDb,
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
  adminDecide,
  adminPinDrop,
  adminSetBusiness,
  adminSetDropShown,
  adminForgetPerson,
  adminPersonLookup,
  buyPack,
  checkCode,
  checkWhatsappDigits,
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
import { processQueue } from "@/lib/whatsapp/send";
import { LIMITS, normalizeNgPhone, prefixAlternatives, validateCard, type CardDraft, type Errors } from "@/lib/setup";
import type { CheckResult, DigitsResult } from "@/lib/redeem";
import type { BusinessPageInput } from "@/lib/page";
import type { Business, OpeningHours, PortfolioPhoto, ServeMode, ServiceItem } from "@/lib/types";
import { requestPhone } from "@/lib/privacy";
import type { PersonRecord } from "@/lib/data";
import { dbAdminSetEnquiryStatus } from "@/lib/studio-db";

export type Extras = Partial<Pick<Business, "tagline" | "about" | "hours" | "services" | "hasVideo" | "videoUrl" | "videoPosterUrl" | "address" | "slug">>;
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
  const card = validateCard(merged, current?.name);
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
  try {
    await saveBusiness(user, next);
  } catch (e) {
    if (e instanceof BusinessSaveError) return { ok: false, errors: { [e.field ?? "form"]: e.message } };
    throw e;
  }
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
  let portfolio: PortfolioPhoto[] | null;
  try {
    portfolio = await addPortfolioPhoto(user, { ...photo, caption: photo.caption?.slice(0, 80) });
  } catch (e) {
    if (e instanceof BusinessSaveError) return { ok: false, error: e.message };
    throw e;
  }
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
  const saved = await updatePortfolio(user, portfolio);
  revalidatePath("/app", "layout");
  return saved;
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
  try {
    return { ok: true, id: await saveDropDraft(user, withThankYouFilled(draft)) };
  } catch (e) {
    if (e instanceof DropSaveError) return { ok: false, errors: { form: e.message } };
    throw e;
  }
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
  // Real accounts: the database prices it again and publishes or opens the payment (rule 11).
  if (isDbId(user.id)) {
    try {
      const r = await publishInDb(filled);
      revalidatePath("/app", "layout");
      if (r.kind === "published") return { ok: true, id: r.id, published: true };
      if (r.kind === "payment") return { ok: true, id: r.id, published: false, paymentId: r.paymentId };
      if (r.kind === "contact") return { ok: false, errors: { total: `For drops over ${r.max.toLocaleString("en-NG")} Tikkas, talk to us.` } };
      return { ok: false, errors: { form: PUBLISH_PROBLEMS[r.problem] ?? "We couldn't publish this drop. Check it and try again." } };
    } catch (e) {
      if (e instanceof DropSaveError) return { ok: false, errors: { form: e.message } };
      throw e;
    }
  }
  if (quote.kind === "voucher") {
    const id = await publishWithVoucher(user, filled, quote.voucher, now);
    revalidatePath("/app", "layout");
    return { ok: true, id, published: true };
  }
  const { dropId, payment } = await startDropPayment(user, filled, quote.tier, quote.amountKobo);
  revalidatePath("/app/drops");
  return { ok: true, id: dropId, published: false, paymentId: payment.id };
}

/** What publish_drop() says when it refuses, for the rare case the checks above didn't catch it first (a second tab). */
const PUBLISH_PROBLEMS: Record<string, string> = {
  rewards_dont_add_up: "Your Tikkas don't add up to the total. Check the numbers for each tier.",
  already_published: "This drop is already published.",
  live_exists: "You already have a live drop. Schedule this one to start after it ends, or end the live one first.",
  overlaps_live: "Your live drop is still running then. Start this one on or after its last day.",
  scheduled_exists: "You already have a drop scheduled. Publish this one after that drop starts.",
  ended: "This drop's end date has passed. Pick new dates.",
  too_long: "A drop can run for up to 30 days.",
};

/**
 * DEMO ONLY: stands in for Paystack's webhook (charge.success) until M7. It passes the payment's own
 * amount to complete_drop_payment, exactly as the verified webhook will.
 */
export async function completeTestPayment(paymentId: string): Promise<{ ok: boolean; next?: string; error?: string }> {
  const user = await getOwnerUser();
  if (!user) return { ok: false, error: "Only the business owner can pay for drops." };
  const payment = await getPayment(user, paymentId);
  if (!payment) return { ok: false, error: "We couldn't find that payment." };
  if (isDbId(user.id)) {
    // DEMO ONLY, development only: what the verified Paystack webhook will call, with the payment's own amount.
    if (process.env.NODE_ENV === "production") return { ok: false, error: "Test payments are off." };
    const r = await completeDbPayment(payment.reference, payment.amountKobo);
    if (r.failed) return { ok: false, error: "The amount didn't match, so nothing was published." };
    revalidatePath("/app", "layout");
    return { ok: true, next: afterPayment(payment) };
  }
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

/* ------------------------------------------------------------ videos on Bunny Stream */

export type VideoUploadStart =
  | { ok: true; pass: UploadPass }
  /** Bunny isn't set up here (or the demo business): upload to Storage as before. */
  | { ok: false; fallback: true }
  | { ok: false; fallback?: false; error: string };

/**
 * A one-time pass to upload one video straight to Bunny Stream. The browser checked the length and
 * size already; the server checks again before Bunny hears of it.
 */
export async function startVideoUploadAction(v: { kind: "card" | "portfolio"; seconds: number; bytes: number }): Promise<VideoUploadStart> {
  const user = await getOwnerUser();
  if (!user) return { ok: false, error: "Only the owner can add videos." };
  if (!VIDEO_UPLOADS) return { ok: false, error: "Videos are switched off for now." };
  if (!isDbId(user.id) || !streamConfigured()) return { ok: false, fallback: true };
  const [maxSeconds, maxBytes] = v.kind === "card" ? [LIMITS.videoSeconds, LIMITS.videoBytes] : [PAGE_LIMITS.videoSeconds, PAGE_LIMITS.videoMb * 1024 * 1024];
  if (!(v.seconds > 0) || v.seconds > maxSeconds + 0.5) return { ok: false, error: `Keep it to ${maxSeconds} seconds.` };
  if (!(v.bytes > 0) || v.bytes > maxBytes) return { ok: false, error: `Keep it under ${Math.round(maxBytes / 1024 / 1024)} MB.` };
  try {
    return { ok: true, pass: await createUpload(user.id, `${v.kind} ${new Date().toISOString().slice(0, 10)}`) };
  } catch {
    return { ok: false, error: "We couldn't start that upload. Try again in a minute." };
  }
}

/** Is the video ready to play yet? Its address when it is. Only your own videos. */
export async function videoUploadStateAction(guid: string): Promise<{ state: "processing" } | { state: "ready"; url: string } | { state: "failed" }> {
  const user = await getOwnerUser();
  if (!user) return { state: "failed" };
  const s = await videoState(user.id, guid);
  if (!s || s.kind === "failed") return { state: "failed" };
  if (s.kind === "processing") return { state: "processing" };
  const url = fromStored(s.path);
  return url ? { state: "ready", url } : { state: "failed" };
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

/** is_admin from the profile (the demo owner is the demo store's admin). The database checks again. */
async function getAdmin() {
  const user = await getOwnerUser();
  return user && user.role === "owner" && user.isAdmin ? user : null;
}

/** Verified badge, suspend, founding member. */
export async function adminSetBusinessAction(id: string, patch: { verified?: boolean; suspended?: boolean; foundingMember?: boolean }): Promise<void> {
  const admin = await getAdmin();
  if (!admin) return;
  await adminSetBusiness(admin, id, patch);
  revalidatePath("/admin");
}

/** Grant a free drop: a size, and an optional last day to use it (WAT). Never expires without one. */
export async function adminGrantDropAction(id: string, form: FormData): Promise<void> {
  const admin = await getAdmin();
  if (!admin) return;
  const tierId = String(form.get("tier") ?? "");
  const expiresOn = String(form.get("expiresOn") ?? "");
  await adminGrantDrop(admin, id, tierId, /^\d{4}-\d{2}-\d{2}$/.test(expiresOn) ? watToIso(`${expiresOn}T23:59`) : undefined);
  revalidatePath("/admin");
}

const naira = (form: FormData, key: string) => Number(String(form.get(key) ?? "").replace(/[^\d.]/g, ""));

export async function adminSaveTierAction(id: string, form: FormData): Promise<void> {
  const admin = await getAdmin();
  if (!admin) return;
  const price = naira(form, "price");
  const founding = naira(form, "founding");
  const min = Math.floor(Number(form.get("guaranteeMin") ?? 0));
  if (![price, founding].every((n) => Number.isFinite(n) && n > 0)) return;
  await adminSaveTier(admin, id, { priceKobo: Math.round(price * 100), foundingPriceKobo: Math.round(founding * 100), guaranteeMinRedemptions: min > 0 ? min : null });
  updateTag(PRICES_TAG);
  revalidatePath("/admin");
}

export async function adminSavePackAction(id: string, form: FormData): Promise<void> {
  const admin = await getAdmin();
  if (!admin) return;
  const price = naira(form, "price");
  if (!Number.isFinite(price) || price <= 0) return;
  await adminSavePack(admin, id, Math.round(price * 100), form.get("active") === "on");
  updateTag(PRICES_TAG);
  revalidatePath("/admin");
}

/** The moderation queue: hide or keep. */
export async function adminDecideAction(targetType: "drop" | "review", id: string, hide: boolean): Promise<void> {
  const admin = await getAdmin();
  if (!admin) return;
  await adminDecide(admin, targetType, id, hide);
  revalidatePath("/admin");
}

export async function adminSetDropShownAction(id: string, shown: boolean): Promise<void> {
  const admin = await getAdmin();
  if (!admin) return;
  await adminSetDropShown(admin, id, shown);
  revalidatePath("/admin");
  revalidatePath("/drops");
}

/** Pin to the featured carousel (an empty headline unpins). */
export async function adminPinDropAction(id: string, form: FormData): Promise<void> {
  const admin = await getAdmin();
  if (!admin) return;
  await adminPinDrop(admin, id, String(form.get("headline") ?? "").slice(0, 60), String(form.get("blurb") ?? "").slice(0, 140));
  revalidatePath("/admin");
  revalidatePath("/drops");
}

/* ------------------------------------------------- Studio enquiries */

/** An admin moves a Tikka Studio enquiry along: new → contacted → converted or closed. */
export async function adminEnquiryStatusAction(id: string, form: FormData): Promise<void> {
  const admin = await getAdmin();
  if (!admin || !isDbId(admin.id)) return;
  const status = String(form.get("status") ?? "");
  if (status !== "new" && status !== "contacted" && status !== "converted" && status !== "closed") return;
  await dbAdminSetEnquiryStatus(id, status);
  revalidatePath("/admin");
}

/* ------------------------------------------------- privacy requests */

export type PersonLookupState =
  | { step: "idle" }
  | { step: "error"; error: string; input?: string }
  | { step: "found"; phone: string; record: PersonRecord }
  | { step: "deleted"; phoneHint: string; counts: Record<string, number> };

/** Privacy requests (admin): what Tikka holds for a number. Posted, so the number never sits in an address. */
export async function adminLookupPersonAction(_prev: PersonLookupState, form: FormData): Promise<PersonLookupState> {
  const admin = await getAdmin();
  if (!admin) return { step: "error", error: "Admins only." };
  const input = String(form.get("phone") ?? "");
  const phone = requestPhone(input);
  if (!phone) return { step: "error", error: "Type the WhatsApp number, like 0803 123 4567 or +44 7700 900123.", input };
  const record = await adminPersonLookup(admin, phone);
  if (!record) return { step: "error", error: "Privacy requests work on real accounts, not the demo.", input };
  revalidatePath("/admin");
  return { step: "found", phone, record };
}

/** Deletes everything held for a number, once the admin ticks that the person asked. */
export async function adminForgetPersonAction(_prev: PersonLookupState, form: FormData): Promise<PersonLookupState> {
  const admin = await getAdmin();
  if (!admin) return { step: "error", error: "Admins only." };
  const phone = requestPhone(String(form.get("phone") ?? ""));
  if (!phone) return { step: "error", error: "That number doesn't look right." };
  if (form.get("asked") !== "on") return { step: "error", error: "Tick that the person asked for this first." };
  const counts = await adminForgetPerson(admin, phone);
  if (!counts) return { step: "error", error: "Privacy requests work on real accounts, not the demo." };
  revalidatePath("/admin");
  return { step: "deleted", phoneHint: `${phone.slice(0, 4)}•••${phone.slice(-4)}`, counts };
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
      if (v.status === "success") {
        if (isDbId(user.id)) await completeDbPayment(payment.reference, v.amountKobo);
        else await completeOwnerPayment(user, payment.reference, v.amountKobo, new Date());
      }
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

/** The WhatsApp check at the counter: the last 4 digits staff read off the customer's WhatsApp. Never uses the Tikka. */
export async function checkDigitsAction(code: string, digits: string): Promise<CheckResult | DigitsResult | { kind: "no_access" }> {
  const user = await getSessionUser();
  if (!user) return { kind: "no_access" };
  return checkWhatsappDigits(user, code, digits.replace(/\D/g, "").slice(0, 4));
}

/** `askReview`: a page claim, so Tikka can't send the WhatsApp thank-you; staff ask at the counter. */
export type ConfirmActionResult =
  | { ok: true; name: string; askReview?: boolean }
  | { ok: false; result: CheckResult | { kind: "needs_action" | "needs_whatsapp_check" | "no_access"; code?: string } };

export async function confirmRedemptionAction(
  code: string,
  billNaira: number | null,
  actionConfirmed: boolean,
  customerStatus?: "new" | "returning",
): Promise<ConfirmActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, result: { kind: "no_access" } };
  const input = {
    billKobo: billNaira && billNaira > 0 ? Math.round(billNaira * 100) : undefined,
    actionConfirmed,
    customerStatus: customerStatus === "returning" ? "returning" : customerStatus === "new" ? "new" : undefined,
  } as const;
  if (isDbId(user.id)) {
    const r = await confirmRedemptionDb(user, code, input);
    if (!r.ok) return { ok: false, result: r.result };
    // The thank-you (with the next-visit Tikka and the review link) leaves right away.
    after(() => processQueue(10).catch(() => {}));
    revalidatePath("/app", "layout");
    return { ok: true, name: r.name, askReview: await dbRedeemedOnPage(code).catch(() => false) };
  }
  const r = await confirmRedemption(user, code, input);
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
