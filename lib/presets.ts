// NEW DIRECTION (docs/NEW_DIRECTION.md section 12, docs/OWNER_JOURNEYS.md journey 1): what a new
// business's page starts with, filled in for its trade and city so the owner only changes what's
// different. Pure, so the setup screens, the server and the tests agree. Prices are guides an owner
// edits, never a rule.

import type { OpeningHours, ServiceExtra, ServiceItem, ServiceOption, TravelReach, WorkPlace } from "./types";

export type TradeId = "hair" | "makeup" | "nails" | "lashes" | "barber" | "spa" | "gele" | "photo" | "video" | "content";

export interface Trade {
  id: TradeId;
  name: string;
  /** lucide icon name for the setup tile. */
  icon: string;
  /** "Most hair businesses ask for 30%". */
  noun: string;
  /** Under the tile, so owners see their trade at a glance: "Braids, wigs, silk press". */
  examples: string;
}

export const TRADES: Trade[] = [
  { id: "hair", name: "Hair", icon: "scissors", noun: "hair", examples: "Braids, wigs, silk press" },
  { id: "makeup", name: "Makeup", icon: "sparkles", noun: "makeup", examples: "Glam, bridal, shoots" },
  { id: "nails", name: "Nails", icon: "hand", noun: "nail", examples: "Gel, acrylics, pedicure" },
  { id: "lashes", name: "Lashes & brows", icon: "eye", noun: "lash", examples: "Extensions, lamination, microblading" },
  { id: "barber", name: "Barber", icon: "user-round", noun: "barbing", examples: "Cuts, beards, kids" },
  { id: "spa", name: "Spa", icon: "flower-2", noun: "spa", examples: "Massage, facials, waxing" },
  { id: "gele", name: "Gele", icon: "crown", noun: "gele", examples: "Tying, bridal, groups" },
  { id: "photo", name: "Photography", icon: "camera", noun: "photography", examples: "Portraits, weddings, birthdays" },
  { id: "video", name: "Videography", icon: "video", noun: "videography", examples: "Weddings, events, music videos" },
  { id: "content", name: "Content studio", icon: "clapperboard", noun: "content studio", examples: "Reels, product shoots, studio hire" },
];

export const isTrade = (id: string): id is TradeId => TRADES.some((t) => t.id === id);

/** The business's trades in the order the owner put them (their main one first). */
export const tradesInOrder = (ids: readonly string[] | null | undefined): Trade[] =>
  (ids ?? []).map((id) => TRADES.find((t) => t.id === id)).filter((t): t is Trade => !!t);

/** "Makeup, hair" on a search card: the main two, else the category. */
export function tradeLine(ids: readonly string[] | null | undefined, category: string): string {
  const [a, b] = tradesInOrder(ids);
  return a ? (b ? `${a.name}, ${b.name.toLowerCase()}` : a.name) : category;
}

interface Preset {
  name: string;
  /** Lagos guide price; other places scale from it. */
  price?: number;
  minutes?: number;
  options?: [label: string, price: number, minutes: number][];
  eventDay?: boolean;
  /** The options are people: the first once, the rest as many as needed. */
  perPerson?: boolean;
}

