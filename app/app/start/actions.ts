"use server";

// NEW DIRECTION, stage 1 (docs/OWNER_JOURNEYS.md journey 1): the new setup, saved to the demo store
// only. Real accounts are refused here, so nothing in this flow touches Supabase.

import { revalidatePath } from "next/cache";
import { getBusiness, isDbId, saveBusiness, takenPrefixes, takenSlugs } from "@/lib/data";
import { saveBookingSettings, saveDemoDeposit } from "@/lib/bookings-data";
import { checkBrandColor, SWATCHES } from "@/lib/color";
import { STATE_NAMES } from "@/lib/nigeria";
import { isTrade, tradeCategory, type TradeId } from "@/lib/presets";
import { demoAllowed, getOwnerUser, setDemoSession } from "@/lib/session";
import { initialsFrom, normalizeNgPhone, prefixAlternatives, suggestPrefix } from "@/lib/setup";
import { slugAlternatives, suggestSlug } from "@/lib/slug";
import { parseSocial } from "@/lib/social";
import type { Business, OpeningHours, ServiceExtra, ServiceItem, TravelReach, WorkPlace } from "@/lib/types";

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
  deposit: { mode: "percent"; percent: number; counts: boolean } | { mode: "fixed"; amount: number; counts: boolean };
  rules: string[];
}

type Result = { ok: true; slug: string } | { ok: false; error: string };

async function demoOwner() {
  if (!demoAllowed) return null;
  const user = await getOwnerUser();
  // Demo only for now: a real account would write to Supabase.
  if (!user || isDbId(user.id)) return null;
  return user;
}

const naira = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.min(10_000_000, Math.round(n))) : 0);

/** Creates (or updates) the business page from the setup screens. Called when the page goes live. */
export async function saveStartPage(input: StartPage): Promise<Result> {
  const user = await demoOwner();
  if (!user) return { ok: false, error: "This new setup only works with the demo for now." };

  const trades = input.trades.filter(isTrade) as TradeId[];
  const name = input.name.trim().slice(0, 40);
  if (!trades.length) return { ok: false, error: "Pick what you do." };
  if (name.length < 2) return { ok: false, error: "Add your business name." };
  if (!STATE_NAMES.includes(input.state) || !input.city.trim()) return { ok: false, error: "Pick your state and city." };
  const phone = normalizeNgPhone(input.whatsapp);
  if (!phone) return { ok: false, error: "Enter your WhatsApp number, like 0803 000 0000." };

  const services: ServiceItem[] = input.services
    .filter((s) => s.name.trim())
    .slice(0, 30)
    .map((s, i) => {
      const options = s.options?.filter((o) => o.label.trim()).map((o) => ({ label: o.label.trim().slice(0, 30), price: naira(o.price), minutes: Math.max(15, Math.min(720, Math.round(o.minutes))) }));
      const price = options?.length ? Math.min(...options.map((o) => o.price)) : naira(s.price);
      const minutes = options?.length ? Math.min(...options.map((o) => o.minutes)) : s.minutes;
      return {
        id: `svc_${i + 1}`,
        name: s.name.trim().slice(0, 40),
        price,
        // The owner picks: a fixed price, or a starting price for prices that move.
        priceKind: s.priceKind === "from" ? "from" : "fixed",
        minutes,
        duration: s.duration,
        options: options && options.length ? options : undefined,
        extras: input.extras.length ? input.extras.map((x) => ({ name: x.name.trim().slice(0, 40), price: naira(x.price) })) : undefined,
        eventDay: s.eventDay || undefined,
        perPerson: (s.perPerson && options && options.length > 1) || undefined,
      };
    });
  if (!services.length) return { ok: false, error: "Tick at least one service." };
  // Deposits are worked out from the price, so every service needs one.
  const unpriced = services.find((s) => !(s.price && s.price > 0) || s.options?.some((o) => !(o.price > 0)));
  if (unpriced) return { ok: false, error: `Add a price for ${unpriced.name}.` };

  const current = await getBusiness(user);
  const taken = await takenSlugs(user);
  let slug = current?.slug ?? suggestSlug(name);
  if (!current && taken.has(slug)) slug = slugAlternatives(slug, input.city, taken, 1)[0] ?? `${slug}-${Date.now() % 1000}`;
  const prefixes = await takenPrefixes(user);
  let codePrefix = current?.codePrefix ?? suggestPrefix(name);
  if (!current && prefixes.has(codePrefix)) codePrefix = prefixAlternatives(name, prefixes, 1)[0] ?? "TK";
  const brandColor = SWATCHES.some((c) => c.hex === input.brandColor) ? input.brandColor : (current?.brandColor ?? SWATCHES[0].hex);
  // DEMO: logos come from the in-memory media route only.
  const logoUrl = input.logoUrl?.startsWith("/api/demo/media/") ? input.logoUrl : current?.logoUrl;

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
    isDemo: true,
  };
  // Their best photo opens the page until they pick a cover under Your page.
  const first = next.portfolio.find((p) => p.kind !== "video");
  if (first && !next.page?.heroImageUrl) next.page = { ...next.page, heroImageUrl: first.url };
  await saveBusiness(user, next);
  await saveBookingSettings(user, {
    enabled: true,
    capacity: Math.max(1, Math.min(8, Math.round(input.capacity))),
    noticeMinutes: 120,
    aheadDays: 92,
    minutes: Object.fromEntries(services.map((s) => [s.id!, s.minutes ?? null])),
  });
  revalidatePath("/app", "layout");
  revalidatePath(`/${slug}`);
  return { ok: true, slug };
}

/** Saves the deposit and booking rules (the ID and bank steps are pretend in the demo). */
export async function saveStartMoney(input: StartMoney): Promise<Result> {
  const user = await demoOwner();
  if (!user) return { ok: false, error: "This new setup only works with the demo for now." };
  const b = await getBusiness(user);
  if (!b) return { ok: false, error: "Set up your page first." };
  const d = input.deposit;
  await saveDemoDeposit(user, d.mode === "percent"
    ? { mode: "percent", percent: Math.max(10, Math.min(100, Math.round(d.percent))), counts: d.counts }
    : { mode: "fixed", fixedKobo: naira(d.amount) * 100, counts: d.counts });
  const rules = input.rules.map((r) => r.trim().slice(0, 240)).filter(Boolean).slice(0, 10);
  await saveBusiness(user, { ...b, bookingRules: rules });
  const first = input.ownerName.trim().split(/\s+/)[0];
  if (first) await setDemoSession({ ...user, name: first.slice(0, 30) });
  revalidatePath("/app", "layout");
  revalidatePath(`/${b.slug}`);
  return { ok: true, slug: b.slug };
}
