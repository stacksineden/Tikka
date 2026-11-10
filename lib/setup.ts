// Card setup rules shared by the setup flow, Settings and the server actions (PRD B3).

import { checkBrandColor, normalizeHex } from "./color";
import { CATEGORIES, STATE_NAMES } from "./nigeria";
import type { ActionKind, Business, CardBackground, OpeningHours } from "./types";

export const LIMITS = {
  /** The brand name: short enough for one line on the card and the page hero. */
  name: 24,
  /** Names saved before the 24-character limit keep working until the owner changes them. */
  nameSaved: 60,
  tagline: 60,
  about: 800,
  services: 12,
  actions: 4,
  videoSeconds: 30,
  videoBytes: 20 * 1024 * 1024,
  logoMinPx: 256,
} as const;

export const ACTION_KINDS: { kind: ActionKind; label: string; placeholder: string; input: "phone" | "url" | "text" | "handle" | "none" }[] = [
  { kind: "whatsapp", label: "Chat on WhatsApp", placeholder: "803 000 0000", input: "phone" },
  { kind: "call", label: "Call", placeholder: "803 000 0000", input: "phone" },
  { kind: "directions", label: "Directions", placeholder: "Street address and area", input: "text" },
  { kind: "book", label: "Book", placeholder: "yourbusiness.com/book", input: "url" },
  { kind: "instagram", label: "Instagram", placeholder: "yourbusiness", input: "handle" },
  // Opens the Services tab on the card (the business's services and prices); no link needed.
  { kind: "services", label: "Services", placeholder: "", input: "none" },
];

export function actionMeta(kind: ActionKind) {
  return ACTION_KINDS.find((a) => a.kind === kind)!;
}

/** The fields card setup produces. Optional extras live on Business too. */
export type CardDraft = Pick<
  Business,
  "name" | "category" | "state" | "city" | "area" | "brandColor" | "logoUrl" | "background" | "actions" | "codePrefix"
> &
  Partial<Pick<Business, "tagline" | "services" | "slug" | "address">>;