// Lagos guide prices in naira (26 Nov 2026). Replace with what owners tell us. Each trade's first
// three are ticked on the setup screen, so they're the ones most businesses in that trade sell; the
// rest are there to tick. Things made to order with a due date (wig making, tailoring, cakes) wait
// for Orders (docs/NEW_DIRECTION.md section 3).
const SERVICES: Record<TradeId, Preset[]> = {
  hair: [
    { name: "Knotless braids", options: [["Short", 25000, 240], ["Medium", 30000, 300], ["Long", 35000, 360]] },
    { name: "Cornrows", price: 8000, minutes: 120 },
    { name: "Wig install", price: 15000, minutes: 90 },
    { name: "Silk press", price: 12000, minutes: 120 },
    { name: "Wash and style", price: 6000, minutes: 60 },
    { name: "Box braids", options: [["Short", 20000, 240], ["Medium", 25000, 300], ["Long", 30000, 360]] },
    { name: "Twists", options: [["Passion twists", 25000, 240], ["Senegalese twists", 28000, 300]] },
    { name: "Faux locs", price: 30000, minutes: 300 },
    { name: "Frontal install", price: 20000, minutes: 120 },
    { name: "Ponytail", price: 10000, minutes: 60 },
    { name: "Relaxer", price: 8000, minutes: 90 },
    { name: "Hair colour", price: 15000, minutes: 120 },
    { name: "Locs retwist", price: 12000, minutes: 120 },
    { name: "Kids' braids", price: 10000, minutes: 120 },
  ],
  makeup: [
    { name: "Soft glam", price: 25000, minutes: 90 },
    { name: "Full glam", price: 35000, minutes: 120 },
    { name: "Bridal makeup", eventDay: true, perPerson: true, options: [["Bride", 150000, 180], ["Each bridesmaid", 25000, 60]] },
    { name: "Traditional wedding makeup", eventDay: true, perPerson: true, options: [["Bride", 120000, 180], ["Each extra person", 25000, 60]] },
    { name: "Photoshoot makeup", price: 30000, minutes: 90 },
    { name: "Makeup class (one-on-one)", price: 50000, minutes: 180 },
  ],
  nails: [
    { name: "Gel polish", price: 8000, minutes: 60 },
    { name: "Acrylic full set", options: [["Short", 15000, 90], ["Medium", 18000, 105], ["Long", 22000, 120]] },
    { name: "Pedicure", price: 10000, minutes: 60 },
    { name: "Manicure", price: 7000, minutes: 45 },
    { name: "Manicure and pedicure", price: 15000, minutes: 90 },
    { name: "Gel extensions", options: [["Short", 15000, 90], ["Long", 20000, 120]] },
    { name: "Polygel", price: 18000, minutes: 90 },
    { name: "Acrylic refill", price: 12000, minutes: 75 },
    { name: "Toe acrylics", price: 12000, minutes: 75 },
    { name: "Gel or acrylic removal", price: 3000, minutes: 30 },
  ],
  lashes: [
    { name: "Lash extensions", options: [["Classic", 15000, 90], ["Hybrid", 20000, 105], ["Volume", 25000, 120]] },
    { name: "Lash fill", price: 10000, minutes: 60 },
    { name: "Brow lamination", price: 12000, minutes: 45 },
    { name: "Strip lashes", price: 5000, minutes: 20 },
    { name: "Lash lift and tint", price: 15000, minutes: 60 },
    { name: "Brow shaping and tint", price: 6000, minutes: 30 },
    { name: "Microblading", price: 80000, minutes: 150 },
    { name: "Ombre powder brows", price: 100000, minutes: 150 },
  ],
  barber: [
    { name: "Haircut", price: 5000, minutes: 45 },
    { name: "Haircut and beard", price: 7000, minutes: 60 },
    { name: "Kids' cut", price: 3000, minutes: 30 },
    { name: "Beard trim", price: 3000, minutes: 20 },
    { name: "Clean shave", price: 4000, minutes: 30 },
    { name: "Haircut and dye", price: 10000, minutes: 75 },
    { name: "Texturizer", price: 6000, minutes: 45 },
  ],
  spa: [
    { name: "Swedish massage", options: [["60 minutes", 25000, 60], ["90 minutes", 35000, 90]] },
    { name: "Facial", price: 20000, minutes: 60 },
    { name: "Body scrub", price: 18000, minutes: 60 },
    { name: "Deep tissue massage", options: [["60 minutes", 30000, 60], ["90 minutes", 40000, 90]] },
    { name: "Hot stone massage", price: 35000, minutes: 90 },
    { name: "Couples massage", price: 50000, minutes: 60 },
    { name: "Waxing", options: [["Underarm", 5000, 15], ["Brazilian", 15000, 30], ["Full legs", 15000, 45]] },
    { name: "Chemical peel", price: 30000, minutes: 60 },
  ],
  gele: [
    { name: "Gele tying", price: 10000, minutes: 30 },
    { name: "Bridal gele", eventDay: true, price: 25000, minutes: 60 },
    { name: "Ready-to-wear gele", price: 15000, minutes: 30 },
    { name: "Gele for a group", eventDay: true, perPerson: true, options: [["First person", 10000, 30], ["Each extra person", 7000, 20]] },
    { name: "Turban styling", price: 8000, minutes: 30 },
    { name: "Gele class", price: 30000, minutes: 120 },
  ],
  photo: [
    { name: "Studio portrait", options: [["30 minutes", 30000, 30], ["1 hour", 50000, 60]] },
    { name: "Birthday shoot", price: 80000, minutes: 120 },
    { name: "Wedding", eventDay: true, options: [["Half day", 400000, 300], ["Full day", 700000, 600]] },
    { name: "Traditional wedding", eventDay: true, options: [["Half day", 300000, 300], ["Full day", 500000, 600]] },
    { name: "Pre-wedding shoot", price: 150000, minutes: 180 },
    { name: "Event coverage", eventDay: true, options: [["Half day", 200000, 300], ["Full day", 350000, 600]] },
    { name: "Family portrait", price: 60000, minutes: 60 },
    { name: "Maternity shoot", price: 80000, minutes: 120 },
    { name: "Newborn and baby shoot", price: 70000, minutes: 120 },
    { name: "Graduation shoot", price: 50000, minutes: 60 },
    { name: "Headshots", price: 40000, minutes: 45 },
    { name: "Passport photos", price: 3000, minutes: 15 },
  ],
  video: [
    { name: "Event coverage", eventDay: true, options: [["Half day", 300000, 300], ["Full day", 500000, 600]] },
    { name: "Highlight video", price: 150000, minutes: 240 },
    { name: "Wedding film", eventDay: true, options: [["Half day", 500000, 300], ["Full day", 900000, 600]] },
    { name: "Pre-wedding video", price: 200000, minutes: 240 },
    { name: "Music video", price: 400000, minutes: 600 },
    { name: "Event live stream", eventDay: true, price: 250000, minutes: 600 },
  ],
  content: [
    { name: "Content day", options: [["Half day", 150000, 240], ["Full day", 250000, 480]] },
    { name: "Product shoot", options: [["5 products", 50000, 120], ["10 products", 90000, 180], ["20 products", 160000, 300]] },
    { name: "Reels package", options: [["4 reels", 120000, 240], ["8 reels", 220000, 420]] },
    { name: "Brand shoot", price: 200000, minutes: 300 },
    { name: "Studio hire", options: [["1 hour", 15000, 60], ["2 hours", 25000, 120], ["Half day", 50000, 240]] },
    { name: "Podcast recording", options: [["1 hour", 40000, 60], ["2 hours", 70000, 120]] },
    { name: "Creator shoot", price: 60000, minutes: 120 },
    { name: "Fashion lookbook", price: 180000, minutes: 300 },
  ],
};

