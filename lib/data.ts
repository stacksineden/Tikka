import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { connection } from "next/server";
import { dbLeads, dbLogFollowup, dbNewClaims } from "./leads-db";
import { dbAdminBusinesses, dbAdminDecide, dbAdminForgetPerson, dbAdminPersonLookup, dbAdminPrivacyLog, type PersonRecord, type PrivacyLogEntry, dbAdminDrops, dbAdminGrantDrop, dbAdminOverview, dbAdminPayments, dbAdminPinDrop, dbAdminReports, dbAdminSaveTier, dbAdminSavePack, dbAdminSetBusiness, dbAdminSetDropShown, dbPacks, dbPins, dbTiers, type AdminBusiness, type AdminDrop, type AdminOverview, type AdminPayment, type AdminReport } from "./admin-db";
import { dbMarketplaceDrops, dbNotifyIntent, dbReportDrop } from "./market-db";
import { dbOwnerReviews, dbPublicReviews, dbReportReview, dbReviewPage, dbSubmitReview } from "./reviews-db";
import { dbDropDashboard, dbDropFeed, dbDropReport } from "./stats-db";
import { dbAcceptInvite, dbCancelInvite, dbCheckCode, dbConfirm, dbInviteInfo, dbInviteStaff, dbRemoveStaff, dbTeam, type ConfirmDbResult } from "./team-db";
import { dbCardByViewToken, dbCardImage, dbCardOwner, dbDropExists, dbPlatformTotals, dbPublicDrop, dbRecordEvent, dbRevealCard, dbSetVisitPlan } from "./claim-db";
import { dbAddTikkas, dbBuyPack, dbCompletePayment, dbDeleteDraft, dbDrops, dbEndEarly, dbExtend, dbPayment, dbPayments, dbPublish, dbSaveDraft, dbVouchers, DropSaveError, type DbPublishResult } from "./drop-db";
import { BusinessSaveError, dbAddPoster, dbPageDrops, dbPosterByCode, dbPosters, dbSavePosterHook, dbTaken, isDbId, loadBusiness, loadBusinessBySlug, saveBusinessDb } from "./business-db";

// Dummy data until Supabase is wired up (M1). Every function here becomes an RPC/view call;
// keep the signatures so the pages don't change.
import activity from "./mock/activity.json";
import business from "./mock/business.json";
import drops from "./mock/drops.json";
import leads from "./mock/leads.json";
import marketSeeds from "./mock/market_seeds.json";
import marketPins from "./mock/market_pins.json";
import reviews from "./mock/reviews.json";
import seedClaims from "./mock/claims.json";
import dropTiers from "./mock/drop_tiers.json";
import { actionInstruction, cardAt, dealtCounts, firstName, serialLabel, toPublicDrop } from "./claim";
import { funnel, groupViews, suggestNextSize, type FunnelStep } from "./dashboard";
import { clockTime, place, shortDate } from "./format";
import type { CardArt } from "./og-art";
import { siteUrl } from "./supabase/env";
import { notifyCode } from "./notify";
import dropStats from "./mock/drop_stats.json";
import { generate as generateCode } from "./codes";
import { followupMessage, followups as followupList, type Followup } from "./followups";
import { waLink } from "./leads";
import { pageDropsFrom, pageDropsFromDrops, validatePage, validateServices, videoProblem, type BusinessPageInput, type PageDrop, type PageErrors } from "./page";
import { newPosterCode, posterTarget, validateHook, validateLabel, type Poster } from "./posters";
import { dropReport, type DropFee, type DropReport, type ReportClaim } from "./report";
import { seasonalNudge } from "./nudges";
import { dailySummaryText, summaryCounts, worthSending, type SummaryClaim } from "./summary";
import { claimExpiry, isPlannable, reminderDue, reminderText, VISIT_PARTS, visitOptions, type VisitPart } from "./visit";
import { SITE } from "./qr";
import {
  addRating,
  bounceBackFor,
  checkClaim,
  confirmClaim,
  displayName,
  REVIEW_WINDOW_DAYS,
  reviewState,
  validateReview,
  type CheckResult,
  type ClaimRecord,
  type ConfirmResult,
} from "./redeem";
import { bounceBackLabel, DEFAULT_BOUNCE_BACK, LIMITS, publishWindowProblem, rewardLabel, watToIso, type DraftReward, type DropDraft } from "./drop";
import { appendCounts } from "./deck";
import { evaluateGuarantee, guaranteeMessage, type GuaranteeClaim } from "./guarantee";
import dropPacks from "./mock/drop_packs.json";
import dropTemplates from "./mock/drop_templates.json";
import type { DropTemplate, TemplateCategory } from "./templates";
import vouchers from "./mock/vouchers.json";
import { abandonStale, assertCanReadLeads, completePayment, newReference, type Payment } from "./payments";
import { quoteAddTikkas, quoteDrop, type DropPack, type DropQuote, type DropTier } from "./pricing";
import { adminVoucher, guaranteeVoucher, packVouchers, signupVoucher, usable, type Voucher } from "./vouchers";
import { PORTFOLIO_MAX } from "./slug";
import { platformStats, statsFromTotals, type PlatformStats, type StatsInput } from "./stats";

/** The database calls the Thank-you tier "common". */
const TIER_FROM_DB: Record<string, Tier> = { legendary: "legendary", rare: "rare", common: "thank_you" };
import type {
  ActivityEvent,
  Business,
  CardStatus,
  ClaimedCard,
  Drop,
  EventKind,
  Lead,
  MarketDrop,
  MarketPin,
  PortfolioPhoto,
  PublicDrop,
  Review,
  ServeMode,
  ServiceItem,
  SessionUser,
  Source,
  Tier,
} from "./types";

// DEMO STORE: saved cards live in memory (on globalThis so dev reloads keep them) until
// Supabase. They reset when the dev server restarts.
const store = ((globalThis as { __tikkaDemoStore?: Map<string, Business> }).__tikkaDemoStore ??= new Map());

/** The demo account is Glow Studio; a fresh sign-up has no business until card setup. */
const DEMO_USER = "user_demo";

// DEMO: other businesses with drops, so the marketplace, business pages and claim pages have
// real content across cities. Each is "owned" by a seed account nobody signs in to.
interface Seed {
  ownerId: string;
  business: Business;
  drops: Drop[];
}
const SEEDS = marketSeeds as unknown as Seed[];

/** The mock drops an account owns (Glow Studio's, or a seeded business's). */
function mockDropsOf(ownerId: string): Drop[] {
  return ownerId === DEMO_USER ? (drops as Drop[]) : (SEEDS.find((x) => x.ownerId === ownerId)?.drops ?? []);
}
/** Every mock drop with its owner. */
function allMockDrops(): { drop: Drop; ownerId: string }[] {
  return [...(drops as Drop[]).map((drop) => ({ drop, ownerId: DEMO_USER })), ...SEEDS.flatMap((x) => x.drops.map((drop) => ({ drop, ownerId: x.ownerId })))];
}
function mockBusiness(ownerId: string): Business | null {
  return ownerId === DEMO_USER ? (business as Business) : (SEEDS.find((x) => x.ownerId === ownerId)?.business ?? null);
}

/** The mock data is frozen at this moment so relative times read sensibly. */
export const DEMO_NOW = new Date("2026-10-20T11:00:00+01:00");

/** Fills fields newer than a saved card, so older demo-store entries keep working. */
function normalize(b: Business): Business {
  return withMockMedia({ ...b, portfolio: b.portfolio ?? [], foundingMember: b.foundingMember ?? false, guaranteeUsed: b.guaranteeUsed ?? false });
}

// DEMO: mock images live in public/mock and are generated outside the app; until a file is
// there, its reference is dropped so the page falls back instead of showing a broken image.
const mediaSeen = new Map<string, boolean>();
function hasMock(url?: string): boolean {
  if (!url?.startsWith("/mock/")) return !!url;
  // Found files are remembered; missing ones are checked again, so new images show up without a restart.
  if (!mediaSeen.get(url) && existsSync(join(process.cwd(), "public", url))) mediaSeen.set(url, true);
  return mediaSeen.get(url) ?? false;
}
function withMockMedia(b: Business): Business {
  const keep = (url?: string) => (hasMock(url) ? url : undefined);
  const page = b.page && {
    ...b.page,
    heroImageUrl: keep(b.page.heroImageUrl),
    aboutImageUrl: keep(b.page.aboutImageUrl),
    team: b.page.team?.map((t) => ({ ...t, photoUrl: keep(t.photoUrl) })),
  };
  return {
    ...b,
    page,
    services: b.services.map((x) => ({ ...x, imageUrl: keep(x.imageUrl) })),
    portfolio: b.portfolio.filter((x) => hasMock(x.url)),
  };
}

export async function getBusiness(user: Pick<SessionUser, "id"> & Partial<Pick<SessionUser, "role" | "businessOwnerId">>): Promise<Business | null> {
  // Staff see the business they work for (the redeem screen's header).
  const id = user.role === "staff" ? user.businessOwnerId : user.id;
  if (!id) return null;
  // Real accounts: the database (by the owner's id, or the business's own id for public pages).
  if (isDbId(id)) {
    const db = await loadBusiness(id);
    return db ? normalize(db) : null;
  }
  const b = store.get(id) ?? mockBusiness(id);
  return b ? withRatings(id, normalize(b)) : null;
}

/**
 * Saves a business: to the database for real accounts (returning it as stored, with the
 * database's ids), else to the demo store. Throws BusinessSaveError when the database refuses.
 */
async function putBusiness(ownerId: string, next: Business): Promise<Business> {
  if (isDbId(ownerId)) return normalize(await saveBusinessDb(ownerId, next));
  store.set(ownerId, next);
  return normalize(next);
}

export { BusinessSaveError, isDbId };

/** The public business page's data (usetikka.com/[slug]). Real version: get_business_page(slug). */
export async function getBusinessBySlug(slug: string): Promise<{ business: Business; ownerId: string } | null> {
  await connection(); // DEMO: the in-memory store changes at runtime; the real page is cached briefly
  for (const [ownerId, b] of store) if (b.slug === slug) return { business: withRatings(ownerId, normalize(b)), ownerId };
  if ((business as Business).slug === slug && !store.has(DEMO_USER)) return { business: withRatings(DEMO_USER, normalize(business as Business)), ownerId: DEMO_USER };
  const seed = SEEDS.find((x) => x.business.slug === slug);
  if (seed) return { business: withRatings(seed.ownerId, normalize(seed.business)), ownerId: seed.ownerId };
  // A real business: its own id stands in for the owner's (getBusiness reads it either way).
  const db = await loadBusinessBySlug(slug);
  return db ? { business: normalize(db), ownerId: db.id } : null;
}

/** Page addresses other businesses already use. */
export async function takenSlugs(user: Pick<SessionUser, "id">): Promise<Set<string>> {
  const all = new Set<string>([(business as Business).slug, ...SEEDS.map((x) => x.business.slug)]);
  for (const [id, b] of store) if (id !== user.id) all.add(b.slug);
  if (user.id === DEMO_USER) all.delete((business as Business).slug);
  for (const slug of (await dbTaken()).slugs) all.add(slug);
  if (isDbId(user.id)) {
    const mine = (await getBusiness(user))?.slug;
    if (mine) all.delete(mine);
  }
  return all;
}

/* ------------------------------------------------------------ portfolio */

export async function addPortfolioPhoto(user: Pick<SessionUser, "id">, photo: Omit<PortfolioPhoto, "id">): Promise<PortfolioPhoto[] | null> {
  const b = await getBusiness(user);
  if (!b || b.portfolio.length >= PORTFOLIO_MAX) return null;
  const portfolio = [...b.portfolio, { ...photo, id: `ph_${Date.now().toString(36)}` }];
  return (await putBusiness(user.id, { ...b, portfolio })).portfolio;
}

/* ------------------------------------------------------- your page */

const newId = (prefix: string) => `${prefix}_${randomBytes(5).toString("hex")}`;

/** "Your page": the hero, about, optional sections and how customers use their Tikka. Owners only. */
export async function savePage(
  user: Pick<SessionUser, "id" | "role">,
  input: BusinessPageInput & { serveMode?: ServeMode },
): Promise<{ ok: true; business: Business } | { ok: false; errors: PageErrors }> {
  if (user.role !== "owner") return { ok: false, errors: { form: "Only the owner can edit the page." } };
  const b = await getBusiness(user);
  if (!b) return { ok: false, errors: { form: "Set up your card first." } };
  const { about, serveMode, ...page } = input;
  const merged: BusinessPageInput = { ...b.page, ...page, about: about ?? b.about };
  const errors = validatePage(merged);
  if (Object.keys(errors).length) return { ok: false, errors };
  const clean = (v?: string) => v?.trim() || undefined;
  const next: Business = {
    ...b,
    about: clean(merged.about),
    serveMode: serveMode ?? b.serveMode,
    page: {
      ...b.page,
      ...page,
      // "" means the photo was removed.
      heroImageUrl: page.heroImageUrl === "" ? undefined : (page.heroImageUrl ?? b.page?.heroImageUrl),
      aboutImageUrl: page.aboutImageUrl === "" ? undefined : (page.aboutImageUrl ?? b.page?.aboutImageUrl),
      headline: clean(merged.headline),
      subline: clean(merged.subline),
      textTitle: clean(merged.textTitle),
      textBody: clean(merged.textBody),
      team: merged.team?.map((t) => ({ ...t, id: t.id || newId("tm"), name: t.name.trim(), role: clean(t.role) })),
      faqs: merged.faqs?.map((f) => ({ ...f, id: f.id || newId("fq"), q: f.q.trim(), a: f.a.trim() })),
    },
  };
  try {
    return { ok: true, business: await putBusiness(user.id, next) };
  } catch (e) {
    if (e instanceof BusinessSaveError) return { ok: false, errors: { form: e.message } };
    throw e;
  }
}

export async function saveServices(user: Pick<SessionUser, "id" | "role">, services: ServiceItem[]): Promise<{ ok: true; services: ServiceItem[] } | { ok: false; errors: PageErrors }> {
  if (user.role !== "owner") return { ok: false, errors: { form: "Only the owner can edit services." } };
  const b = await getBusiness(user);
  if (!b) return { ok: false, errors: { form: "Set up your card first." } };
  const errors = validateServices(services);
  if (Object.keys(errors).length) return { ok: false, errors };
  const next = services.map((x) => ({
    ...x,
    id: x.id || newId("sv"),
    name: x.name.trim(),
    group: x.group?.trim() || undefined,
    description: x.description?.trim() || undefined,
    duration: x.duration?.trim() || undefined,
    price: x.priceKind === "ask" ? null : x.price,
  }));
  try {
    return { ok: true, services: (await putBusiness(user.id, { ...b, services: next })).services };
  } catch (e) {
    if (e instanceof BusinessSaveError) return { ok: false, errors: { form: e.message } };
    throw e;
  }
}

