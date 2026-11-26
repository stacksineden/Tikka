// The homepage search (docs/HOMEPAGE_PLAN.md): what, where and when, kept in the address
// (/search?q=…&trade=…&where=…&when=…&date=…&tod=…) so a search can be shared and the back button
// works. Pure, so the search box, the results page and the tests agree. Days are West Africa Time.

import { STATES } from "./nigeria";
import { TRADES, type TradeId } from "./presets";

export type When = "any" | "today" | "tomorrow" | "weekend" | "date";
export type TimeOfDay = "morning" | "afternoon" | "evening";

export interface SearchQuery {
  /** Words: a service or a business's name. */
  q?: string;
  trade?: TradeId;
  /** "Bodija, Ibadan", "Ibadan", "Lagos". */
  where?: string;
  when: When;
  /** With when = "date": "2026-12-05". */
  date?: string;
  tod?: TimeOfDay;
  /** Filters on the results page. */
  home?: boolean;
  nodep?: boolean;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parseSearch(sp: Record<string, string | string[] | undefined>): SearchQuery {
  const q = one(sp.q)?.trim().slice(0, 60) || undefined;
  const trade = TRADES.some((t) => t.id === one(sp.trade)) ? (one(sp.trade) as TradeId) : undefined;
  const where = one(sp.where)?.trim().slice(0, 60) || undefined;
  const w = one(sp.when);
  const date = one(sp.date);
  const when: When = w === "today" || w === "tomorrow" || w === "weekend" ? w : w === "date" && date && DAY.test(date) ? "date" : "any";
  const t = one(sp.tod);
  const tod = t === "morning" || t === "afternoon" || t === "evening" ? t : undefined;
  return { q, trade, where, when, date: when === "date" ? date : undefined, tod, home: one(sp.home) === "1", nodep: one(sp.nodep) === "1" };
}

/** The results address for a search (empty parts left out). */
export function searchHref(s: Partial<SearchQuery>): string {
  const p = new URLSearchParams();
  if (s.q) p.set("q", s.q);
  if (s.trade) p.set("trade", s.trade);
  if (s.where) p.set("where", s.where);
  if (s.when && s.when !== "any") p.set("when", s.when);
  if (s.when === "date" && s.date) p.set("date", s.date);
  if (s.tod) p.set("tod", s.tod);
  if (s.home) p.set("home", "1");
  if (s.nodep) p.set("nodep", "1");
  const qs = p.toString();
  return qs ? `/search?${qs}` : "/search";
}

/** Today in WAT as "YYYY-MM-DD". */
export function watToday(now: Date): string {
  return new Date(now.getTime() + 3_600_000).toISOString().slice(0, 10);
}

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** The days a search covers; none for "any time" (the next two weeks). */
export function dayRange(s: Pick<SearchQuery, "when" | "date">, now: Date): { from?: string; to?: string } {
  const today = watToday(now);
  if (s.when === "today") return { from: today, to: today };
  if (s.when === "tomorrow") return { from: addDays(today, 1), to: addDays(today, 1) };
  if (s.when === "date" && s.date) return { from: s.date, to: s.date };
  if (s.when === "weekend") {
    const dow = new Date(`${today}T12:00:00Z`).getUTCDay(); // 0 Sunday
    if (dow === 0) return { from: today, to: today };
    const sat = addDays(today, (6 - dow + 7) % 7);
    return { from: dow === 6 ? today : sat, to: addDays(sat, 1) };
  }
  return {};
}

export const TOD_LABEL: Record<TimeOfDay, string> = { morning: "morning", afternoon: "afternoon", evening: "evening" };

export function whatLabel(s: Pick<SearchQuery, "q" | "trade">): string {
  return s.q || (s.trade ? (TRADES.find((t) => t.id === s.trade)?.name ?? "") : "");
}

export function whenLabel(s: Pick<SearchQuery, "when" | "date" | "tod">): string {
  const tod = s.tod ? `, ${TOD_LABEL[s.tod]}` : "";
  if (s.when === "today") return `Today${tod}`;
  if (s.when === "tomorrow") return `Tomorrow${tod}`;
  if (s.when === "weekend") return `This weekend${tod}`;
  if (s.when === "date" && s.date) return new Date(`${s.date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }) + tod;
  return s.tod ? `Any day${tod}` : "Any time";
}

const time = (d: Date) => {
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
};

/** "Free today, 4:30pm", "Free tomorrow, 10am", "Free Sat, 9am", "Free 3 Dec, 9am". */
export function freeLabel(iso: string, now: Date): string {
  const at = new Date(new Date(iso).getTime() + 3_600_000); // WAT, read with UTC getters
  const day = at.toISOString().slice(0, 10);
  const today = watToday(now);
  const diff = Math.round((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
  const label =
    diff <= 0 ? "today" : diff === 1 ? "tomorrow" : diff < 7 ? at.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" }) : at.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return `Free ${label}, ${time(at)}`;
}

/** Services people look for most, for the "What" step before they type. */
export const POPULAR: { name: string; trade: TradeId }[] = [
  { name: "Knotless braids", trade: "hair" },
  { name: "Silk press", trade: "hair" },
  { name: "Wig install", trade: "hair" },
  { name: "Bridal makeup", trade: "makeup" },
  { name: "Soft glam", trade: "makeup" },
  { name: "Gel nails", trade: "nails" },
  { name: "Lash extensions", trade: "lashes" },
  { name: "Gele tying", trade: "gele" },
  { name: "Portrait shoot", trade: "photo" },
  { name: "Birthday shoot", trade: "photo" },
];

/** Places for the "Where" step: every city ("Ibadan") with its state, then the states. */
export const PLACES: { label: string; hint: string }[] = [
  ...STATES.flatMap((s) => s.cities.map((c) => ({ label: c === s.name ? `${c}` : c, hint: s.name }))),
  ...STATES.map((s) => ({ label: s.name, hint: "Anywhere in the state" })),
];

/** Places that match what someone typed, best first (starts with it, then contains it). */
export function matchPlaces(typed: string, limit = 8): { label: string; hint: string }[] {
  const t = typed.trim().toLowerCase();
  if (!t) return [];
  const seen = new Set<string>();
  const out: { label: string; hint: string }[] = [];
  for (const pass of [(s: string) => s.startsWith(t), (s: string) => s.includes(t)]) {
    for (const p of PLACES) {
      const key = `${p.label}|${p.hint}`;
      if (!seen.has(key) && pass(p.label.toLowerCase())) {
        seen.add(key);
        out.push(p);
      }
    }
  }
  return out.slice(0, limit);
}

/* ------------------------------------------------------------ open now (the listing page) */

type Day = { open: boolean; from: string; to: string };
type Hours = { weekdays: Day; saturday: Day; sunday: Day };

const mins = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};
const clock = (hhmm: string) => {
  const t = mins(hhmm);
  const h = Math.floor(t / 60);
  const m = t % 60;
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
};
const dayOf = (h: Hours, dow: number): Day => (dow === 0 ? h.sunday : dow === 6 ? h.saturday : h.weekdays);

/** "Open until 7pm", "Opens 9am", "Opens tomorrow at 9am", "Opens Monday at 9am", or null without hours. */
export function openLabel(hours: Hours | undefined | null, now: Date): { open: boolean; text: string } | null {
  if (!hours) return null;
  const wat = new Date(now.getTime() + 3_600_000);
  const dow = wat.getUTCDay();
  const minute = wat.getUTCHours() * 60 + wat.getUTCMinutes();
  const today = dayOf(hours, dow);
  if (today.open && minute >= mins(today.from) && minute < mins(today.to)) return { open: true, text: `Open until ${clock(today.to)}` };
  if (today.open && minute < mins(today.from)) return { open: false, text: `Opens ${clock(today.from)}` };
  for (let i = 1; i <= 7; i++) {
    const d = dayOf(hours, (dow + i) % 7);
    if (d.open) {
      const name = i === 1 ? "tomorrow" : ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][(dow + i) % 7];
      return { open: false, text: `Opens ${name} at ${clock(d.from)}` };
    }
  }
  return null;
}

/** "today", "tomorrow in the morning", "this weekend", "on Sat 5 Dec", for sentences. */
export function whenPhrase(s: Pick<SearchQuery, "when" | "date" | "tod">): string {
  const tod = s.tod ? `in the ${TOD_LABEL[s.tod]}` : "";
  const day =
    s.when === "today" ? "today" : s.when === "tomorrow" ? "tomorrow" : s.when === "weekend" ? "this weekend" : s.when === "date" && s.date ? `on ${whenLabel({ when: "date", date: s.date })}` : "";
  return [day, tod].filter(Boolean).join(" ");
}
