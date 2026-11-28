"use server";

// The new setup (docs/OWNER_JOURNEYS.md journey 1). Real accounts save to Supabase through the same
// saveBusiness() as the rest of the dashboard (docs/DB_MOVE.md step 1); the demo saves to the demo
// store. A real business set up the old way (no trades) is refused, so this never replaces its
// services or page. ID, bank and deposit are the real Get paid screens for real accounts; the
// demo pretends them here.

import { unitRange } from "@/lib/units";
import { PAGE_LIMITS } from "@/lib/page";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { ensureStartingPin } from "@/lib/listing-db";
import { BusinessSaveError, getBusiness, isDbId, saveBusiness, takenPrefixes, takenSlugs } from "@/lib/data";
import { saveBookingSettings, saveDemoDeposit } from "@/lib/bookings-data";
import { checkBrandColor, parseColor, SWATCHES } from "@/lib/color";
import { STATE_NAMES } from "@/lib/nigeria";
import { isTrade, tradeCategory, type TradeId } from "@/lib/presets";
import { toStored } from "@/lib/media-path";
import { demoAllowed, getOwnerUser, setDemoSession } from "@/lib/session";
import { initialsFrom, normalizeNgPhone, prefixAlternatives, suggestPrefix } from "@/lib/setup";
import { slugAlternatives, suggestSlug } from "@/lib/slug";
import { parseSocial } from "@/lib/social";
import type { Business, OpeningHours, ServiceExtra, ServiceItem, TravelReach, WorkPlace } from "@/lib/types";
import { cookies } from "next/headers";
import { dbRecordReferral, REF_COOKIE } from "@/lib/pilot-db";

export interface StartPage {
  trades: string[];
  name: string;
  whatsapp: string;
  /** Instagram, TikTok and Facebook: a username or a link, any of them. */
  socials: Partial<Record<"instagram" | "tiktok" | "facebook", string>>;
  /** The card's look (for drops): one of the swatches, and a logo if they have one. */
  brandColor: string;
  logoUrl?: string;
  tagline: string;
  state: string;
  city: string;
  area: string;
  workPlace: WorkPlace;
  travelFee: number;
  travelReach: TravelReach;
  services: ServiceItem[];
  extras: ServiceExtra[];
  hours: OpeningHours;
  capacity: number;
}

export interface StartMoney {
  /** The owner's name from the ID step, so the dashboard can greet them. */
  ownerName: string;
  /** The demo only: real deposits are set on Get paid once the ID is approved. */
  deposit?: { mode: "percent"; percent: number; counts: boolean } | { mode: "fixed"; amount: number; counts: boolean };
  rules: string[];
}

type Result = { ok: true; slug: string } | { ok: false; error: string };

async function setupOwner() {
  const user = await getOwnerUser();
  if (!user) return null;
  if (!isDbId(user.id) && !demoAllowed) return null;
  return user;
}

/** A logo the owner uploaded: their own Storage folder (real), or the demo media route. */
function ownLogo(url: string | undefined, userId: string): string | undefined {
  if (!url) return undefined;
  if (!isDbId(userId)) return url.startsWith("/api/demo/media/") ? url : undefined;
  const path = toStored(url);
  return path && path !== url && path.startsWith(`images/${userId}/logo/`) ? url : undefined;
}

const naira = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.min(10_000_000, Math.round(n))) : 0);