/** A portfolio video: 3 at most, 15 s and 15 MB each (checked in the browser and here). */
export async function addPortfolioVideo(user: Pick<SessionUser, "id" | "role">, v: { url: string; thumbUrl: string; seconds: number }): Promise<{ ok: true; portfolio: PortfolioPhoto[] } | { ok: false; error: string }> {
  if (user.role !== "owner") return { ok: false, error: "Only the owner can add videos." };
  const b = await getBusiness(user);
  if (!b) return { ok: false, error: "Set up your card first." };
  const problem = videoProblem(b.portfolio, v.seconds, 0);
  if (problem) return { ok: false, error: problem };
  const portfolio = [...b.portfolio, { id: newId("pf"), kind: "video" as const, url: v.url, thumbUrl: v.thumbUrl, seconds: Math.round(v.seconds) }];
  try {
    return { ok: true, portfolio: (await putBusiness(user.id, { ...b, portfolio })).portfolio };
  } catch (e) {
    if (e instanceof BusinessSaveError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function updatePortfolio(user: Pick<SessionUser, "id">, portfolio: PortfolioPhoto[]): Promise<PortfolioPhoto[]> {
  const b = await getBusiness(user);
  if (!b) return [];
  return (await putBusiness(user.id, { ...b, portfolio: portfolio.slice(0, PORTFOLIO_MAX) })).portfolio;
}

/* ---------------------------------------------------------------- tiers */

// DEMO STORES for drop_tiers and drop_packs: seeded from the mock files, editable in /admin.
const tierStore: DropTier[] = ((globalThis as { __tikkaTiers?: DropTier[] }).__tikkaTiers ??= structuredClone(dropTiers as DropTier[]));
const packStore: DropPack[] = ((globalThis as { __tikkaPacks?: DropPack[] }).__tikkaPacks ??= structuredClone(dropPacks as DropPack[]));

/** drop_tiers, read from the database and cached. */
export async function getDropTiers(): Promise<DropTier[]> {
  return (await dbTiers()) ?? [...tierStore].sort((a, b) => a.sort - b.sort);
}

/** drop_packs that can be bought. */
export async function getDropPacks(): Promise<DropPack[]> {
  return ((await dbPacks()) ?? packStore).filter((p) => p.active);
}

/** Card setup and Settings. Throws BusinessSaveError when the database refuses (say a page address was just taken). */
export async function saveBusiness(user: Pick<SessionUser, "id">, next: Business): Promise<Business> {
  // A new business gets its first drop free (TECH_PLAN §3: one 'signup' voucher). The database
  // adds its own in create_business; DEMO: the pay screens still read this store.
  if (!store.has(user.id) && !mockBusiness(user.id) && !(voucherStore.get(user.id)?.length)) {
    voucherStore.set(user.id, [signupVoucher(user.id, new Date())]);
  }
  return putBusiness(user.id, next);
}

/* ----------------------------------------------- drops without paying */

// DEMO STORE for drop_vouchers, per account. The UI never says "voucher" (lib/vouchers.ts).
const voucherStore: Map<string, Voucher[]> = ((globalThis as { __tikkaVouchers?: Map<string, Voucher[]> }).__tikkaVouchers ??= new Map([
  [DEMO_USER, vouchers as Voucher[]],
]));

export async function getVouchers(user: Pick<SessionUser, "id">): Promise<Voucher[]> {
  await connection();
  if (isDbId(user.id)) return dbVouchers();
  return voucherStore.get(user.id) ?? [];
}

function spendVoucher(ownerId: string, voucherId: string, dropId: string, now: Date) {
  voucherStore.set(
    ownerId,
    (voucherStore.get(ownerId) ?? []).map((v) => (v.id === voucherId ? { ...v, usedByDropId: dropId, usedAt: now.toISOString() } : v)),
  );
}

function addVouchers(ownerId: string, list: Voucher[]) {
  voucherStore.set(ownerId, [...(voucherStore.get(ownerId) ?? []), ...list]);
}

/** quote_drop for this business: its drops-without-paying and founding status, priced on the server. */
export async function quoteForBusiness(user: Pick<SessionUser, "id">, total: number): Promise<DropQuote> {
  const b = await getBusiness(user);
  return quoteDrop(await getDropTiers(), { vouchers: await getVouchers(user), founding: b?.foundingMember ?? false, now: new Date() }, total);
}

/** Code prefixes other businesses already use (unique across Tikka). */
export async function takenPrefixes(user: Pick<SessionUser, "id">): Promise<Set<string>> {
  const mine = (await getBusiness(user))?.codePrefix;
  const all = new Set(SEEDS.map((x) => x.business.codePrefix));
  all.add((business as Business).codePrefix);
  for (const b of store.values()) all.add(b.codePrefix);
  for (const prefix of (await dbTaken()).prefixes) all.add(prefix);
  if (mine && user.id !== DEMO_USER) all.delete(mine);
  if (user.id === DEMO_USER) all.delete((business as Business).codePrefix);
  return all;
}

/* ------------------------------------------------------------ templates */

/** drop_templates for a business category (TECH_PLAN §3), in their order. */
export async function getDropTemplates(category: TemplateCategory): Promise<DropTemplate[]> {
  return (dropTemplates as DropTemplate[]).filter((t) => t.category === category).sort((a, b) => a.sort - b.sort);
}

/* ---------------------------------------------------------------- drops */

// DEMO STORE for drafts and published drops, per account.
interface StoredDrop {
  id: string;
  slug: string;
  draft: DropDraft;
  publishedAt?: string;
  tierId?: string;
  tierMaxCards?: number;
  paymentStatus?: "free" | "pending" | "paid";
  paidWith?: "voucher" | "payment";
  voucherId?: string;
  pendingPaymentId?: string;
}
const dropStore: Map<string, StoredDrop[]> = ((globalThis as { __tikkaDropStore?: Map<string, StoredDrop[]> }).__tikkaDropStore ??= new Map());

function storedFor(user: Pick<SessionUser, "id">): StoredDrop[] {
  return dropStore.get(user.id) ?? [];
}

function slugify(name: string) {
  return name.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "drop";
}

/** Draft → the summary shape the lists and dashboards use. Status follows the dates. */
function toDrop(s: StoredDrop, now: Date): Drop {
  const d = s.draft;
  const starts = d.startMode === "now" ? (s.publishedAt ?? now.toISOString()) : watToIso(d.startsAt);
  const ends = watToIso(d.endsAt);
  const status: Drop["status"] = !s.publishedAt
    ? "draft"
    : new Date(ends) <= now
      ? "ended"
      : new Date(starts) > now
        ? "scheduled"
        : "live";
  return {
    id: s.id,
    slug: s.slug,
    name: d.name || "Untitled drop",
    status,
    total: d.total,
    claimed: 0,
    redeemed: 0,
    revenue: 0,
    startsAt: starts,
    endsAt: ends,
    finish: d.finish,
    rewards: d.rewards
      .filter((r) => r.count > 0)
      .map((r) => ({ tier: r.tier, type: r.type, label: rewardLabel(r), action: r.action || undefined, count: r.count })),
    notifyWaiting: 0,
    showOnMarketplace: d.showOnMarketplace,
    goal: d.goal,
    templateId: d.templateId,
    validityDays: d.validityDays,
    validWeekdays: d.validWeekdays,
    bounceBack: d.bounceBack?.on ? { reward: bounceBackLabel(d.bounceBack), validityDays: d.bounceBack.validityDays } : null,
    ignoredWarnings: d.ignoredWarnings,
    publishedAt: s.publishedAt,
    tierId: s.tierId,
    tierMaxCards: s.tierMaxCards,
    paymentStatus: s.paymentStatus,
    paidWith: s.paidWith,
    pendingPaymentId: s.paymentStatus === "pending" ? s.pendingPaymentId : undefined,
  };
}

const STATUS_ORDER: Record<Drop["status"], number> = { live: 0, scheduled: 1, draft: 2, sold_out: 3, ended: 4 };

/** The real clock, read at request time (drop status depends on it, so never prerendered). */
async function requestNow(): Promise<Date> {
  await connection();
  return new Date();
}

export async function getDrops(user: Pick<SessionUser, "id">, at?: Date): Promise<Drop[]> {
  const now = at ?? (await requestNow());
  if (isDbId(user.id)) {
    const list = (await dbDrops(now, mockToDraft)).map((x) => x.drop);
    return list.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.startsAt.localeCompare(a.startsAt));
  }
  const mine = storedFor(user).map((s) => toDrop(s, now));
  const demo = mockDropsOf(user.id);
  const all = [...mine, ...demo].map(withDemoClaims);
  await runGuaranteeChecks(user.id, all, now);
  return all.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.startsAt.localeCompare(a.startsAt));
}

/** A dummy drop as a builder draft, for "Run it again" on the demo account's past drops. */
function mockToDraft(d: Drop): DropDraft {
  const rewards: DraftReward[] = d.rewards.map((r, i) => {
    const pct = r.type === "percent_off" ? Number(r.label.match(/(\d+)%/)?.[1] ?? 0) : null;
    const amount = r.type === "naira_off" ? Number(r.label.replace(/[^\d]/g, "")) || null : null;
    const what =
      r.type === "percent_off" || r.type === "naira_off"
        ? r.label.replace(/^.*?off\s*/i, "")
        : r.type === "free_item"
          ? r.label.replace(/^free\s+/i, "")
          : r.label;
    return {
      id: `${d.id}-r${i}`,
      tier: r.tier,
      type: r.type,
      value: pct ?? amount,
      what,
      action: r.action ?? "",
      terms: "",
      count: r.count,
      minSpend: null,
      requiresPurchase: r.type === "percent_off" || r.type === "naira_off",
    };
  });
  const days = Math.round((Date.parse(d.endsAt) - Date.parse(d.startsAt)) / 86_400_000);
  return {
    id: d.id,
    goal: d.goal ?? "new_customers",
    templateId: d.templateId,
    name: d.name,
    total: d.total,
    startMode: "later",
    startsAt: d.startsAt.slice(0, 16),
    endsAt: d.endsAt.slice(0, 16),
    mix: "custom",
    rewards,
    finish: d.finish,
    eligibility: "once_per_drop",
    periodDays: 30,
    newReservedPct: 70,
    showOnMarketplace: true,
    marketplaceCap: null,
    durationDays: days <= 7 ? 7 : days <= 14 ? 14 : 30,
    validityDays: (d.validityDays as 7 | 14 | 30 | undefined) ?? 14,
    validWeekdays: d.validWeekdays ?? null,
    bounceBack: { ...DEFAULT_BOUNCE_BACK },
    audienceBand: null,
    ignoredWarnings: [],
  };
}

export async function getDrop(
  user: Pick<SessionUser, "id">,
  id: string,
  at?: Date,
): Promise<{ drop: Drop; draft: DropDraft } | null> {
  const now = at ?? (await requestNow());
  if (isDbId(user.id)) return (await dbDrops(now, mockToDraft)).find((x) => x.drop.id === id) ?? null;
  const s = storedFor(user).find((x) => x.id === id);
  if (s) return { drop: withDemoClaims(toDrop(s, now)), draft: { ...s.draft, id: s.id } };
  const m = mockDropsOf(user.id).find((x) => x.id === id);
  return m ? { drop: withDemoClaims(m), draft: mockToDraft(m) } : null;
}

/** Saves a draft (creating it on first save). Returns its id. */
export async function saveDropDraft(user: Pick<SessionUser, "id">, draft: DropDraft): Promise<string> {
  if (isDbId(user.id)) return dbSaveDraft(draft, new Date());
  const list = [...storedFor(user)];
  const i = draft.id ? list.findIndex((x) => x.id === draft.id && !x.publishedAt) : -1;
  if (i >= 0) {
    list[i] = { ...list[i], draft: { ...draft } };
    dropStore.set(user.id, list);
    return list[i].id;
  }
  const id = `drop_${Date.now().toString(36)}`;
  list.unshift({ id, slug: "", draft: { ...draft, id } });
  dropStore.set(user.id, list);
  return id;
}

/** Publishes a draft: the real version builds the deck (lib/deck.ts) in the same transaction. */
async function publishStored(user: Pick<SessionUser, "id">, id: string, tier: DropTier, how: { paidWith: "voucher" | "payment"; voucherId?: string }, now: Date): Promise<void> {
  const list = storedFor(user);
  const self = list.find((x) => x.id === id);
  if (!self) return;
  const taken = new Set([...list.map((x) => x.slug), ...mockDropsOf(user.id).map((d) => d.slug)]);
  let slug = slugify(self.draft.name);
  for (let n = 2; taken.has(slug); n++) slug = `${slugify(self.draft.name)}-${n}`;
  dropStore.set(
    user.id,
    list.map((x) =>
      x.id === id
        ? {
            ...x,
            slug,
            publishedAt: now.toISOString(),
            tierId: tier.id,
            tierMaxCards: tier.maxCards,
            paymentStatus: how.paidWith === "payment" ? "paid" : "free",
            paidWith: how.paidWith,
            voucherId: how.voucherId,
            pendingPaymentId: undefined,
          }
        : x,
    ),
  );
}

/** The one-live-plus-one-scheduled rule for this business (PRD B5). */
export async function publishProblem(user: Pick<SessionUser, "id">, draft: DropDraft, now: Date): Promise<string | null> {
  const drops = await getDrops(user, now);
  const startsAt = draft.startMode === "now" ? now.toISOString() : watToIso(draft.startsAt);
  return publishWindowProblem(drops, { id: draft.id, startsAt }, now);
}

/** publish_drop for real accounts: the database prices it and publishes (covered) or opens a payment (paid). */
export async function publishInDb(draft: DropDraft): Promise<DbPublishResult> {
  return dbPublish(draft, new Date());
}

export { DropSaveError };

/** publish_drop, covered path: use the drop-without-paying and publish now (one transaction). */
export async function publishWithVoucher(user: Pick<SessionUser, "id">, draft: DropDraft, voucher: Voucher, now: Date): Promise<string> {
  const tier = (await getDropTiers()).find((t) => t.id === voucher.tierId)!;
  const id = await saveDropDraft(user, draft);
  spendVoucher(user.id, voucher.id, id, now);
  await publishStored(user, id, tier, { paidWith: "voucher", voucherId: voucher.id }, now);
  return id;
}

/* ------------------------------------------------------------- payments */

// DEMO STORE for payments (drops, upgrades, season packs), per account. Paystack completes them.
const paymentStore: Map<string, Payment[]> = ((globalThis as { __tikkaPaymentStore?: Map<string, Payment[]> }).__tikkaPaymentStore ??= new Map());

/** Payments for one account. DEMO: settles stale pending ones here, standing in for the per-minute cron. */
function paymentsFor(ownerId: string): Payment[] {
  const list = abandonStale(paymentStore.get(ownerId) ?? [], new Date());
  paymentStore.set(ownerId, list);
  return list;
}

export async function getPayments(user: Pick<SessionUser, "id">): Promise<Payment[]> {
  await connection();
  if (isDbId(user.id)) return dbPayments();
  return [...paymentsFor(user.id)].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getPayment(user: Pick<SessionUser, "id">, id: string): Promise<Payment | null> {
  await connection();
  if (isDbId(user.id)) return dbPayment(id);
  return paymentsFor(user.id).find((p) => p.id === id) ?? null;
}

function newPayment(ownerId: string, p: Omit<Payment, "id" | "businessId" | "reference" | "status" | "createdAt">): Payment {
  const payment: Payment = { id: `pay_${Date.now().toString(36)}`, businessId: ownerId, reference: newReference(), status: "pending", createdAt: new Date().toISOString(), ...p };
  paymentStore.set(ownerId, [...paymentsFor(ownerId), payment]);
  return payment;
}

/** publish_drop, paid path: save the draft and open a pending payment at the server's price. */
export async function startDropPayment(user: Pick<SessionUser, "id">, draft: DropDraft, tier: DropTier, amountKobo: number): Promise<{ dropId: string; payment: Payment }> {
  const dropId = await saveDropDraft(user, draft);
  const payment = newPayment(user.id, { kind: "drop", dropId, toTier: tier.id, amountKobo });
  dropStore.set(
    user.id,
    storedFor(user).map((x) => (x.id === dropId ? { ...x, paymentStatus: "pending", pendingPaymentId: payment.id } : x)),
  );
  return { dropId, payment };
}

/** buy_pack: a pending payment for a season pack, at the pack's price (founding prices don't apply). */
export async function buyPack(user: Pick<SessionUser, "id" | "role">, packId: string): Promise<{ ok: true; payment: Payment } | { ok: false; error: string }> {
  if (user.role !== "owner") return { ok: false, error: "Only the owner can buy season packs." };
  if (isDbId(user.id)) {
    try {
      return { ok: true, payment: await dbBuyPack(packId) };
    } catch (e) {
      if (e instanceof DropSaveError) return { ok: false, error: e.message };
      throw e;
    }
  }
  const pack = (await getDropPacks()).find((p) => p.id === packId);
  if (!pack) return { ok: false, error: "That season pack isn't available." };
  return { ok: true, payment: newPayment(user.id, { kind: "pack", packId: pack.id, toTier: pack.tierId, amountKobo: pack.priceKobo }) };
}

/**
 * complete_payment: idempotent. A paid drop publishes; an upgrade raises the drop's tier and
 * appends its extra Tikkas; a season pack creates its drops.
 */
/** complete_payment for real accounts (Paystack's webhook, the verify fallback, the test button). */
export async function completeDbPayment(reference: string, amountKobo: number): Promise<{ failed: boolean }> {
  const r = await dbCompletePayment(reference, amountKobo);
  return { failed: r.kind === "failed" };
}

export async function completeOwnerPayment(user: Pick<SessionUser, "id">, reference: string, amountKobo: number, now: Date) {
  const { payments, result } = completePayment(paymentsFor(user.id), reference, amountKobo, now);
  paymentStore.set(user.id, payments);
  if (!("payment" in result) || result.effect === "failed") return result;
  const p = result.payment;
  const tier = (await getDropTiers()).find((t) => t.id === p.toTier);
  if (result.effect === "drop" && tier && p.dropId) await publishStored(user, p.dropId, tier, { paidWith: "payment" }, now);
  if (result.effect === "upgrade" && tier && p.dropId) appendTikkas(p.dropId, p.extraCards ?? 0, tier);
  if (result.effect === "pack") {
    const pack = packStore.find((x) => x.id === p.packId);
    if (pack) addVouchers(user.id, packVouchers(pack, user.id, p.id, now));
  }
  return result;
}

/** The webhook and the verify fallback only know the reference (service role: any business). */
export async function completePaymentByReference(reference: string, amountKobo: number) {
  for (const [ownerId, list] of paymentStore) {
    if (list.some((p) => p.reference === reference)) return completeOwnerPayment({ id: ownerId }, reference, amountKobo, new Date());
  }
  // A real account's payment: complete_payment() in the database (idempotent, checks the amount).
  if (/^tk_[0-9a-f]{24}$/.test(reference)) {
    const r = await dbCompletePayment(reference, amountKobo);
    if (r.kind === "failed") return { effect: "failed" as const };
  }
  return { effect: "none" as const, reason: "unknown" as const };
}

/** Appends `extra` Tikkas in the drop's own proportions (lib/deck appendCounts), to the end of the deck. */
function appendTikkas(dropId: string, extra: number, tier?: DropTier) {
  const d = findDropById(dropId);
  if (!d || extra <= 0) return;
  const counts = appendCounts(
    d.drop.rewards.map((r, i) => ({ id: String(i), count: r.count })),
    extra,
  ).map((r) => r.count);
  const a = addedStore.get(dropId) ?? { batches: [] };
  addedStore.set(dropId, { batches: [...a.batches, counts], tierId: tier?.id ?? a.tierId, tierMaxCards: tier?.maxCards ?? a.tierMaxCards });
}

export type AddTikkasResult =
  | { ok: true; kind: "added"; extra: number }
  | { ok: true; kind: "payment"; paymentId: string }
  | { ok: false; error: string };

/**
 * add_tikkas: free while the new total fits the drop's tier; otherwise an 'upgrade' payment for
 * the difference (a drop covered without paying pays the new tier's full price), appended once paid.
 */
export async function addTikkas(user: Pick<SessionUser, "id" | "role">, dropId: string, extra: number): Promise<AddTikkasResult> {
  if (user.role !== "owner") return { ok: false, error: "Only the owner can add Tikkas." };
  if (isDbId(user.id)) {
    if (!Number.isInteger(extra) || extra < 10) return { ok: false, error: "Add at least 10 Tikkas." };
    try {
      const r = await dbAddTikkas(dropId, extra);
      if (r.kind === "added") return { ok: true, kind: "added", extra };
      if (r.kind === "payment") return { ok: true, kind: "payment", paymentId: r.paymentId };
      if (r.kind === "contact") return { ok: false, error: `For drops over ${r.max.toLocaleString("en-NG")} Tikkas, talk to us.` };
      return { ok: false, error: "This drop isn't running, so you can't add Tikkas." };
    } catch (e) {
      if (e instanceof DropSaveError) return { ok: false, error: e.message };
      throw e;
    }
  }
  const found = await getDrop(user, dropId);
  if (!found || found.drop.status === "draft") return { ok: false, error: "We couldn't find that drop." };
  const { drop } = found;
  if (drop.status === "ended") return { ok: false, error: "This drop has ended. Run it again as a new drop." };
  if (!Number.isInteger(extra) || extra < 10) return { ok: false, error: "Add at least 10 Tikkas." };
  const tiers = await getDropTiers();
  const b = await getBusiness(user);
  const current = tiers.find((t) => t.id === drop.tierId) ?? tiers.find((t) => t.maxCards >= drop.total)!;
  const q = quoteAddTikkas(tiers, current, drop.total, extra, { paidWithVoucher: drop.paidWith === "voucher", founding: b?.foundingMember ?? false });
  if (q.kind === "contact") return { ok: false, error: `For drops over ${q.maxSelfServe.toLocaleString("en-NG")} Tikkas, talk to us.` };
  if (q.kind === "free") {
    appendTikkas(dropId, extra);
    return { ok: true, kind: "added", extra };
  }
  const payment = newPayment(user.id, { kind: "upgrade", dropId, fromTier: current.id, toTier: q.to.id, extraCards: extra, amountKobo: q.amountKobo });
  return { ok: true, kind: "payment", paymentId: payment.id };
}

/* ------------------------------------------------------------ guarantee */

// DEMO: evaluate_guarantee runs from the cron; here it runs when the owner's drops are read.
const guaranteeChecked: Set<string> = ((globalThis as { __tikkaGuaranteeChecked?: Set<string> }).__tikkaGuaranteeChecked ??= new Set());
const guaranteeNotices: Map<string, { message: string; at: string }> = ((globalThis as { __tikkaGuaranteeNotices?: Map<string, { message: string; at: string }> }).__tikkaGuaranteeNotices ??= new Map());

async function runGuaranteeChecks(ownerId: string, drops: Drop[], now: Date) {
  const b = await getBusiness({ id: ownerId });
  if (!b) return;
  for (const d of drops) {
    if (d.status === "draft" || guaranteeChecked.has(d.id)) continue;
    const tier = tierStore.find((t) => t.id === d.tierId);
    const claims: GuaranteeClaim[] = claimsFor(d.id).map((c) => ({ kind: "drop", expiresAt: c.card.expiresAt, redeemedAt: c.redeemedAt }));
    const known = claims.length;
    // Mock drops: claims before the data was frozen count as redeemed or expired at the drop's end.
    for (let i = known; i < d.claimed; i++) claims.push({ kind: "drop", expiresAt: d.endsAt, redeemedAt: i - known < d.redeemed ? d.endsAt : undefined });
    const base = (dropStats as Record<string, { bySource: Record<string, unknown> }>)[d.id]?.bySource ?? {};
    // Each poster counts as its own source.
    const sources = new Set([
      ...Object.keys(base),
      ...(eventStore.get(d.id) ?? []).filter((e) => e.kind === "view").map((e) => (e.posterId ? `qr:${e.posterId}` : e.source)),
    ]);
    const r = evaluateGuarantee(
      {
        paidWith: d.paidWith ?? (d.paymentStatus === "paid" ? "payment" : "voucher"),
        guaranteeUsed: b.guaranteeUsed,
        minRedemptions: tier?.guaranteeMinRedemptions ?? null,
        endsAt: d.endsAt,
        claims,
        sourcesWithViews: sources.size,
        fromTemplate: !!d.templateId,
        ignoredWarnings: d.ignoredWarnings ?? [],
      },
      now,
    );
    if (r.earned === false && r.reason === "not_due") continue;
    guaranteeChecked.add(d.id);
    if (r.earned && tier) {
      addVouchers(ownerId, [guaranteeVoucher(ownerId, tier.id, now)]);
      store.set(ownerId, { ...b, guaranteeUsed: true });
      guaranteeNotices.set(ownerId, { message: guaranteeMessage(tier.label), at: now.toISOString() });
      return;
    }
  }
}

/** "Your drop brought fewer customers than we promised…", shown on the dashboard until dismissed. */
export async function getGuaranteeNotice(user: Pick<SessionUser, "id">): Promise<string | null> {
  return guaranteeNotices.get(user.id)?.message ?? null;
}

export async function dismissGuaranteeNotice(user: Pick<SessionUser, "id">): Promise<void> {
  guaranteeNotices.delete(user.id);
}

/* ------------------------------------------------- owner alerts */

export interface NewClaim {
  token: string;
  firstName: string;
  tier: Tier;
  reward: string;
  at: string;
  /** wa.me with a welcome message, when Tikka knows their number (owners only, rule 4). */
  whatsapp: string | null;
}

/** "Adaeze just claimed a Rare Tikka": claims on this owner's drops since `since`. Owners only. */
export async function getNewClaims(user: Pick<SessionUser, "id" | "role">, since: string): Promise<NewClaim[]> {
  if (user.role !== "owner") return [];
  if (isDbId(user.id)) {
    const b = await getBusiness(user);
    if (!b) return [];
    const now = new Date();
    return (await dbNewClaims(b.id, since)).map((c) => ({
      token: c.view_token,
      firstName: c.first_name,
      tier: TIER_FROM_DB[c.tier] ?? "thank_you",
      reward: c.reward,
      at: c.claimed_at,
      whatsapp: waLink(c.phone, followupMessage("just_claimed", { name: c.first_name, reward: c.reward, expiresAt: c.expires_at }, b.name, now)),
    }));
  }
  return [...claimStore.values()]
    .filter((c) => c.ownerId === user.id && !c.seed && (c.kind ?? "drop") === "drop" && c.claimedAt > since)
    .sort((a, b) => b.claimedAt.localeCompare(a.claimedAt))
    .slice(0, 5)
    .map((c) => ({
      token: c.token,
      firstName: c.card.claimer,
      tier: c.card.tier,
      reward: c.card.reward,
      at: c.claimedAt,
      // DEMO: claims never hold numbers; get_new_claims joins the lead's phone and builds this from
      // followupMessage("just_claimed", …) for the owner.
      whatsapp: null,
    }));
}

/** The owner's alert settings (Settings › Account). */
export async function saveOwnerAlerts(user: Pick<SessionUser, "id">, ownerWhatsapp: string, dailySummary: boolean): Promise<boolean> {
  const b = await getBusiness(user);
  if (!b) return false;
  try {
    await putBusiness(user.id, { ...b, ownerWhatsapp: ownerWhatsapp || undefined, dailySummary });
  } catch (e) {
    if (e instanceof BusinessSaveError) return false;
    throw e;
  }
  return true;
}

/** The owner's number for alerts: their own setting, else the Chat on WhatsApp button's number. */
export function ownerNumber(b: Business): string | undefined {
  return b.ownerWhatsapp || b.actions.find((a) => a.kind === "whatsapp")?.value;
}

/**
 * The daily summary (TECH_PLAN §5, cron at 8:00 WAT): one message per business with it on and
 * a number to send to, skipped when there's nothing to say. Returns how many were queued.
 */
export async function runDailySummaries(now: Date): Promise<number> {
  let sent = 0;
  const owners = new Map<string, Business>();
  owners.set(DEMO_USER, normalize(store.get(DEMO_USER) ?? (business as Business)));
  for (const [id, b] of store) owners.set(id, normalize(b));
  for (const [ownerId, b] of owners) {
    if (b.dailySummary === false || !ownerNumber(b) || b.isDemo) continue;
    const mine: SummaryClaim[] = [...claimStore.values()]
      .filter((c) => c.ownerId === ownerId && (c.kind ?? "drop") === "drop")
      .map((c) => ({ claimedAt: c.claimedAt, expiresAt: c.card.expiresAt, redeemed: !!c.redeemedAt, plannedVisitDate: c.plannedVisitDate }));
    const counts = summaryCounts(mine, now);
    const drops = await getDrops({ id: ownerId }, now);
    const last = drops.find((d) => d.status === "ended" || d.status === "sold_out");
    const nudge = seasonalNudge(now, last ? { id: last.id, name: last.name, customers: last.redeemed } : null)?.text;
    if (!worthSending(counts, nudge)) continue;
    outbox.push({ token: ownerId, kind: "owner_daily", text: dailySummaryText(b.name, counts, `${SITE}/app/leads`, nudge), at: now.toISOString() });
    sent++;
  }
  return sent;
}

/* ------------------------------------------------------------ posters */

// DEMO STORE for posters (TECH_PLAN §3), per account. Every business has a "Shop counter" poster.
const posterStore: Map<string, Poster[]> = ((globalThis as { __tikkaPosters?: Map<string, Poster[]> }).__tikkaPosters ??= new Map([
  [DEMO_USER, [{ id: "pst_glow_counter", businessId: DEMO_USER, code: "K7M3QP", label: "Shop counter", createdAt: "2026-08-20T10:00:00+01:00" }]],
]));
const posterScans: Map<string, number> = ((globalThis as { __tikkaPosterScans?: Map<string, number> }).__tikkaPosterScans ??= new Map());
const scannedBy: Set<string> = ((globalThis as { __tikkaScannedBy?: Set<string> }).__tikkaScannedBy ??= new Set());

/** A business's posters: the database's for real accounts (created at setup), else the demo store's. */
async function postersFor(ownerId: string): Promise<Poster[]> {
  return isDbId(ownerId) ? dbPosters(ownerId) : postersOf(ownerId);
}

function postersOf(ownerId: string): Poster[] {
  let list = posterStore.get(ownerId);
  if (!list?.length) {
    // Created at setup in the real flow; here, the first time it's needed.
    list = [{ id: `pst_${randomBytes(6).toString("hex")}`, businessId: ownerId, code: newPosterCode(), label: "Shop counter", createdAt: new Date().toISOString() }];
    posterStore.set(ownerId, list);
  }
  return list;
}

export interface PosterRow extends Poster {
  scans: number;
  /** QR views and claims tagged with this poster, across drops. */
  views: number;
  claims: number;
}

/** Settings › Posters. Owners only. */
export async function getPosters(user: Pick<SessionUser, "id" | "role">): Promise<PosterRow[]> {
  if (user.role !== "owner" || !(await getBusiness(user))) return [];
  const events = [...eventStore.values()].flat();
  return (await postersFor(user.id)).map((p) => ({
    ...p,
    scans: posterScans.get(p.id) ?? 0,
    views: events.filter((e) => e.posterId === p.id && e.kind === "view").length,
    claims: events.filter((e) => e.posterId === p.id && e.kind === "claim_completed").length,
  }));
}

export async function addPoster(user: Pick<SessionUser, "id" | "role">, label: string): Promise<{ ok: true; poster: Poster } | { ok: false; error: string }> {
  if (user.role !== "owner") return { ok: false, error: "Only the owner can add posters." };
  const problem = validateLabel(label);
  if (problem) return { ok: false, error: problem };
  if (isDbId(user.id)) {
    try {
      return { ok: true, poster: await dbAddPoster(user.id, label.trim()) };
    } catch (e) {
      if (e instanceof BusinessSaveError) return { ok: false, error: e.message };
      throw e;
    }
  }
  const list = postersOf(user.id);
  if (list.length >= 20) return { ok: false, error: "You can have up to 20 posters." };
  const taken = new Set([...posterStore.values()].flat().map((p) => p.code));
  let code = newPosterCode();
  while (taken.has(code)) code = newPosterCode();
  const poster: Poster = { id: `pst_${randomBytes(6).toString("hex")}`, businessId: user.id, code, label: label.trim(), createdAt: new Date().toISOString() };
  posterStore.set(user.id, [...list, poster]);
  return { ok: true, poster };
}

export async function savePosterHook(user: Pick<SessionUser, "id" | "role">, posterId: string, hook: string): Promise<string | null> {
  if (user.role !== "owner") return "Only the owner can change posters.";
  const problem = validateHook(hook);
  if (problem) return problem;
  if (isDbId(user.id)) return dbSavePosterHook(posterId, hook);
  posterStore.set(user.id, postersOf(user.id).map((p) => (p.id === posterId ? { ...p, hookLine: hook.trim() || undefined } : p)));
  return null;
}

/** One poster with its business, for the print kit. Owners only. */
export async function getPosterForPrint(user: Pick<SessionUser, "id" | "role">, posterId: string) {
  if (user.role !== "owner") return null;
  const b = await getBusiness(user);
  const poster = (await postersFor(user.id)).find((p) => p.id === posterId);
  return b && poster ? { business: b, poster } : null;
}

/** The current (or last) drop's best reward, offered as a hook line. */
export async function bestRewardNow(user: Pick<SessionUser, "id">): Promise<string | undefined> {
  const drops = await getDrops(user);
  const d = drops.find((x) => x.status === "live") ?? drops.find((x) => x.status === "scheduled") ?? drops.find((x) => x.status === "ended" || x.status === "sold_out");
  return d?.rewards.find((r) => r.tier === "legendary")?.label ?? d?.rewards[0]?.label;
}

/** A scan of usetikka.com/q/[code]: counts it and says where to send them. Public. */
export async function scanPoster(code: string, visitorId: string | undefined): Promise<string | null> {
  for (const [ownerId, list] of posterStore) {
    const p = list.find((x) => x.code === code);
    if (!p) continue;
    const b = await getBusiness({ id: ownerId });
    if (!b) return null;
    // poster_scan: once per person per day (the visitor hash is daily-salted).
    const key = `${p.id}:${visitorHash(visitorId ?? "", new Date())}`;
    if (visitorId && !scannedBy.has(key)) {
      scannedBy.add(key);
      posterScans.set(p.id, (posterScans.get(p.id) ?? 0) + 1);
    }
    const drops = await getDrops({ id: ownerId });
    return posterTarget(b.slug, p.id, drops);
  }
  // A real business's poster: its live drop if it has one, else its business page.
  const db = await dbPosterByCode(code);
  return db ? posterTarget(db.businessSlug, db.poster.id, await getPageDrops(db.businessSlug, db.poster.businessId)) : null;
}

/**
 * A business's live and upcoming drops as its public page and QR poster show them. Real
 * businesses read get_business_page(), so every visitor sees the same thing whoever is signed
 * in (the owner's own drop list is for the dashboard only). DEMO businesses read the demo store.
 */
export async function getPageDrops(slug: string, ownerId: string): Promise<PageDrop[]> {
  if (isDbId(ownerId)) return pageDropsFrom(await dbPageDrops(slug), new Date());
  return pageDropsFromDrops(await getDrops({ id: ownerId }));
}

/** A poster id from a link, kept only when it's one of this business's posters. */
export async function posterOf(businessSlug: string, posterId: string | undefined): Promise<string | undefined> {
  if (!posterId) return undefined;
  const found = await getBusinessBySlug(businessSlug);
  // Real businesses: the database checks the poster belongs to the drop's business.
  if (found && isDbId(found.business.id)) return isDbId(posterId) ? posterId : undefined;
  return found && (posterStore.get(found.ownerId) ?? []).some((p) => p.id === posterId) ? posterId : undefined;
}

/* --------------------------------------------------------- drop report */

/** A reward's type and value from how it reads ("20% off any service", "₦3,000 off …"). */
function rewardFromLabel(d: Drop, label: string): ReportClaim["reward"] {
  const r = d.rewards.find((x) => x.label === label);
  const type = r?.type ?? "perk";
  const pct = label.match(/(\d+)% off/);
  const off = label.match(/₦([\d,]+) off/);
  return { type, value: type === "percent_off" && pct ? Number(pct[1]) : type === "naira_off" && off ? Number(off[1].replace(/,/g, "")) : null };
}

/** What this drop cost in Tikka fees (TECH_PLAN §12). */
async function feeOf(ownerId: string, d: Drop): Promise<DropFee> {
  const vouchersUsed = (voucherStore.get(ownerId) ?? []).find((v) => v.usedByDropId === d.id);
  if (d.paidWith === "voucher" || vouchersUsed) {
    // Paid for earlier (it couldn't go out when the money arrived): that drop's price.
    if (vouchersUsed?.source === "paid") return { kind: "paid", amountKobo: tierStore.find((t) => t.id === vouchersUsed.tierId)?.priceKobo ?? 0 };
    const kind = { signup: "free", pack: "pack", guarantee: "earned", admin: "gift" } as const;
    return { kind: kind[vouchersUsed?.source ?? "signup"] };
  }
  const paid = (paymentStore.get(ownerId) ?? []).filter((p) => p.dropId === d.id && p.status === "paid");
  if (paid.length) return { kind: "paid", amountKobo: paid.reduce((x, p) => x + p.amountKobo, 0) };
  // Mock drops: paid at their tier's price.
  const tier = tierStore.find((t) => t.id === d.tierId);
  return tier && tier.priceKobo > 0 ? { kind: "paid", amountKobo: tier.priceKobo } : { kind: "free" };
}

/** get_drop_report: owners only. */
export async function getDropReport(user: Pick<SessionUser, "id" | "role">, dropId: string): Promise<DropReport | null> {
  if (user.role !== "owner") return null;
  const found = await getDrop(user, dropId);
  if (!found || found.drop.status === "draft") return null;
  const d = found.drop;
  if (isDbId(d.id)) return dbDropReport(d);
  const claims: ReportClaim[] = claimsFor(d.id)
    .filter((c) => !c.seed)
    .map((c) => ({
      kind: c.kind ?? "drop",
      redeemed: !!c.redeemedAt,
      billKobo: c.billKobo,
      customerStatus: c.customerStatus,
      reward: c.kind === "bounce_back" ? { type: "percent_off" as const, value: Number(c.card.reward.match(/(\d+)%/)?.[1] ?? 0) } : rewardFromLabel(d, c.card.reward),
    }));
  // DEMO: mock drops' redemptions before the data was frozen, spread across their rewards.
  const mock = allMockDrops().find((m) => m.drop.id === d.id)?.drop;
  if (mock && mock.redeemed > 0) {
    const bill = Math.round((mock.revenue * 100) / mock.redeemed);
    const top = mock.rewards.filter((r) => r.tier !== "thank_you");
    for (let i = 0; i < mock.redeemed; i++) {
      const r = i % 4 === 3 ? mock.rewards.find((x) => x.tier === "thank_you")! : top[i % top.length];
      claims.push({ kind: "drop", redeemed: true, billKobo: bill, customerStatus: i % 10 < 7 ? "new" : "returning", reward: rewardFromLabel(mock, r.label) });
    }
  }
  return dropReport({ goal: d.goal, validWeekdays: d.validWeekdays }, claims, await feeOf(user.id, d));
}

/* --------------------------------------------------------------- admin */

export type { AdminBusiness, AdminDrop, AdminOverview, AdminPayment, AdminReport, PersonRecord, PrivacyLogEntry } from "./admin-db";

type AdminUser = Pick<SessionUser, "id">;

/** Everything /admin shows. A real admin reads the database (is_admin checked there); the demo admin, the demo store. */
export async function adminView(user: AdminUser, query?: string): Promise<{ overview: AdminOverview; businesses: AdminBusiness[]; payments: AdminPayment[]; reports: AdminReport[]; drops: AdminDrop[] }> {
  await connection();
  if (isDbId(user.id)) {
    const [overview, businesses, payments, reports, drops] = await Promise.all([dbAdminOverview(), dbAdminBusinesses(query), dbAdminPayments(), dbAdminReports(), dbAdminDrops()]);
    return { overview, businesses, payments, reports, drops };
  }
  return demoAdminView(query);
}

/** DEMO: the demo store in the same shapes (no moderation queue or marketplace controls). */
function demoAdminView(query?: string) {
  const owners = new Map<string, Business>();
  owners.set(DEMO_USER, normalize(store.get(DEMO_USER) ?? (business as Business)));
  for (const x of SEEDS) owners.set(x.ownerId, normalize(store.get(x.ownerId) ?? x.business));
  for (const [id, b] of store) owners.set(id, normalize(b));
  const now = new Date();
  const q = query?.trim().toLowerCase();
  const businesses: AdminBusiness[] = [...owners]
    .filter(([, b]) => !q || [b.name, b.slug, b.city].some((x) => x?.toLowerCase().includes(q)))
    .map(([ownerId, b]) => ({
      id: ownerId,
      name: b.name,
      slug: b.slug,
      area: b.area,
      city: b.city,
      category: b.category,
      verified: !!b.verified,
      suspended: false,
      isDemo: true,
      foundingMember: !!b.foundingMember,
      guaranteeUsed: !!b.guaranteeUsed,
      dropsReady: (voucherStore.get(ownerId) ?? []).filter((v) => usable(v, now)).length,
      paidKobo: (paymentStore.get(ownerId) ?? []).filter((p) => p.status === "paid").reduce((x, p) => x + p.amountKobo, 0),
      drops: (dropStore.get(ownerId) ?? []).filter((d) => d.publishedAt).length,
    }));
  const payments: AdminPayment[] = [];
  for (const [ownerId, list] of paymentStore) {
    const b = owners.get(ownerId);
    for (const p of list) payments.push({ id: p.id, kind: p.kind, amountKobo: p.amountKobo, status: p.status, reference: p.reference, toTier: p.toTier, createdAt: p.createdAt, businessName: b?.name ?? ownerId });
  }
  payments.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const paid = payments.filter((p) => p.status === "paid");
  const sum = (k?: string) => paid.filter((p) => !k || p.kind === k).reduce((x, p) => x + p.amountKobo, 0);
  const guaranteeVouchers: AdminOverview["guaranteeVouchers"] = [];
  for (const [ownerId, list] of voucherStore) for (const v of list) if (v.source === "guarantee") guaranteeVouchers.push({ businessName: owners.get(ownerId)?.name ?? ownerId, tierId: v.tierId, createdAt: v.createdAt });
  const overview: AdminOverview = {
    businesses: owners.size,
    liveDrops: 0,
    claimsToday: 0,
    redemptionsToday: 0,
    waSent30d: 0,
    waCost30dUsd: 0,
    revenue: { total: sum(), drop: sum("drop"), upgrade: sum("upgrade"), pack: sum("pack") },
    guaranteeVouchers,
  };
  return { overview, businesses, payments, reports: [] as AdminReport[], drops: [] as AdminDrop[] };
}

/** Verified badge, suspend, founding member. */
export async function adminSetBusiness(user: AdminUser, id: string, patch: { verified?: boolean; suspended?: boolean; foundingMember?: boolean }): Promise<void> {
  if (isDbId(user.id)) return dbAdminSetBusiness(id, patch);
  const b = store.get(id) ?? mockBusiness(id);
  if (b) store.set(id, { ...normalize(b), ...(patch.foundingMember !== undefined && { foundingMember: patch.foundingMember }), ...(patch.verified !== undefined && { verified: patch.verified }) });
}

export async function adminGrantDrop(user: AdminUser, id: string, tierId: string, expiresAt?: string): Promise<void> {
  if (isDbId(user.id)) return dbAdminGrantDrop(id, tierId, expiresAt);
  if (!tierStore.some((t) => t.id === tierId)) return;
  addVouchers(id, [adminVoucher(id, tierId, new Date(), expiresAt)]);
}

export async function adminSaveTier(user: AdminUser, id: string, patch: { priceKobo: number; foundingPriceKobo: number; guaranteeMinRedemptions: number | null }): Promise<void> {
  if (isDbId(user.id)) return dbAdminSaveTier(id, patch);
  const t = tierStore.find((x) => x.id === id);
  if (t && id !== "free") Object.assign(t, patch);
}

export async function adminSavePack(user: AdminUser, id: string, priceKobo: number, active: boolean): Promise<void> {
  if (isDbId(user.id)) return dbAdminSavePack(id, priceKobo, active);
  const p = packStore.find((x) => x.id === id);
  if (p) Object.assign(p, { priceKobo, active });
}

/** The moderation queue: hide or keep a reported drop or review. */
export async function adminDecide(user: AdminUser, targetType: "drop" | "review", id: string, hide: boolean): Promise<void> {
  if (isDbId(user.id)) return dbAdminDecide(targetType, id, hide);
}

/** Take a drop off the marketplace, or put it back. */
export async function adminSetDropShown(user: AdminUser, id: string, shown: boolean): Promise<void> {
  if (isDbId(user.id)) return dbAdminSetDropShown(id, shown);
}

/** Pin a drop in the featured carousel; an empty headline unpins it. */
export async function adminPinDrop(user: AdminUser, id: string, headline: string, blurb: string): Promise<void> {
  if (isDbId(user.id)) return dbAdminPinDrop(id, headline, blurb);
}

/** Privacy requests: what Tikka holds for a number. Real data only (the demo store holds no numbers). */
export async function adminPersonLookup(user: AdminUser, phone: string): Promise<PersonRecord | null> {
  return isDbId(user.id) ? dbAdminPersonLookup(phone) : null;
}

/** Deletes everything held for a number, on the person's request. */
export async function adminForgetPerson(user: AdminUser, phone: string): Promise<Record<string, number> | null> {
  return isDbId(user.id) ? dbAdminForgetPerson(phone) : null;
}

/** The last privacy requests handled (numbers masked). */
export async function adminPrivacyLog(user: AdminUser): Promise<PrivacyLogEntry[]> {
  return isDbId(user.id) ? dbAdminPrivacyLog() : [];
}

/** Every season pack, including ones taken off sale (admin, and old payments). */
export async function getAllDropPacks(): Promise<DropPack[]> {
  return (await dbPacks()) ?? [...packStore];
}

export async function deleteDropDraft(user: Pick<SessionUser, "id">, id: string): Promise<void> {
  if (isDbId(user.id)) return dbDeleteDraft(id);
  dropStore.set(
    user.id,
    storedFor(user).filter((x) => x.id !== id || x.publishedAt),
  );
}


/** get_leads: every claimer in full, to owners only. Staff and anonymous callers get an error. */
export async function getLeads(user: Pick<SessionUser, "id" | "role">): Promise<Lead[]> {
  assertCanReadLeads(user.role);
  if (isDbId(user.id)) {
    const b = await getBusiness(user);
    return b ? dbLeads(b.id) : [];
  }
  if (user.id !== DEMO_USER) return [];
  // DEMO: a seed claim redeemed at the counter shows as redeemed on its lead (same first name).
  const used = new Map<string, number | undefined>();
  for (const c of claimStore.values()) if (c.seed && c.redeemedAt) used.set(c.card.claimer, c.billKobo);
  return (leads as Lead[])
    .map((l) => {
      const first = l.name.split(" ")[0];
      const lead = l.status === "claimed" && used.has(first) ? { ...l, status: "redeemed" as const, spent: (used.get(first) ?? 0) / 100 || undefined } : l;
      const tapped = followups.get(l.id);
      return tapped ? { ...lead, lastFollowupAt: tapped } : lead;
    })
    .sort((a, b) => b.claimedAt.localeCompare(a.claimedAt));
}

// DEMO: leads.last_followup_at, until the leads table (M1).
const followups: Map<string, string> = ((globalThis as { __tikkaFollowups?: Map<string, string> }).__tikkaFollowups ??= new Map());

/** get_followups: "Message today", with a prewritten message for each. Owners only (rule 4). */
export async function getFollowups(user: Pick<SessionUser, "id" | "role">): Promise<Followup[]> {
  assertCanReadLeads(user.role);
  const [b, list] = await Promise.all([getBusiness(user), getLeads(user)]);
  if (!b) return [];
  return followupList(
    list.map((l) => ({
      id: l.id,
      name: l.name,
      phone: l.phone,
      reward: l.reward,
      claimedAt: l.claimedAt,
      expiresAt: l.expiresAt ?? claimExpiry(new Date(l.claimedAt), 14),
      redeemed: l.status === "redeemed",
      plannedVisitDate: l.plannedVisitDate,
      lastFollowupAt: l.lastFollowupAt,
    })),
    b.name,
    await leadsNow(user),
  );
}

/** "Now" for the Leads page: the real clock for real businesses; DEMO_NOW for the demo's frozen data. */
export async function leadsNow(user: Pick<SessionUser, "id">): Promise<Date> {
  await connection();
  return isDbId(user.id) ? new Date() : DEMO_NOW;
}

/** "Message on WhatsApp" was tapped: a followup_tap for the funnel and leads.last_followup_at. */
export async function recordFollowup(user: Pick<SessionUser, "id" | "role">, leadId: string): Promise<boolean> {
  if (user.role !== "owner") return false;
  if (isDbId(user.id)) return isDbId(leadId) ? dbLogFollowup(leadId) : false;
  const lead = (await getLeads(user)).find((l) => l.id === leadId);
  if (!lead) return false;
  followups.set(leadId, new Date().toISOString());
  await recordEvent(lead.dropId, "followup_tap", lead.source, leadId);
  return true;
}

/** Home's live activity: the running drop's feed. */
export async function getActivity(user: Pick<SessionUser, "id">): Promise<ActivityEvent[]> {
  const live = (await getDrops(user)).find((d) => d.status === "live");
  return live ? ((await getDropFeed({ id: user.id, role: "owner" }, live.id, 8)) ?? []) : [];
}

export async function getReviews(): Promise<Review[]> {
  return reviews as Review[];
}

/**
 * marketplace_drops: live and scheduled drops shown on the marketplace, with what the tiles
 * and rankings need. DEMO: built from every published drop (seeded, Glow Studio's, and any a
 * new account publishes); claims since the mock data was frozen count toward the rankings.
 */
/**
 * Demo businesses on the marketplace: shown while building on dummy data, never in production
 * (unless TIKKA_SHOW_DEMO=1 for a sales demo). The landing page never shows them.
 */
export const SHOW_DEMO_ON_MARKETPLACE = process.env.NODE_ENV !== "production" || process.env.TIKKA_SHOW_DEMO === "1";

export async function getMarketplaceDrops({ includeDemo = SHOW_DEMO_ON_MARKETPLACE }: { includeDemo?: boolean } = {}): Promise<MarketDrop[]> {
  await connection();
  const now = Date.now();
  const owners = new Map<string, Drop[]>();
  for (const { drop, ownerId } of allMockDrops()) owners.set(ownerId, [...(owners.get(ownerId) ?? []), drop]);
  for (const [ownerId, list] of dropStore) owners.set(ownerId, [...(owners.get(ownerId) ?? []), ...list.filter((x) => x.publishedAt).map((x) => toDrop(x, new Date()))]);

  const out: MarketDrop[] = [];
  for (const [ownerId, list] of owners) {
    const b = await getBusiness({ id: ownerId });
    if (!b || (b.isDemo && !includeDemo)) continue;
    for (const raw of list) {
      const d = withDemoClaims(raw);
      if (d.showOnMarketplace === false || (d.status !== "live" && d.status !== "scheduled")) continue;
      const fresh = claimsFor(d.id).filter((c) => !c.seed);
      const recent = (ms: number) => fresh.filter((c) => now - new Date(c.claimedAt).getTime() < ms).length;
      const legendary = d.rewards.filter((r) => r.tier === "legendary").reduce((x, r) => x + r.count, 0);
      const base = allMockDrops().find((m) => m.drop.id === d.id)?.drop.rewards ?? raw.rewards;
      const dealt = dealtCounts(d.id, base, d.claimed, addedStore.get(d.id)?.batches ?? []);
      const legendaryLeft = d.rewards.reduce((x, r, i) => x + (r.tier === "legendary" ? r.count - dealt[i] : 0), 0);
      out.push({
        id: d.id,
        dropSlug: d.slug,
        dropName: d.name,
        businessName: b.name,
        businessSlug: b.slug,
        initials: b.initials,
        brandColor: b.brandColor,
        onBrandColor: b.onBrandColor,
        category: b.category,
        area: b.area,
        city: b.city,
        state: b.state,
        total: d.total,
        left: Math.max(0, d.total - d.claimed),
        legendary,
        rare: d.rewards.filter((r) => r.tier === "rare").reduce((x, r) => x + r.count, 0),
        legendaryLeft: Math.max(0, legendaryLeft),
        status: d.status,
        startsAt: d.startsAt,
        endsAt: d.endsAt,
        publishedAt: d.publishedAt ?? d.startsAt,
        claimsLastHour: (raw.claimsLastHour ?? 0) + recent(3_600_000),
        claims24h: (raw.claims24h ?? 0) + recent(86_400_000),
        claimed: d.claimed,
        thankYou: d.rewards.filter((r) => r.tier === "thank_you").reduce((x, r) => x + r.count, 0),
        waiting: d.notifyWaiting ?? 0,
        rating: b.rating,
        logoUrl: b.logoUrl,
      });
    }
  }
  // Real businesses' drops, from the database (never demo ones).
  return [...out, ...(await dbMarketplaceDrops())];
}

/** Admin pins (marketplace_pins): the featured carousel. */
export async function getMarketPins(): Promise<MarketPin[]> {
  // Admin pins on real drops first; the seeded pins all point at demo drops.
  return [...(await dbPins()), ...(SHOW_DEMO_ON_MARKETPLACE ? (marketPins as MarketPin[]) : [])];
}

/* ---------------------------------------------------------- Notify me */

// DEMO STORE for notify subscriptions until the webhook saves them (M5). No phone numbers here:
// in the real flow the number comes from WhatsApp, and businesses only ever see a count.
interface DemoNotify {
  code: string;
  ownerId: string;
  dropId?: string;
  visitorId: string;
  at: string;
}
const notifyStore: DemoNotify[] = ((globalThis as { __tikkaNotify?: DemoNotify[] }).__tikkaNotify ??= []);

export type NotifyResult = { ok: true; code: string; message: string; waiting: number } | { ok: false; error: string };

export type NotifyStart = { ok: true; waUrl: string } | NotifyResult;

/**
 * The Notify me button. A real business: its NT-XXXXX code and the WhatsApp message that brings
 * it back with the number (the webhook subscribes and confirms there). DEMO: confirms here.
 */
export async function startNotify(businessSlug: string, dropSlug: string | undefined, visitorId: string): Promise<NotifyStart> {
  const found = await getBusinessBySlug(businessSlug);
  if (!found) return { ok: false, error: "We couldn't find that business." };
  if (!isDbId(found.business.id)) return demoSubscribeNotify(businessSlug, dropSlug, visitorId);
  const pub = dropSlug ? await getPublicDrop(businessSlug, dropSlug) : null;
  if (dropSlug && !pub) return { ok: false, error: "We couldn't find that drop." };
  const code = await dbNotifyIntent(found.business.id, pub?.drop.id ?? null, visitorId);
  if (!code) return { ok: false, error: "This business can't take sign-ups right now." };
  const text = `Notify me about ${found.business.name} ${code}`;
  const number = (process.env.NEXT_PUBLIC_TIKKA_WHATSAPP ?? "").replace(/\D/g, "");
  // DEMO (development only): until Tikka's number is set, the message goes to the test phone.
  const waUrl =
    !number && process.env.NODE_ENV !== "production"
      ? `/dev/whatsapp?text=${encodeURIComponent(text)}`
      : `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
  return { ok: true, waUrl };
}

/**
 * DEMO stand-in for subscribe_notify: the real button opens WhatsApp with "Notify me about
 * Glow Studio NT-7KQ4A" and the webhook saves it. One subscription per visitor per target.
 */
export async function demoSubscribeNotify(businessSlug: string, dropSlug: string | undefined, visitorId: string): Promise<NotifyResult> {
  const found = await getBusinessBySlug(businessSlug);
  if (!found) return { ok: false, error: "We couldn't find that business." };
  const f = dropSlug ? await findDrop(businessSlug, dropSlug) : null;
  if (dropSlug && !f) return { ok: false, error: "We couldn't find that drop." };
  const dropId = f?.drop.id;
  const existing = notifyStore.find((n) => n.ownerId === found.ownerId && n.dropId === dropId && n.visitorId === visitorId);
  const code = existing?.code ?? notifyCode();
  if (!existing) notifyStore.push({ code, ownerId: found.ownerId, dropId, visitorId, at: new Date().toISOString() });
  const name = found.business.name;
  const message =
    f && f.drop.status === "scheduled"
      ? `Done. We'll message you when ${name}'s drop opens on ${shortDate(f.drop.startsAt)}, ${clockTime(f.drop.startsAt)}.`
      : `Done. We'll message you when ${name} drops again.`;
  return { ok: true, code, message, waiting: dropId ? notifyWaitingFor(dropId) : notifyStore.filter((n) => n.ownerId === found.ownerId && !n.dropId).length };
}

/** "142 people are waiting for this drop": a count, never who. */
function notifyWaitingFor(dropId: string): number {
  const base = allMockDrops().find((m) => m.drop.id === dropId)?.drop.notifyWaiting ?? 0;
  return base + notifyStore.filter((n) => n.dropId === dropId).length;
}

/* ------------------------------------------------------- report a drop */

const dropReports: { dropId: string; reason: string; visitorId: string; at: string }[] = ((globalThis as { __tikkaDropReports?: { dropId: string; reason: string; visitorId: string; at: string }[] }).__tikkaDropReports ??= []);

/** "Report this drop": goes to the admin queue (PRD C2). One report per visitor per drop. */
export async function reportDrop(dropId: string, reason: string, visitorId: string): Promise<boolean> {
  const realId: string | undefined = dropId; // a copy: isDbId narrows what it tests
  if (isDbId(realId)) return dbReportDrop(realId, reason.slice(0, 200), visitorHash(visitorId, new Date()));
  if (!(await dropExists(dropId))) return false;
  if (!dropReports.some((r) => r.dropId === dropId && r.visitorId === visitorId)) {
    dropReports.push({ dropId, reason: reason.slice(0, 200), visitorId, at: new Date().toISOString() });
  }
  return true;
}

/**
 * The landing page's real numbers (PRD B1): demo businesses never count, and each block only
 * shows above its threshold (lib/stats.ts). The real version is one RPC over the same tables.
 */
export async function getPlatformStats(at?: Date): Promise<PlatformStats> {
  await connection();
  const now = at ?? new Date();
  // Real businesses live in the database; demo ones never count anyway.
  const t = await dbPlatformTotals().catch(() => null);
  if (t) {
    return statsFromTotals(
      {
        businesses: t.businesses,
        dropsLive: t.drops_live,
        tikkasClaimed: t.tikkas_claimed,
        recordedSales: t.recorded_sales_kobo / 100,
        recent: t.recent.map((r) => ({ id: r.id, city: r.city, tier: TIER_FROM_DB[r.tier] ?? "thank_you", businessName: r.business_name, at: r.at })),
      },
      now,
    );
  }
  const owners = new Map<string, Business>();
  owners.set(DEMO_USER, normalize(store.get(DEMO_USER) ?? (business as Business)));
  for (const x of SEEDS) owners.set(x.ownerId, normalize(store.get(x.ownerId) ?? x.business));
  for (const [id, b] of store) owners.set(id, normalize(b));
  const drops: StatsInput["drops"] = [];
  for (const { drop, ownerId } of allMockDrops()) drops.push({ id: drop.id, businessId: ownerId, status: withChanges(drop).status });
  for (const [ownerId, list] of dropStore) for (const x of list) if (x.publishedAt) drops.push({ id: x.id, businessId: ownerId, status: withChanges(toDrop(x, now)).status });
  const claims = [...claimStore.values()]
    .filter((c) => !c.seed && (c.kind ?? "drop") === "drop")
    .map((c) => ({ id: c.token, dropId: c.dropId, tier: c.card.tier, claimedAt: c.claimedAt, redeemedAt: c.redeemedAt, billKobo: c.billKobo }));
  return platformStats(
    { businesses: [...owners].map(([id, b]) => ({ id, isDemo: b.isDemo, name: b.name, city: b.city })), drops, claims },
    now,
  );
}

/* ----------------------------------------------------- the claim page */

// DEMO STORES for claims and link activity, until claim_card() (M5) and the events table (M1).
// Claims are keyed by their view token. Seeds are Glow Studio claims already counted in the
// mock drops' `claimed`, so they don't change what's left.
type StoredClaim = ClaimRecord & { visitorId?: string; seed?: boolean };
const claimStore: Map<string, StoredClaim> = ((globalThis as { __tikkaClaims?: Map<string, StoredClaim> }).__tikkaClaims ??= new Map(
  (seedClaims as ClaimRecord[]).map((c) => [c.token, { ...c, seed: true }]),
));

function claimsFor(dropId: string): StoredClaim[] {
  return [...claimStore.values()].filter((c) => c.dropId === dropId);
}
/** Claims made since the mock data was frozen: these come off what's left. */
function newClaimCount(dropId: string): number {
  return claimsFor(dropId).filter((c) => !c.seed).length;
}

interface DemoEvent {
  kind: EventKind;
  source: Source;
  /** QR visits: which poster they scanned. */
  posterId?: string;
  visitorHash: string;
  at: string;
}
const eventStore: Map<string, DemoEvent[]> = ((globalThis as { __tikkaEventStore?: Map<string, DemoEvent[]> }).__tikkaEventStore ??= new Map());
const viewTotals: Map<string, number> = ((globalThis as { __tikkaViewTotals?: Map<string, number> }).__tikkaViewTotals ??= new Map());

// DEMO STORE for add_tikkas: batches appended after publishing, and the tier they now sit in.
interface Added {
  batches: number[][];
  tierId?: string;
  tierMaxCards?: number;
}
const addedStore: Map<string, Added> = ((globalThis as { __tikkaAdded?: Map<string, Added> }).__tikkaAdded ??= new Map());

// DEMO STORE for "extend end date" and "end early" (drops.ends_at / status 'ended_early').
interface DropChange {
  endsAt?: string;
  endedEarlyAt?: string;
}
const changeStore: Map<string, DropChange> = ((globalThis as { __tikkaDropChanges?: Map<string, DropChange> }).__tikkaDropChanges ??= new Map());

/** A drop with its owner's changes: a later end date, or ended early. */
function withChanges(d: Drop): Drop {
  if (d.status === "draft") return d;
  const c = changeStore.get(d.id);
  const endsAt = c?.endedEarlyAt ?? c?.endsAt ?? d.endsAt;
  // Status follows the clock, as the real one is derived (TECH_PLAN §3).
  const now = Date.now();
  const status: Drop["status"] = new Date(endsAt).getTime() <= now ? "ended" : new Date(d.startsAt).getTime() > now ? "scheduled" : d.status === "sold_out" ? "sold_out" : "live";
  return { ...d, endsAt, status };
}

/** A drop with its added Tikkas (bigger total, bigger reward counts, maybe a bigger tier) and its changes. */
function withAdded(raw: Drop): Drop {
  const d = withChanges(raw);
  const a = addedStore.get(d.id);
  if (!a?.batches.length) return a?.tierId ? { ...d, tierId: a.tierId, tierMaxCards: a.tierMaxCards } : d;
  const rewards = d.rewards.map((r, i) => ({ ...r, count: r.count + a.batches.reduce((x, b) => x + (b[i] ?? 0), 0) }));
  const extra = a.batches.reduce((x, b) => x + b.reduce((y, z) => y + z, 0), 0);
  return { ...d, rewards, total: d.total + extra, tierId: a.tierId ?? d.tierId, tierMaxCards: a.tierMaxCards ?? d.tierMaxCards };
}

function withDemoClaims(raw: Drop): Drop {
  const d = withAdded(raw);
  const n = newClaimCount(d.id);
  const redeemed = claimsFor(d.id).filter((c) => c.redeemedAt && !(c.seed && (seedClaims as ClaimRecord[]).find((x) => x.token === c.token)?.redeemedAt));
  const extra = redeemed.reduce((a, c) => a + (c.billKobo ?? 0) / 100, 0);
  const waiting = notifyStore.filter((x) => x.dropId === d.id).length;
  return n || redeemed.length || waiting
    ? { ...d, claimed: Math.min(d.total, d.claimed + n), redeemed: d.redeemed + redeemed.length, revenue: d.revenue + extra, notifyWaiting: (d.notifyWaiting ?? 0) + waiting }
    : d;
}

/** A published drop by its public address, with the owner and its eligibility rule. */
async function findDrop(businessSlug: string, dropSlug: string) {
  const found = await getBusinessBySlug(businessSlug);
  if (!found) return null;
  const now = new Date();
  const stored = storedFor({ id: found.ownerId }).find((x) => x.publishedAt && x.slug === dropSlug);
  const raw = stored ? toDrop(stored, now) : mockDropsOf(found.ownerId).find((d) => d.slug === dropSlug);
  if (!raw) return null;
  return { ...found, drop: withAdded(raw), base: raw.rewards, batches: addedStore.get(raw.id)?.batches ?? [], newOnly: stored?.draft.eligibility === "new_only" };
}

/** A published drop by id, wherever it lives. */
function findDropById(dropId: string): { drop: Drop; ownerId: string; newOnly: boolean } | null {
  const mock = allMockDrops().find((m) => m.drop.id === dropId);
  if (mock) return { drop: withAdded(mock.drop), ownerId: mock.ownerId, newOnly: false };
  for (const [ownerId, list] of dropStore) {
    const s = list.find((x) => x.id === dropId && x.publishedAt);
    if (s) return { drop: withAdded(toDrop(s, new Date())), ownerId, newOnly: s.draft.eligibility === "new_only" };
  }
  return null;
}

/** get_public_drop: what the claim page shows. Never the deck (rule 1). */
export async function getPublicDrop(businessSlug: string, dropSlug: string): Promise<{ business: Business; drop: PublicDrop } | null> {
  const f = await findDrop(businessSlug, dropSlug);
  if (!f) {
    // A real business's drop, from the database.
    const found = await getBusinessBySlug(businessSlug);
    if (!found || !isDbId(found.business.id)) return null;
    const now = new Date();
    const db = await dbPublicDrop(found.business.id, dropSlug, now);
    return db ? { business: found.business, drop: toPublicDrop(db.drop, 0, db.newOnly, now) } : null;
  }
  return { business: f.business, drop: toPublicDrop(f.drop, newClaimCount(f.drop.id), f.newOnly, new Date()) };
}

function cardStatus(c: ClaimRecord, now: Date): CardStatus {
  const expired = !c.redeemedAt && new Date(c.card.expiresAt) <= now;
  const next = [...claimStore.values()].find((x) => x.parentToken === c.token);
  const canPlan = !c.redeemedAt && !expired && (c.kind ?? "drop") === "drop";
  return {
    redeemedAt: c.redeemedAt,
    expired,
    review: reviewState(c, now),
    plannedVisitDate: c.plannedVisitDate,
    plannedVisitPart: c.plannedVisitPart,
    visitOptions: canPlan ? visitOptions(now, c.card.expiresAt, c.validWeekdays) : undefined,
    nextVisit: next ? { token: next.token, reward: next.card.reward, expiresAt: next.card.expiresAt, redeemedAt: next.redeemedAt } : undefined,
  };
}

/** A claim's status by its view token (the claim page right after claiming). */
export async function getClaimStatus(token: string): Promise<CardStatus | null> {
  const c = claimStore.get(token);
  return c ? cardStatus(c, new Date()) : null;
}

/** "When will you come in?": only days the Tikka can still be used (quiet-day drops: their days). */
export async function setVisitPlan(token: string, date: string, part: VisitPart): Promise<CardStatus | null> {
  const c = claimStore.get(token);
  const now = new Date();
  // A card from a drop in the database: set_visit_plan() checks the day (and that it's unused).
  if (!c) return /^[A-Za-z0-9_-]{16,64}$/.test(token) && VISIT_PARTS.some((p) => p.id === part) ? dbSetVisitPlan(token, date, part) : null;
  if (!c || c.redeemedAt || !VISIT_PARTS.some((p) => p.id === part)) return null;
  if (!isPlannable(now, c.card.expiresAt, c.validWeekdays, date)) return null;
  const next = { ...c, plannedVisitDate: date, plannedVisitPart: part };
  claimStore.set(token, next);
  return cardStatus(next, now);
}

/** The card this browser already claimed from a drop, if any. */
export async function getBrowserClaim(
  dropId: string,
  token: string | undefined,
  visitorId: string | undefined,
): Promise<{ card: ClaimedCard; status: CardStatus } | null> {
  if (!token) return null;
  if (isDbId(dropId)) {
    const db = await dbCardByViewToken(token);
    return db && db.dropId === dropId ? { card: db.card, status: db.status } : null;
  }
  const c = claimStore.get(token);
  if (!c || c.dropId !== dropId || (visitorId && c.visitorId && c.visitorId !== visitorId)) return null;
  return { card: c.card, status: cardStatus(c, new Date()) };
}

export type DemoClaimResult = { ok: true; card: ClaimedCard; dropId: string } | { ok: false; reason: "not_found" | "scheduled" | "sold_out" | "ended" };

/**
 * DEMO stand-in for the WhatsApp claim (M5): gives this visitor the next card in the drop's
 * deck. One card per visitor per drop; asking again returns the same card, as a repeat
 * WhatsApp claim will (rule 3).
 */
export async function demoClaim(businessSlug: string, dropSlug: string, name: string, visitorId: string, futureDrops = false): Promise<DemoClaimResult> {
  const f = await findDrop(businessSlug, dropSlug);
  if (!f) return { ok: false, reason: "not_found" };
  const mine = claimsFor(f.drop.id).find((c) => c.visitorId === visitorId);
  if (mine) return { ok: true, card: mine.card, dropId: f.drop.id };

  const taken = newClaimCount(f.drop.id);
  const pub = toPublicDrop(f.drop, taken, f.newOnly, new Date());
  if (pub.status !== "live") return { ok: false, reason: pub.status };
  const next = cardAt(f.drop.id, f.base, f.drop.claimed + taken, f.batches);
  if (!next) return { ok: false, reason: "sold_out" };

  const token = randomBytes(12).toString("base64url");
  const card: ClaimedCard = {
    token,
    tier: next.reward.tier,
    reward: next.reward.label,
    instruction: actionInstruction(next.reward),
    action: next.reward.type === "action" ? next.reward.action : undefined,
    code: generateCode(f.business.codePrefix),
    serial: serialLabel(next.serial, f.drop.total),
    total: f.drop.total,
    claimer: firstName(name) || "Friend",
    // The full validity, even past the drop's end (rule 13).
    expiresAt: claimExpiry(new Date(), f.drop.validityDays ?? 14),
  };
  const now = new Date().toISOString();
  // The browser flips the card right after claiming, so it counts as revealed.
  claimStore.set(token, {
    token,
    dropId: f.drop.id,
    ownerId: f.ownerId,
    kind: "drop",
    visitorId,
    card,
    claimedAt: now,
    revealedAt: now,
    validWeekdays: f.drop.validWeekdays ?? null,
    futureDrops,
  });
  return { ok: true, card, dropId: f.drop.id };
}

/* ------------------------------------------------------ the card page */

export interface CardPageData {
  card: ClaimedCard;
  status: CardStatus;
  /** First open of the WhatsApp link: hold and flip, as on the claim page (PRD A2). */
  firstVisit: boolean;
  business: Business;
  businessSlug: string;
  drop: PublicDrop;
  ownerId: string;
}

/** /t/[token]: one claimer's card. Nothing about any other claimer is reachable from here. */
export async function getCardPage(token: string): Promise<CardPageData | null> {
  await connection();
  const c = claimStore.get(token);
  if (!c) return dbCardPage(token);
  const d = findDropById(c.dropId);
  const b = d ? await getBusiness({ id: d.ownerId }) : null;
  if (!d || !b) return null;
  const now = new Date();
  const firstVisit = !c.revealedAt;
  if (firstVisit) claimStore.set(token, { ...c, revealedAt: now.toISOString() });
  return {
    card: c.card,
    status: cardStatus(c, now),
    firstVisit,
    business: b,
    businessSlug: b.slug,
    drop: toPublicDrop(d.drop, newClaimCount(d.drop.id), d.newOnly, now),
    ownerId: d.ownerId,
  };
}

/** The card link from WhatsApp, for a card from a drop in the database. */
async function dbCardPage(token: string): Promise<CardPageData | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const owner = await dbCardOwner(token);
  const db = owner && (await dbCardByViewToken(token));
  const found = owner && (await getBusinessBySlug(owner.businessSlug));
  const pub = owner && (await getPublicDrop(owner.businessSlug, owner.dropSlug));
  if (!owner || !db || !found || !pub) return null;
  return {
    card: db.card,
    status: db.status,
    // The first open (they claimed on WhatsApp and never came back to the page) holds and flips.
    firstVisit: await dbRevealCard(token),
    business: found.business,
    businessSlug: found.business.slug,
    drop: pub.drop,
    ownerId: found.ownerId,
  };
}

/** /api/og/card: the revealed card as an image, for a claim in the database. The route checks the signature first. */
export async function getCardImage(claimId: string): Promise<CardArt | null> {
  if (!isDbId(claimId)) return null;
  const j = await dbCardImage(claimId);
  if (!j) return null;
  const tier = j.tier === "legendary" ? "legendary" : j.tier === "rare" ? "rare" : "thank_you";
  const host = siteUrl().replace(/^https?:\/\//, "");
  return {
    tier,
    reward: j.reward,
    action: j.action ?? undefined,
    serial: j.serial === null ? "" : serialLabel(j.serial, j.total),
    total: j.total,
    claimer: j.first_name,
    expiresAt: j.expires_at,
    businessName: j.business_name,
    codePrefix: j.code_prefix,
    where: place(j.area, j.city),
    getYours: j.drop_open ? `${host}/d/${j.business_slug}/${j.drop_slug}` : undefined,
  };
}

/* -------------------------------------------------------- redemption */

/** The business a member works for: owners their own, staff the one that invited them. */
export async function memberBusinessId(user: Pick<SessionUser, "id" | "role" | "businessOwnerId">): Promise<string | null> {
  // Real accounts: the business's own id (the database checks the membership again).
  if (isDbId(user.id)) return user.role === "owner" ? ((await getBusiness(user))?.id ?? null) : (user.businessOwnerId ?? null);
  if (user.role === "owner") return (await getBusiness(user)) ? user.id : null;
  const owner = user.businessOwnerId;
  return owner && teamFor(owner).staff.some((m) => m.userId === user.id) ? owner : null;
}

function findByCode(code: string): StoredClaim | undefined {
  for (const c of claimStore.values()) if (c.card.code === code) return c;
}

/**
 * "Been here before": they redeemed an earlier Tikka here, or were already on the list before
 * this claim. DEMO: matched by browser or first name; the real check uses the lead (phone).
 */
function hasBeenBefore(c: StoredClaim): boolean {
  for (const x of claimStore.values()) {
    if (x.token === c.token || x.ownerId !== c.ownerId || !x.redeemedAt) continue;
    if ((c.visitorId && x.visitorId === c.visitorId) || x.card.claimer === c.card.claimer) return true;
  }
  const lead = c.ownerId === DEMO_USER ? (leads as Lead[]).find((l) => l.name.split(" ")[0] === c.card.claimer) : undefined;
  return lead ? !lead.isNew : false;
}

/** check_code: read-only (rule 5). Owners and staff of the code's business only. */
export async function checkCode(user: SessionUser, code: string): Promise<CheckResult | { kind: "no_access" }> {
  const owner = await memberBusinessId(user);
  if (!owner) return { kind: "no_access" };
  if (isDbId(owner)) return dbCheckCode(owner, code);
  const claim = findByCode(code);
  return checkClaim(claim, owner, code, new Date(), claim ? hasBeenBefore(claim) : false);
}

// DEMO outbox: what M5's queue will send on WhatsApp.
export interface OutboxMessage {
  token: string;
  kind: "thanks" | "reminder" | "owner_daily";
  text: string;
  at: string;
}
const outbox: OutboxMessage[] = ((globalThis as { __tikkaOutbox?: OutboxMessage[] }).__tikkaOutbox ??= []);

/** confirm_redemption for real businesses: the database locks, checks again, and queues the thank-you. */
export async function confirmRedemptionDb(
  user: SessionUser,
  code: string,
  input: { billKobo?: number; actionConfirmed: boolean; customerStatus?: "new" | "returning" },
): Promise<ConfirmDbResult | { ok: false; result: { kind: "no_access" } }> {
  const business = await memberBusinessId(user);
  if (!business || !isDbId(business)) return { ok: false, result: { kind: "no_access" } };
  return dbConfirm(business, code, input);
}

/**
 * confirm_redemption. The real function holds `select … for update` on the claim; here the
 * read, re-check and write happen in one synchronous step, so two confirms give one success.
 */
export async function confirmRedemption(
  user: SessionUser,
  code: string,
  input: { billKobo?: number; actionConfirmed: boolean; customerStatus?: "new" | "returning" },
): Promise<ConfirmResult | { ok: false; result: { kind: "no_access" } }> {
  const owner = await memberBusinessId(user);
  if (!owner) return { ok: false, result: { kind: "no_access" } };
  const claim = findByCode(code);
  const now = new Date();
  const r = confirmClaim(claim, owner, code, { ...input, by: user.id }, now);
  if (!r.ok || !claim) return r;
  const redeemed = { ...claim, ...r.claim };
  claimStore.set(claim.token, redeemed);
  await recordEvent(claim.dropId, "redeemed", "direct", claim.token);
  const b = await getBusiness({ id: owner });
  // The next-visit Tikka, created in the same step (one per redeemed Tikka).
  const bb = bounceBackFor(
    redeemed,
    findDropById(claim.dropId)?.drop.bounceBack,
    [...claimStore.values()],
    { token: randomBytes(12).toString("base64url"), code: generateCode(b?.codePrefix ?? claim.card.code.slice(0, 2)) },
    now,
  );
  if (bb) claimStore.set(bb.token, bb);
  const next = bb ? ` Here's ${bb.card.reward.charAt(0).toLowerCase()}${bb.card.reward.slice(1)}, valid till ${shortDate(bb.card.expiresAt)}: ${SITE}/t/${bb.token}` : "";
  outbox.push({
    token: claim.token,
    kind: "thanks",
    text: `Thanks for coming to ${b?.name ?? "us"}, ${claim.card.claimer}.${next} How was it? Tap to rate: ${SITE}/t/${claim.token}/review`,
    at: now.toISOString(),
  });
  return r;
}

/**
 * The expiry reminders (TECH_PLAN §5): one per Tikka, queued by the outbound cron at normal
 * priority, behind card replies. Returns how many were queued.
 */
export async function runReminders(now: Date): Promise<number> {
  let sent = 0;
  for (const c of claimStore.values()) {
    if (c.seed || (c.kind ?? "drop") !== "drop" || !reminderDue({ ...c, expiresAt: c.card.expiresAt }, now)) continue;
    const owner = await getBusiness({ id: c.ownerId });
    claimStore.set(c.token, { ...c, reminderSentAt: now.toISOString() });
    outbox.push({ token: c.token, kind: "reminder", text: reminderText(c.card.reward, owner?.name ?? "us", c.card.expiresAt, `${SITE}/t/${c.token}`), at: now.toISOString() });
    sent++;
  }
  return sent;
}

/** DEMO: what the queue would have sent, newest first (dev only). */
export async function getOutbox(): Promise<OutboxMessage[]> {
  return [...outbox].reverse();
}

/* ------------------------------------------------------------ reviews */

// DEMO: reports on the mock reviews (claim reviews keep theirs on the claim).
const reportStore: Map<string, string> = ((globalThis as { __tikkaReports?: Map<string, string> }).__tikkaReports ??= new Map());

function claimReviews(ownerId: string): Review[] {
  const out: Review[] = [];
  for (const c of claimStore.values()) {
    if (c.ownerId !== ownerId || !c.review) continue;
    out.push({
      id: `rv_${c.token}`,
      name: displayName(c.card.claimer, c.lastInitial),
      rating: c.review.rating,
      text: c.review.body,
      dropName: findDropById(c.dropId)?.drop.name ?? "",
      at: c.review.at,
      status: c.review.status,
    });
  }
  return out;
}

/**
 * get_business_reviews: newest first. Reported reviews stay visible until Tikka decides. The
 * owner's own Reviews screen (`ownerView`) also lists the ones Tikka hid.
 */
export async function getBusinessReviews(ownerId: string, opts: { ownerView?: boolean } = {}): Promise<Review[]> {
  if (isDbId(ownerId)) {
    const b = await getBusiness({ id: ownerId });
    if (!b) return [];
    return opts.ownerView ? dbOwnerReviews(b.id) : dbPublicReviews(b.id);
  }
  const mock = ownerId === DEMO_USER ? (reviews as Review[]).map((r) => ({ ...r, status: reportStore.has(r.id) ? ("reported" as const) : ("visible" as const) })) : [];
  return [...claimReviews(ownerId), ...mock].sort((a, b) => b.at.localeCompare(a.at));
}

/** The rating trigger: the business's average and count include every new review. */
function withRatings(ownerId: string, b: Business): Business {
  let { rating, reviewCount } = b;
  for (const c of claimStore.values()) {
    if (c.ownerId === ownerId && c.review) ({ rating, reviewCount } = addRating(rating, reviewCount, c.review.rating));
  }
  return { ...b, rating, reviewCount };
}

/** /t/[token]/review: whether this claim can be reviewed, and what to show around the form. */
export async function getReviewPage(token: string) {
  await connection();
  const c = claimStore.get(token);
  if (!c) return dbReviewPageData(token);
  const d = findDropById(c.dropId);
  const b = d ? await getBusiness({ id: d.ownerId }) : null;
  if (!b) return null;
  return {
    state: reviewState(c, new Date()),
    claimer: c.card.claimer,
    shownAs: displayName(c.card.claimer, c.lastInitial),
    reward: c.card.reward,
    business: { name: b.name, initials: b.initials, brandColor: b.brandColor, onBrandColor: b.onBrandColor, logoUrl: b.logoUrl },
    review: c.review,
  };
}

/** The review page for a card from a drop in the database. */
async function dbReviewPageData(token: string) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const r = await dbReviewPage(token);
  const found = r && (await getBusinessBySlug(r.businessSlug));
  if (!r || !found) return null;
  const b = found.business;
  return {
    state: r.state,
    claimer: r.firstName,
    shownAs: r.shownAs,
    reward: r.reward,
    business: { name: b.name, initials: b.initials, brandColor: b.brandColor, onBrandColor: b.onBrandColor, logoUrl: b.logoUrl },
    review: r.review,
  };
}

export type ReviewSubmit = { ok: true } | { ok: false; error: string };

const REVIEW_REFUSAL: Record<string, string> = {
  not_found: "We couldn't find that Tikka.",
  not_redeemed: "You can review once you've used your Tikka.",
  reviewed: "You've already reviewed this visit.",
  closed: `Reviews close ${REVIEW_WINDOW_DAYS} days after your visit.`,
};

/** submit_review: redeemed, within 30 days, once per claim (rule 6). */
export async function submitReview(token: string, rating: unknown, body: unknown): Promise<ReviewSubmit> {
  const c = claimStore.get(token);
  if (!c) {
    // A card from a drop in the database: submit_review checks redeemed, 30 days and once.
    const v = validateReview(rating, body);
    if (!v.ok) return v;
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return { ok: false, error: REVIEW_REFUSAL.not_found };
    const kind = await dbSubmitReview(token, v.rating, v.body);
    if (kind === "ok") return { ok: true };
    return { ok: false, error: REVIEW_REFUSAL[kind] ?? "Something went wrong. Please try again." };
  }
  const state = reviewState(c, new Date());
  if (state === "not_redeemed") return { ok: false, error: "You can review once you've used your Tikka." };
  if (state === "reviewed") return { ok: false, error: "You've already reviewed this visit." };
  if (state === "closed") return { ok: false, error: `Reviews close ${REVIEW_WINDOW_DAYS} days after your visit.` };
  const v = validateReview(rating, body);
  if (!v.ok) return v;
  const at = new Date().toISOString();
  claimStore.set(token, { ...c, review: { rating: v.rating, body: v.body, at, status: "visible" } });
  await recordEvent(c.dropId, "reviewed", "direct", token);
  return { ok: true };
}

/** report_review: the business flags it for Tikka. It can never edit or delete it (rule 6). */
export async function reportReview(user: Pick<SessionUser, "id" | "role">, id: string, reason: string): Promise<boolean> {
  if (user.role !== "owner") return false;
  const reviewId: string | undefined = id; // a copy: isDbId narrows what it tests
  if (isDbId(reviewId)) return dbReportReview(reviewId, reason);
  if (id.startsWith("rv_")) {
    const c = claimStore.get(id.slice(3));
    if (!c || c.ownerId !== user.id || !c.review) return false;
    claimStore.set(c.token, { ...c, review: { ...c.review, status: "reported", reportReason: reason } });
    return true;
  }
  if (user.id !== DEMO_USER || !(reviews as Review[]).some((r) => r.id === id)) return false;
  reportStore.set(id, reason);
  return true;
}

/* --------------------------------------------------------------- team */

export interface TeamMember {
  userId: string;
  name: string;
  email: string;
  addedAt: string;
}
export interface TeamInvite {
  token: string;
  email: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt?: string;
}
interface Team {
  staff: TeamMember[];
  invites: TeamInvite[];
}
const teamStore: Map<string, Team> = ((globalThis as { __tikkaTeams?: Map<string, Team> }).__tikkaTeams ??= new Map([
  [DEMO_USER, { staff: [{ userId: "staff_tobi", name: "Tobi", email: "tobi@glowstudio.ng", addedAt: "2026-10-02T10:00:00+01:00" }], invites: [] }],
]));

function teamFor(ownerId: string): Team {
  return teamStore.get(ownerId) ?? { staff: [], invites: [] };
}

const INVITE_DAYS = 7;

/** The owner's team: staff and open invites. */
export async function getTeam(user: Pick<SessionUser, "id" | "role">): Promise<{ staff: TeamMember[]; invites: TeamInvite[] } | null> {
  if (user.role !== "owner") return null;
  await connection();
  if (isDbId(user.id)) {
    const b = await getBusiness(user);
    return b ? dbTeam(b.id) : { staff: [], invites: [] };
  }
  const t = teamFor(user.id);
  const now = new Date();
  return { staff: t.staff, invites: t.invites.filter((i) => !i.acceptedAt && new Date(i.expiresAt) > now) };
}

export async function inviteStaff(user: Pick<SessionUser, "id" | "role" | "email">, emailInput: string): Promise<{ ok: true; invite: TeamInvite } | { ok: false; error: string }> {
  if (user.role !== "owner") return { ok: false, error: "Only the owner can invite staff." };
  if (isDbId(user.id)) {
    const b = await getBusiness(user);
    if (!b) return { ok: false, error: "Set up your card first." };
    const r = await dbInviteStaff(b.id, emailInput);
    const now = new Date();
    return r.ok ? { ok: true, invite: { token: r.token, email: r.email, createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + INVITE_DAYS * 86_400_000).toISOString() } } : r;
  }
  const email = emailInput.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Enter their email address." };
  if (email === user.email.toLowerCase()) return { ok: false, error: "That's your own email." };
  const t = teamFor(user.id);
  if (t.staff.some((m) => m.email === email)) return { ok: false, error: "They're already on your team." };
  const now = new Date();
  const invite: TeamInvite = {
    token: randomBytes(16).toString("base64url"),
    email,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + INVITE_DAYS * 86_400_000).toISOString(),
  };
  // A new invite to the same email replaces the old one.
  teamStore.set(user.id, { ...t, invites: [...t.invites.filter((i) => i.email !== email || i.acceptedAt), invite] });
  return { ok: true, invite };
}