export function initialsFrom(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Two letters for codes like GS-7X4QP. */
export function suggestPrefix(name: string): string {
  return initialsFrom(name.replace(/[^a-z\s]/gi, "")).replace(/[^A-Z]/g, "").padEnd(2, "X").slice(0, 2);
}

/** Alternatives when a prefix is taken: first letter + each later letter of the name, then + A–Z. */
export function prefixAlternatives(name: string, taken: Set<string>, count = 3): string[] {
  const letters = name.toUpperCase().replace(/[^A-Z]/g, "");
  const first = letters[0] ?? "T";
  const pool = [...letters.slice(1), ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];
  const out: string[] = [];
  for (const c of pool) {
    const p = first + c;
    if (!taken.has(p) && !out.includes(p)) out.push(p);
    if (out.length === count) break;
  }
  return out;
}

/** Nigerian mobile numbers to E.164: 0803 000 0000, 803…, +234 803… → +2348030000000. */
export function normalizeNgPhone(input: string): string | null {
  let d = input.replace(/\D/g, "");
  if (d.startsWith("234")) d = d.slice(3);
  if (d.startsWith("0")) d = d.slice(1);
  return /^[789][01]\d{8}$/.test(d) ? "+234" + d : null;
}

export function formatNgPhone(e164: string): string {
  const d = e164.replace(/^\+234/, "0");
  return d.length === 11 ? `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}` : e164;
}

function normalizeAction(kind: ActionKind, value: string): string | null {
  if (actionMeta(kind).input === "none") return kind;
  const v = value.trim();
  if (!v) return null;
  switch (actionMeta(kind).input) {
    case "phone":
      return normalizeNgPhone(v);
    case "handle":
      return /^@?[a-z0-9._]{1,30}$/i.test(v) ? v.replace(/^@/, "") : null;
    case "url": {
      const url = /^https?:\/\//i.test(v) ? v : "https://" + v;
      try {
        return new URL(url).hostname.includes(".") ? url : null;
      } catch {
        return null;
      }
    }
    default:
      return v.length >= 3 ? v : null;
  }
}

export type Errors = Partial<Record<string, string>>;

/** Validates and normalises the required card fields. Returns errors keyed by field. `savedName` is the
 * name already on file: left unchanged, it may be longer than today's limit. */
export function validateCard(input: CardDraft, savedName?: string): { ok: true; card: CardDraft & { onBrandColor: string; initials: string } } | { ok: false; errors: Errors } {
  const errors: Errors = {};
  const name = input.name?.trim() ?? "";
  const limit = savedName && name === savedName.trim() ? LIMITS.nameSaved : LIMITS.name;
  if (!name) errors.name = "Add your brand name.";
  else if (name.length > limit) errors.name = `Keep it to ${LIMITS.name} characters. Put the rest in your tagline.`;
  if (!CATEGORIES.includes(input.category as (typeof CATEGORIES)[number])) errors.category = "Pick a category.";
  if (!STATE_NAMES.includes(input.state)) errors.state = "Pick your state.";
  if (!input.city?.trim()) errors.city = "Add your city or town.";

  const color = normalizeHex(input.brandColor ?? "");
  const check = color ? checkBrandColor(color) : null;
  if (!color) errors.brandColor = "Pick a brand colour.";
  else if (!check!.ok) errors.brandColor = "Text won't be readable on this colour. Use the darker shade.";

  if (!input.logoUrl) errors.logo = "Add your logo.";
  const bg: CardBackground = input.background ?? { type: "color" };
  if (bg.type === "photo" && !bg.url) errors.background = "Upload a photo, or pick colour or pattern.";

  const actions: Business["actions"] = [];
  (input.actions ?? []).slice(0, LIMITS.actions).forEach((a, i) => {
    const v = normalizeAction(a.kind, a.value);
    if (!v) errors[`action-${i}`] = actionError(a.kind);
    else if (a.kind === "services" && !(input.services ?? []).some((s) => s.name.trim())) {
      errors[`action-${i}`] = "Add at least one service for this button to show.";
    } else actions.push({ kind: a.kind, value: v });
  });
  if ((input.tagline ?? "").length > LIMITS.tagline) errors.tagline = `Keep it under ${LIMITS.tagline} characters.`;
  if ((input.actions ?? []).length === 0) errors.actions = "Add at least one way for people to reach you.";

  const prefix = (input.codePrefix ?? "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(prefix)) errors.codePrefix = "Use two letters.";

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    card: {
      ...input,
      name,
      city: input.city.trim(),
      area: input.area?.trim() ?? "",
      brandColor: color!,
      onBrandColor: check!.on,
      initials: initialsFrom(name),
      background: bg,
      actions,
      codePrefix: prefix,
    },
  };
}

function actionError(kind: ActionKind): string {
  switch (actionMeta(kind).input) {
    case "phone":
      return "Enter a Nigerian mobile number, like 0803 000 0000.";
    case "url":
      return "Enter a web address, like yourbusiness.com/book.";
    case "handle":
      return "Enter your Instagram username.";
    default:
      return "Enter your address.";
  }
}

export const DEFAULT_HOURS: OpeningHours = {
  weekdays: { open: true, from: "09:00", to: "18:00" },
  saturday: { open: true, from: "10:00", to: "16:00" },
  sunday: { open: false, from: "12:00", to: "16:00" },
};

/** "9am – 7pm" */
export function formatTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hr}:${String(m).padStart(2, "0")}${suffix}` : `${hr}${suffix}`;
}

export const NAME_HINT = "The short name customers call you, e.g. Glow Studio. Put the rest in your tagline.";

/** The name field's typing limit: 24, or a longer name saved before the limit, so it isn't cut off. */
export function nameMax(saved?: string): number {
  return Math.max(LIMITS.name, saved?.trim().length ?? 0);
}