/** Creates (or updates) the business page from the setup screens. Called when the page goes live. */
export async function saveStartPage(input: StartPage): Promise<Result> {
  const user = await setupOwner();
  if (!user) return { ok: false, error: "Sign in again to set up your business." };
  const real = isDbId(user.id);

  const trades = input.trades.filter(isTrade) as TradeId[];
  const name = input.name.trim().slice(0, 40);
  if (!trades.length) return { ok: false, error: "Pick what you do." };
  if (name.length < 2) return { ok: false, error: "Add your business name." };
  if (!STATE_NAMES.includes(input.state) || !input.city.trim()) return { ok: false, error: "Pick your state and city." };
  const phone = normalizeNgPhone(input.whatsapp);
  if (!phone) return { ok: false, error: "Enter your WhatsApp number, like 0803 000 0000." };

  const services: ServiceItem[] = input.services
    .filter((s) => s.name.trim())
    .slice(0, PAGE_LIMITS.services)
    .map((s, i) => {
      const options = s.options?.filter((o) => o.label.trim()).map((o) => ({ label: o.label.trim().slice(0, 30), price: naira(o.price), minutes: Math.max(15, Math.min(720, Math.round(o.minutes))) }));
      const price = options?.length ? Math.min(...options.map((o) => o.price)) : naira(s.price);
      const minutes = options?.length ? Math.min(...options.map((o) => o.minutes)) : s.minutes;
      return {
        id: `svc_${i + 1}`,
        name: s.name.trim().slice(0, 40),
        group: s.group?.trim().slice(0, PAGE_LIMITS.group) || undefined,
        price,
        // Always exact: prices that move are options, per hour or per item (28 Nov 2026).
        priceKind: "fixed",
        minutes,
        duration: s.duration,
        options: options && options.length ? options : undefined,
        extras: input.extras.length ? input.extras.map((x) => ({ name: x.name.trim().slice(0, 40), price: naira(x.price) })) : undefined,
        eventDay: s.eventDay || undefined,
        perPerson: (s.perPerson && options && options.length > 1) || undefined,
        // Per hour or per item (lib/units.ts): serviceTo() keeps it only when it's complete.
        ...(s.unit === "hour" || s.unit === "item"
          ? {
              unit: s.unit,
              unitLabel: s.unit === "item" ? s.unitLabel?.trim().slice(0, 20) : undefined,
              unitMin: unitRange(s)?.min,
              unitMax: unitRange(s)?.max,
              unitMinutes: s.unit === "item" && s.unitMinutes ? Math.max(5, Math.min(600, Math.round(s.unitMinutes))) : undefined,
            }
          : {}),
      };
    });
  if (!services.length) return { ok: false, error: "Tick at least one service." };
  // Deposits are worked out from the price, so every service needs one.
  const unpriced = services.find((s) => !(s.price && s.price > 0) || s.options?.some((o) => !(o.price > 0)));
  if (unpriced) return { ok: false, error: `Add a price for ${unpriced.name}.` };

  const current = await getBusiness(user);
  if (real && current && !current.trades?.length) return { ok: false, error: "Your page is already set up. Open your dashboard." };
  const taken = await takenSlugs(user);
  let slug = current?.slug ?? suggestSlug(name);
  if (!current && taken.has(slug)) slug = slugAlternatives(slug, input.city, taken, 1)[0] ?? `${slug}-${Date.now() % 1000}`;
  const prefixes = await takenPrefixes(user);
  let codePrefix = current?.codePrefix ?? suggestPrefix(name);
  if (!current && prefixes.has(codePrefix)) codePrefix = prefixAlternatives(name, prefixes, 1)[0] ?? "TK";
  // Any colour the owner picked or typed (a swatch, a hex code or a colour word, made a hex in the browser).
  const brandColor = parseColor(String(input.brandColor ?? "")) ?? current?.brandColor ?? SWATCHES[0].hex;
  const logoUrl = ownLogo(input.logoUrl, user.id) ?? current?.logoUrl;

  const actions: Business["actions"] = [{ kind: "whatsapp", value: phone }];
  for (const kind of ["instagram", "tiktok", "facebook"] as const) {
    const raw = input.socials?.[kind]?.trim();
    const value = raw ? parseSocial(kind, raw) : null;
    if (value) actions.push({ kind, value });
  }
  actions.push({ kind: "services", value: "services" });

  const next: Business = {
    id: current?.id ?? `biz_${user.id}`,
    verified: false,
    reviewCount: 0,
    hasVideo: false,
    portfolio: [],
    foundingMember: false,
    guaranteeUsed: false,
    background: { type: "color" },
    ...current,
    slug,
    name,
    initials: initialsFrom(name),
    category: tradeCategory(trades),
    state: input.state,
    city: input.city.trim(),
    area: input.area.trim(),
    brandColor,
    onBrandColor: checkBrandColor(brandColor).on,
    logoUrl,
    tagline: input.tagline.trim().slice(0, 60) || undefined,
    codePrefix,
    actions,
    services,
    hours: input.hours,
    serveMode: input.workPlace === "home" ? "come_to_you" : "in_store",
    trades,
    workPlace: input.workPlace,
    travelFee: input.workPlace === "shop" ? undefined : naira(input.travelFee),
    travelReach: input.workPlace === "shop" ? undefined : input.travelReach,
    // Real businesses are never demo ones (the database keeps is_demo for Tikka anyway).
    isDemo: real ? current?.isDemo : true,
  };
  // Their best photo opens the page until they pick a cover under Your page.
  const first = next.portfolio.find((p) => p.kind !== "video");
  if (first && !next.page?.heroImageUrl) next.page = { ...next.page, heroImageUrl: first.url };
  try {
    const saved = await saveBusiness(user, next);
    // A starting map pin from the area and city, after the response (the owner can move it later).
    if (real && isDbId(saved.id)) after(() => ensureStartingPin(saved));
    // Came through another business's invite (usetikka.com/join/<code>): link them, once.
    if (real && isDbId(saved.id)) {
      const jar = await cookies();
      const ref = jar.get(REF_COOKIE)?.value;
      if (ref) {
        await dbRecordReferral(saved.id, ref).catch(() => false);
        jar.delete(REF_COOKIE);
      }
    }
    await saveBookingSettings(user, {
      enabled: true,
      capacity: Math.max(1, Math.min(8, Math.round(input.capacity))),
      noticeMinutes: 120,
      aheadDays: 92,
      // Real services carry their minutes (save_services); the demo store keeps them here.
      minutes: real ? {} : Object.fromEntries(services.map((s) => [s.id!, s.minutes ?? null])),
    });
  } catch (e) {
    return { ok: false, error: e instanceof BusinessSaveError ? e.message : "We couldn't save your page. Try again." };
  }
  revalidatePath("/app", "layout");
  revalidatePath(`/${slug}`);
  return { ok: true, slug };
}