export async function cancelInvite(user: Pick<SessionUser, "id" | "role">, token: string): Promise<void> {
  if (user.role !== "owner") return;
  if (isDbId(user.id)) {
    const b = await getBusiness(user);
    if (b) await dbCancelInvite(b.id, token);
    return;
  }
  const t = teamFor(user.id);
  teamStore.set(user.id, { ...t, invites: t.invites.filter((i) => i.token !== token) });
}

export async function removeStaff(user: Pick<SessionUser, "id" | "role">, staffId: string): Promise<void> {
  if (user.role !== "owner") return;
  if (isDbId(user.id)) {
    const b = await getBusiness(user);
    if (b && isDbId(staffId)) await dbRemoveStaff(b.id, staffId);
    return;
  }
  const t = teamFor(user.id);
  teamStore.set(user.id, { ...t, staff: t.staff.filter((m) => m.userId !== staffId) });
}

export type InviteView = { state: "open" | "accepted" | "expired"; email: string; business: Pick<Business, "name" | "initials" | "brandColor" | "onBrandColor" | "logoUrl"> };

export async function getInvite(token: string): Promise<InviteView | null> {
  await connection();
  for (const [ownerId, t] of teamStore) {
    const i = t.invites.find((x) => x.token === token);
    if (!i) continue;
    const b = await getBusiness({ id: ownerId });
    if (!b) return null;
    const state = i.acceptedAt ? "accepted" : new Date(i.expiresAt) <= new Date() ? "expired" : "open";
    return { state, email: i.email, business: { name: b.name, initials: b.initials, brandColor: b.brandColor, onBrandColor: b.onBrandColor, logoUrl: b.logoUrl } };
  }
  // A real business's invite.
  return /^[A-Za-z0-9_-]{16,64}$/.test(token) ? dbInviteInfo(token) : null;
}