const EXTRAS: Record<TradeId, [string, number][]> = {
  hair: [["Add wash", 2000], ["Take down old braids", 3000], ["Add beads", 1500], ["Braiding hair included", 8000]],
  makeup: [["Gele", 10000], ["Lashes", 3000], ["Touch-up artist stays all day", 50000]],
  nails: [["Nail art", 3000], ["Toe nails painting", 3000], ["French tips", 3000], ["Chrome finish", 3000]],
  lashes: [["Lash removal", 3000]],
  barber: [["Hot towel", 1000], ["Hair dye", 4000], ["Beard dye", 3000]],
  spa: [["Aromatherapy oils", 5000], ["Extra 30 minutes", 10000], ["Steam", 5000]],
  gele: [["Pins and accessories", 2000]],
  photo: [["10 more edited photos", 10000], ["Photo book", 60000], ["Extra hour", 30000], ["Framed print", 25000]],
  video: [["Drone shots", 80000], ["Same-day edit", 100000], ["Second camera operator", 80000], ["Raw footage", 30000]],
  content: [["10 more edited photos", 15000], ["Model", 30000], ["Stylist", 25000], ["Makeup artist", 25000], ["Delivery in 48 hours", 30000]],
};

/** How prices compare with Lagos. Places not listed use the smaller-city guide. */
const PRICE_SCALE: Record<string, number> = { Lagos: 1, FCT: 1, Rivers: 0.9 };
export function priceScale(state: string): number {
  return PRICE_SCALE[state] ?? 0.75;
}

/** Rounded to ₦500, never below ₦500. */
export function roundNaira(n: number): number {
  return Math.max(500, Math.round(n / 500) * 500);
}

/** A typical travel fee for home service in this state. */
export function travelFeeFor(state: string): number {
  const k = priceScale(state);
  return k >= 1 ? 5000 : k >= 0.9 ? 4000 : 3000;
}

export interface PresetExtra extends ServiceExtra {
  /** Shown ticked off: extras are offered only when the owner chooses them. */
  on: boolean;
}

/** One service on the setup screen: ticked or not, with the owner's prices. */
export interface PresetService {
  trade: TradeId;
  on: boolean;
  item: ServiceItem;
}