/** Saves the deposit and booking rules (the ID and bank steps are pretend in the demo). */
export async function saveStartMoney(input: StartMoney): Promise<Result> {
  const user = await setupOwner();
  if (!user) return { ok: false, error: "Sign in again to set up your business." };
  const real = isDbId(user.id);
  const b = await getBusiness(user);
  if (!b) return { ok: false, error: "Set up your page first." };
  // Real deposits need an approved ID and a bank account first (Get paid), so only the demo saves one here.
  const d = input.deposit;
  if (!real && d) {
    await saveDemoDeposit(user, d.mode === "percent"
      ? { mode: "percent", percent: Math.max(10, Math.min(100, Math.round(d.percent))), counts: d.counts }
      : { mode: "fixed", fixedKobo: naira(d.amount) * 100, counts: d.counts });
  }
  const rules = input.rules.map((r) => r.trim().slice(0, 240)).filter(Boolean).slice(0, 10);
  try {
    await saveBusiness(user, { ...b, bookingRules: rules });
  } catch (e) {
    return { ok: false, error: e instanceof BusinessSaveError ? e.message : "We couldn't save your rules. Try again." };
  }
  const first = input.ownerName.trim().split(/\s+/)[0];
  if (!real && first) await setDemoSession({ ...user, name: first.slice(0, 30) });
  revalidatePath("/app", "layout");
  revalidatePath(`/${b.slug}`);
  return { ok: true, slug: b.slug };
}