/** DEMO: the business a staff member redeems for (its owner's id), until Team uses business_members. */
export function demoStaffOwner(userId: string): string | null {
  for (const [ownerId, t] of teamStore) if (t.staff.some((m) => m.userId === userId)) return ownerId;
  return null;
}

/** Accepting adds the membership; the caller is already signed in with the invited email. */
export async function acceptInvite(token: string, name: string, userId: string): Promise<{ ownerId: string; email: string } | null> {
  for (const [ownerId, t] of teamStore) {
    const i = t.invites.find((x) => x.token === token);
    if (!i || i.acceptedAt || new Date(i.expiresAt) <= new Date()) continue;
    const now = new Date().toISOString();
    teamStore.set(ownerId, {
      staff: [...t.staff.filter((m) => m.email !== i.email), { userId, name, email: i.email, addedAt: now }],
      invites: t.invites.map((x) => (x.token === token ? { ...x, acceptedAt: now } : x)),
    });
    return { ownerId, email: i.email };
  }
  // A real business's invite: the database checks the signed-in email is the invited one.
  const businessId = await dbAcceptInvite(token);
  return businessId ? { ownerId: businessId, email: "" } : null;
}

// visitor_hash = sha256(visitor_id + daily salt): no raw ids kept (TECH_PLAN §12).
const salts: Map<string, string> = ((globalThis as { __tikkaSalts?: Map<string, string> }).__tikkaSalts ??= new Map());
function visitorHash(visitorId: string, now: Date): string {
  const day = now.toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
  let salt = salts.get(day);
  if (!salt) salts.set(day, (salt = randomBytes(16).toString("hex")));
  return createHash("sha256").update(visitorId + salt).digest("hex").slice(0, 32);
}