/** The services and extras a new business starts with: the first three of each trade ticked. */
export function presetServices(trades: TradeId[], state: string): { services: PresetService[]; extras: PresetExtra[] } {
  const k = priceScale(state);
  const services: PresetService[] = [];
  const extras: PresetExtra[] = [];
  for (const t of trades) {
    SERVICES[t].forEach((p, i) => {
      const options: ServiceOption[] | undefined = p.options?.map(([label, price, minutes]) => ({ label, price: roundNaira(price * k), minutes }));
      const price = options ? Math.min(...options.map((o) => o.price)) : roundNaira((p.price ?? 0) * k);
      const minutes = options ? Math.min(...options.map((o) => o.minutes)) : p.minutes;
      services.push({
        trade: t,
        on: i < 3,
        // Grouped by trade from the start ("Makeup", "Photography"), so a long list has tabs.
        item: { name: p.name, group: TRADES.find((x) => x.id === t)?.name, price, priceKind: "fixed", minutes, duration: minutes ? durationLabel(minutes) : undefined, options, eventDay: p.eventDay || undefined, perPerson: p.perPerson || undefined },
      });
    });
    for (const [name, price] of EXTRAS[t]) if (!extras.some((x) => x.name === name)) extras.push({ name, price: roundNaira(price * k), on: false });
  }
  return { services, extras };
}

/** "45 min", "2 hours", "1h 30m". */
export function durationLabel(m: number): string {
  if (m < 60) return `${m} min`;
  if (m % 60 === 0) return `${m / 60} hour${m === 60 ? "" : "s"}`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** The suggested deposit: 30% (docs/OWNER_JOURNEYS.md decision 1). Event days take 50%. */
export const SUGGESTED_DEPOSIT_PERCENT = 30;
export const EVENT_DEPOSIT_PERCENT = 50;

/** What a deposit comes to on a price: rounded up to ₦500, at least ₦1,000, never above the price. */
export function depositOn(price: number, choice: { mode: "percent"; percent: number } | { mode: "fixed"; amount: number }): number {
  if (price <= 0) return 0;
  const raw = choice.mode === "fixed" ? choice.amount : Math.ceil((price * choice.percent) / 100 / 500) * 500;
  return Math.min(price, Math.max(1000, raw));
}

/** The booking rules a new business starts with (decision 2: filled in, the owner changes any line). */
export function presetRules(workPlace: WorkPlace, hasEventDays: boolean): string[] {
  const rules = [
    "Please come on time. If you're more than 30 minutes late, we may not be able to see you and the deposit stays with us.",
    "To move your booking, tell us at least 24 hours before.",
    "If you cancel or don't come, the deposit is not refunded.",
  ];
  if (workPlace !== "shop") rules.push("For home visits, please be ready at the time you booked.");
  if (hasEventDays) rules.push(`Wedding and event days need a ${EVENT_DEPOSIT_PERCENT}% deposit to hold the date.`);
  return rules;
}

/** The category the rest of Tikka reads: Photography for photographers, videographers and content studios, else Beauty. */
export function tradeCategory(trades: TradeId[]): "Beauty" | "Photography" {
  return trades.length > 0 && trades.every((t) => t === "photo" || t === "video" || t === "content") ? "Photography" : "Beauty";
}

/** How far a business that goes to customers will travel, nearest first. */
export const TRAVEL_REACHES: TravelReach[] = ["area", "city", "state", "nigeria"];

/** "Anywhere in Ibadan". */
export function reachLabel(reach: TravelReach, place: { area: string; city: string; state: string }): string {
  if (reach === "nigeria") return "Anywhere in Nigeria";
  return reach === "area" ? `Around ${place.area || place.city}` : reach === "city" ? `Anywhere in ${place.city}` : `Anywhere in ${place.state}`;
}

/** Under the travel fee once they go beyond their state. */
export const farTripHint = (state: string) => `For trips outside ${state}, agree any extra with the customer on WhatsApp before they book.`;

/** Opening hours from the three rows on the setup screen; Mon–Sat 9am–6pm to start. */
export const START_HOURS: OpeningHours = {
  weekdays: { open: true, from: "09:00", to: "18:00" },
  saturday: { open: true, from: "09:00", to: "18:00" },
  sunday: { open: false, from: "12:00", to: "17:00" },
};
