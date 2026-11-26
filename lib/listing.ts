// Getting listed on Tikka (supabase/migrations/20261218100000_listing_journey.sql): the terms the
// owner agrees to, and the extras customers compare on. The ids match the database's fixed lists.
// Pure, so the settings screen, the listing page and the tests agree.

/** The listing terms' version: the date they were agreed (26 Nov 2026). Change it when the words change. */
export const LISTING_TERMS_VERSION = "2026-11-26";

/** What the owner agrees to, one line each (also in docs/LEGAL_ADDITIONS_DRAFT.md). */
export const LISTING_TERMS = [
  "Listing is free for now.",
  "If Tikka adds a fee, it applies only to new customers who find you through Tikka search. Never to your regulars, your own link or your Instagram.",
  "We'll tell you 30 days before any fee starts.",
  "You can leave Tikka's search any time. Your own page keeps working.",
  "Your listing shows your page's details, services, prices, photos, reviews and free times. Your customers' numbers are never shown.",
] as const;

export const EXTRA_GROUPS = [
  {
    id: "comforts",
    label: "Comforts",
    items: [
      { id: "ac", label: "Air-conditioned" },
      { id: "power", label: "Always-on power" },
      { id: "parking", label: "Parking" },
      { id: "wifi", label: "Wi-Fi" },
      { id: "waiting", label: "Waiting area" },
    ],
  },
  {
    id: "who",
    label: "Who it's for",
    items: [
      { id: "women", label: "Women" },
      { id: "men", label: "Men" },
      { id: "kids", label: "Kids welcome" },
      { id: "wheelchair", label: "Wheelchair access" },
    ],
  },
  {
    id: "pay",
    label: "How you take payment",
    items: [
      { id: "cash", label: "Cash" },
      { id: "transfer", label: "Transfer" },
      { id: "card", label: "Card (POS)" },
    ],
  },
] as const;

export const LANGUAGES = [
  { id: "en", label: "English" },
  { id: "pcm", label: "Pidgin" },
  { id: "yo", label: "Yoruba" },
  { id: "ig", label: "Igbo" },
  { id: "ha", label: "Hausa" },
] as const;

const EXTRA_IDS: ReadonlySet<string> = new Set(EXTRA_GROUPS.flatMap((g) => g.items.map((i) => i.id)));
const LANGUAGE_IDS: ReadonlySet<string> = new Set(LANGUAGES.map((l) => l.id));

/** Only known extras, each once, in list order. */
export function cleanExtras(ids: unknown): string[] {
  const picked = new Set(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string" && EXTRA_IDS.has(x)) : []);
  return EXTRA_GROUPS.flatMap((g) => g.items.map((i) => i.id)).filter((id) => picked.has(id));
}

/** Only known languages, each once, in list order. */
export function cleanLanguages(ids: unknown): string[] {
  const picked = new Set(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string" && LANGUAGE_IDS.has(x)) : []);
  return LANGUAGES.map((l) => l.id).filter((id) => picked.has(id));
}

/** The listing page's "Good to know": each group with the labels the business picked. */
export function extrasForPage(amenities: string[] = [], languages: string[] = []): { label: string; items: string[] }[] {
  const out: { label: string; items: string[] }[] = EXTRA_GROUPS.map((g) => ({
    label: g.label === "How you take payment" ? "Payment" : g.label,
    items: g.items.filter((i) => amenities.includes(i.id)).map((i) => i.label as string),
  }));
  out.push({ label: "Languages", items: LANGUAGES.filter((l) => languages.includes(l.id)).map((l) => l.label as string) });
  return out.filter((g) => g.items.length > 0);
}

export type ListingMissing = "space_photo" | "priced_service";

/** The owner's checklist line for each thing still missing. */
export const MISSING_TEXT: Record<ListingMissing, string> = {
  space_photo: "Add at least one photo of your space",
  priced_service: "Add a price to at least one service on Your page",
};