/**
 * Link activity. A `view` counts once per visitor per drop per day; every view also bumps
 * view_total. Other kinds come from the page's beacons and the claim.
 */
export async function recordEvent(dropId: string, kind: EventKind, source: Source, visitorId: string, posterId?: string): Promise<void> {
  const now = new Date();
  const hash = visitorHash(visitorId, now);
  if (isDbId(dropId)) return dbRecordEvent(dropId, kind, source, hash, source === "qr" ? posterId : undefined);
  const list = eventStore.get(dropId) ?? [];
  if (kind === "view") {
    viewTotals.set(dropId, (viewTotals.get(dropId) ?? 0) + 1);
    if (list.some((e) => e.kind === "view" && e.visitorHash === hash)) return;
  }
  eventStore.set(dropId, [...list, { kind, source, posterId: source === "qr" ? posterId : undefined, visitorHash: hash, at: now.toISOString() }]);
}

/** Whether a drop id exists (beacons only accept events for real drops). */
export async function dropExists(dropId: string): Promise<boolean> {
  if (isDbId(dropId)) return dbDropExists(dropId);
  if (allMockDrops().some((m) => m.drop.id === dropId)) return true;
  for (const list of dropStore.values()) if (list.some((x) => x.id === dropId && x.publishedAt)) return true;
  return false;
}

