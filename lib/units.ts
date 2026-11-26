// Per hour and per item (supabase/migrations/20261220100000_per_hour_per_item.sql): a service priced
// for one hour or one item, and the customer picks how many. Pure, so the editor, the booking sheet,
// the page and the database agree (private.unit_word() and price_choice() mirror these).

import type { ServiceItem } from "./types";

export const MAX_HOURS = 10;
export const MAX_ITEMS = 50;

/** "photo" → "photos", "dress" → "dresses"; one stays one. Lower case, like the database. */
export function unitWord(label: string, n: number): string {
  const w = label.trim().toLowerCase();
  if (n === 1) return w;
  return /(s|x|z|ch|sh)$/.test(w) ? `${w}es` : `${w}s`;
}

/** "3 hours", "1 hour", "5 photos". */
export function countText(s: Pick<ServiceItem, "unit" | "unitLabel">, n: number): string {
  return s.unit === "hour" ? `${n} ${n === 1 ? "hour" : "hours"}` : `${n} ${unitWord(s.unitLabel || "item", n)}`;
}

/** "per hour", "per photo". */
export function perText(s: Pick<ServiceItem, "unit" | "unitLabel">): string {
  return s.unit === "hour" ? "per hour" : `per ${(s.unitLabel || "item").trim().toLowerCase()}`;
}

/** The least and most a customer can pick (defaults 1 to 8 hours, 1 to 20 items), or null for no unit. */
export function unitRange(s: Pick<ServiceItem, "unit" | "unitMin" | "unitMax">): { min: number; max: number } | null {
  if (!s.unit) return null;
  const top = s.unit === "hour" ? MAX_HOURS : MAX_ITEMS;
  const min = Math.max(1, Math.min(top, Math.round(s.unitMin ?? 1)));
  const max = Math.max(min, Math.min(top, Math.round(s.unitMax ?? (s.unit === "hour" ? 8 : 20))));
  return { min, max };
}

/** How many, kept within the owner's range (the server does the same). */
export function clampQty(s: Pick<ServiceItem, "unit" | "unitMin" | "unitMax">, n: number | undefined): number {
  const r = unitRange(s);
  if (!r) return 1;
  return Math.max(r.min, Math.min(r.max, Math.round(n ?? r.min)));
}