/* ------------------------------------------------------ drop dashboard */

interface BaseStats {
  viewTotal: number;
  uniqueViews: number;
  tore: number;
  tapped: number;
  continued: number;
  followedUp: number;
  newClaimers: number;
  viewsAfterSellout: number;
  bySource: Partial<Record<Source, { views: number; claims: number }>>;
}
const ZERO: BaseStats = { viewTotal: 0, uniqueViews: 0, tore: 0, tapped: 0, continued: 0, followedUp: 0, newClaimers: 0, viewsAfterSellout: 0, bySource: {} };

export interface DropDashboard {
  funnel: FunnelStep[];
  uniqueViews: number;
  viewTotal: number;
  openedNotClaimed: number;
  newClaimers: number;
  returningClaimers: number;
  /** Shown once a drop sells out. */
  afterSellout: { viewers: number; suggest: number } | null;
  notifyWaiting: number;
  bySource: { source: Source; views: number; claims: number }[];
  /** QR visits split by poster label (PRD B6). */
  qrByPoster: { label: string; views: number; claims: number }[];
  rewardsLeft: { tier: Tier; label: string; total: number; left: number }[];
}

/**
 * The drop dashboard's numbers (PRD B6). DEMO: the mock drops start from a frozen baseline
 * (drop_stats.json) and every event since is added on top, as the real counts come from
 * `events` + `claims`.
 */
export async function getDropDashboard(user: Pick<SessionUser, "id" | "role">, dropId: string): Promise<DropDashboard | null> {
  if (user.role !== "owner") return null;
  const found = await getDrop(user, dropId);
  if (!found || found.drop.status === "draft") return null;
  const { drop } = found;
  if (isDbId(dropId)) return dbDropDashboard(drop);
  const base = (dropStats as Record<string, BaseStats>)[dropId] ?? ZERO;
  const events = eventStore.get(dropId) ?? [];
  const n = (k: EventKind) => events.filter((e) => e.kind === k).length;
  const fresh = claimsFor(dropId).filter((c) => !c.seed);

  const uniqueViews = base.uniqueViews + n("view");
  const followed = base.followedUp + n("followup_tap");
  const steps = funnel({
    opened: uniqueViews,
    tore: base.tore + n("unwrap"),
    tapped: base.tapped + n("claim_tap"),
    continued: base.continued + n("claim_continue"),
    claimed: drop.claimed,
    redeemed: drop.redeemed,
    followedUp: followed,
  });

  const src = new Map<Source, { views: number; claims: number }>();
  for (const [k, v] of Object.entries(base.bySource)) src.set(k as Source, { ...v });
  for (const e of events) {
    if (e.kind !== "view" && e.kind !== "claim_completed") continue;
    const row = src.get(e.source) ?? { views: 0, claims: 0 };
    if (e.kind === "view") row.views++;
    else row.claims++;
    src.set(e.source, row);
  }

  // Cards left by reward: what the claims so far took from the deck.
  const added = addedStore.get(dropId)?.batches ?? [];
  const raw = allMockDrops().find((m) => m.drop.id === dropId)?.drop.rewards ?? drop.rewards.map((r, i) => ({ ...r, count: r.count - added.reduce((x, b) => x + (b[i] ?? 0), 0) }));
  const taken = dealtCounts(dropId, raw, drop.claimed, added);

  const soldOut = drop.claimed >= drop.total;
  const lastClaim = fresh.map((c) => c.claimedAt).sort().at(-1);
  const viewersAfter = base.viewsAfterSellout + (soldOut && lastClaim ? events.filter((e) => e.kind === "view" && e.at > lastClaim).length : 0);
  const newClaimers = Math.min(drop.claimed, base.newClaimers + fresh.length);

  return {
    funnel: steps,
    uniqueViews,
    viewTotal: base.viewTotal + (viewTotals.get(dropId) ?? 0),
    openedNotClaimed: Math.max(0, uniqueViews - drop.claimed),
    newClaimers,
    returningClaimers: drop.claimed - newClaimers,
    afterSellout: soldOut ? { viewers: viewersAfter, suggest: suggestNextSize(viewersAfter, uniqueViews, drop.claimed) } : null,
    notifyWaiting: drop.notifyWaiting ?? 0,
    bySource: [...src].map(([source, v]) => ({ source, ...v })).sort((a, b) => b.views - a.views),
    qrByPoster: (posterStore.get(user.id) ?? [])
      .map((p) => ({
        label: p.label,
        views: events.filter((e) => e.posterId === p.id && e.kind === "view").length,
        claims: events.filter((e) => e.posterId === p.id && e.kind === "claim_completed").length,
      }))
      .filter((p) => p.views || p.claims),
    rewardsLeft: drop.rewards.map((r, i) => ({ tier: r.tier, label: r.label, total: r.count, left: Math.max(0, r.count - taken[i]) })),
  };
}

/**
 * The live feed for one drop, newest first. Visitors are anonymous until they claim; claims,
 * redemptions and reviews show first names only.
 */
export async function getDropFeed(user: Pick<SessionUser, "id" | "role">, dropId: string, limit = 20): Promise<ActivityEvent[] | null> {
  if (user.role !== "owner") return null;
  if (isDbId(dropId)) return (await getDrop(user, dropId)) ? dbDropFeed(dropId, limit) : null;
  const owns = storedFor(user).some((x) => x.id === dropId) || mockDropsOf(user.id).some((d) => d.id === dropId);
  if (!owns) return null;
  const views = (eventStore.get(dropId) ?? []).filter((e) => e.kind === "view").map((e) => ({ at: e.at, source: e.source }));
  const items: ActivityEvent[] = [...groupViews(views)];
  for (const c of claimsFor(dropId)) {
    if (!c.seed) items.push({ id: `c_${c.token}`, kind: "claim", name: c.card.claimer, tier: c.card.tier, at: c.claimedAt });
    const seedUsed = c.seed && (seedClaims as ClaimRecord[]).find((x) => x.token === c.token)?.redeemedAt;
    if (c.redeemedAt && !seedUsed) items.push({ id: `r_${c.token}`, kind: "redeem", name: c.card.claimer, amount: c.billKobo ? c.billKobo / 100 : undefined, at: c.redeemedAt });
    if (c.review) items.push({ id: `rv_${c.token}`, kind: "review", name: c.card.claimer, rating: c.review.rating, at: c.review.at });
  }
  // The demo drop's history before the mock data was frozen.
  if (dropId === "drop_oct" && user.id === DEMO_USER) items.push(...(activity as ActivityEvent[]));
  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

export type DropChangeResult = { ok: true } | { ok: false; error: string };

/** Extend the end date: later than now and the current end, at most 30 days after it started. */
export async function extendDrop(user: Pick<SessionUser, "id" | "role">, dropId: string, endsAtIso: string): Promise<DropChangeResult> {
  if (user.role !== "owner") return { ok: false, error: "Only the owner can change a drop." };
  if (isDbId(user.id)) {
    const problem = await dbExtend(dropId, endsAtIso);
    return problem ? { ok: false, error: problem } : { ok: true };
  }
  const found = await getDrop(user, dropId);
  if (!found || found.drop.status === "draft") return { ok: false, error: "We couldn't find that drop." };
  const { drop } = found;
  if (drop.status === "ended") return { ok: false, error: "This drop has ended. Run it again as a new drop." };
  const end = new Date(endsAtIso);
  const max = new Date(new Date(drop.startsAt).getTime() + LIMITS.maxDays * 86_400_000);
  if (Number.isNaN(end.getTime()) || end <= new Date(drop.endsAt)) return { ok: false, error: "Pick a time after the current end." };
  if (end > max) return { ok: false, error: `A drop can run for up to ${LIMITS.maxDays} days, so the latest is ${shortDate(max.toISOString())}.` };
  changeStore.set(dropId, { ...changeStore.get(dropId), endsAt: end.toISOString() });
  // Tikkas expire with the drop, so the ones already claimed get the new end too.
  for (const c of claimsFor(dropId)) claimStore.set(c.token, { ...c, card: { ...c.card, expiresAt: end.toISOString() } });
  return { ok: true };
}

/** End early: no refund. Tikkas already claimed stay valid until their own expiry. */
export async function endDropEarly(user: Pick<SessionUser, "id" | "role">, dropId: string): Promise<DropChangeResult> {
  if (user.role !== "owner") return { ok: false, error: "Only the owner can change a drop." };
  const found = await getDrop(user, dropId);
  if (!found || found.drop.status === "draft" || found.drop.status === "ended") return { ok: false, error: "This drop isn't running." };
  if (isDbId(user.id)) {
    await dbEndEarly(dropId);
    return { ok: true };
  }
  changeStore.set(dropId, { ...changeStore.get(dropId), endedEarlyAt: new Date().toISOString() });
  return { ok: true };
}

