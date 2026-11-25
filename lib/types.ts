// Shapes the UI reads. They mirror what the RPCs and views in TECH_PLAN will return,
// so swapping lib/data.ts from JSON to Supabase doesn't touch the components.

export type Tier = "legendary" | "rare" | "thank_you";

export type RewardType = "percent_off" | "naira_off" | "free_item" | "perk" | "action";

/** Card buttons. The social ones (instagram, tiktok, facebook, x, youtube) follow lib/social.ts. */
export type ActionKind = "whatsapp" | "call" | "directions" | "book" | "services" | "instagram" | "tiktok" | "facebook" | "x" | "youtube";

export type Finish = "matte" | "foil" | "holo";

export type DropStatus = "draft" | "scheduled" | "live" | "sold_out" | "ended";

/** Where a visitor came from: `?c=` on the drop link, or "direct" when there's none. "card": a business card scan (docs/BUSINESS_CARDS.md). */
export type Source = "wa" | "ig" | "qr" | "web" | "ads" | "market" | "card" | "direct";

export interface Business {
  id: string;
  slug: string;
  name: string;
  initials: string;
  category: string;
  /** Neighbourhood, e.g. Lekki. Tikka runs across Nigeria, so always shown with the city. */
  area: string;
  city: string;
  state: string;
  brandColor: string;
  onBrandColor: string;
  codePrefix: string;
  /** Square logo, 256px WebP. Until uploaded, the card shows initials. */
  logoUrl?: string;
  background: CardBackground;
  tagline?: string;
  about?: string;
  hours?: OpeningHours;
  verified: boolean;
  rating?: number;
  reviewCount: number;
  actions: { kind: ActionKind; value: string }[];
  services: ServiceItem[];
  /** How customers use their Tikka: at the business, online, or the business comes to them. */
  serveMode?: ServeMode;
  /** The one-page website (PRD A5). Everything optional; empty sections hide. */
  page?: BusinessPage;
  hasVideo: boolean;
  videoPosterUrl?: string;
  /** 30-second MP4. The claim page loads it only when someone taps play. */
  videoUrl?: string;
  /** Street address for Directions and the business page's map link. */
  address?: string;
  /** Photos and short videos on the business page: 20 on the free page, 60 with a paid drop (lib/portfolio.ts). */
  portfolio: PortfolioPhoto[];
  /** Portfolio collections ("Bridal", "Gele"), in the owner's order. Opened by a paid drop. */
  collections?: PortfolioCollection[];
  /** One of the first 20 businesses: founding prices on single drops, for life (set by Tikka). */
  foundingMember: boolean;
  /** Tikka's alerts and the daily summary go here (E.164 or local format); defaults to the Chat button's number. */
  ownerWhatsapp?: string;
  /** The owner's morning summary on WhatsApp; on unless turned off. */
  dailySummary?: boolean;
  /** Demo and sales-seed businesses: never in public counts, tickers, the marketplace or landing strips. */
  isDemo?: boolean;
  /** The guarantee is once per business. */
  guaranteeUsed: boolean;
  /** NEW DIRECTION (demo only for now): the trades picked at setup ("hair", "makeup"…), lib/presets.ts. */
  trades?: string[];
  /** NEW DIRECTION (demo only for now): where the owner works, and home service's fee and reach. */
  workPlace?: WorkPlace;
  travelFee?: number;
  travelReach?: TravelReach;
  /** NEW DIRECTION (demo only for now): the booking rules customers see before they pay. */
  bookingRules?: string[];
  /** NEW DIRECTION (demo only for now): minutes kept free after every booking (clean-up), and extra after a home visit (travel). */
  gapMinutes?: number;
  homeGapMinutes?: number;
}

export interface PortfolioPhoto {
  id: string;
  /** A photo (default) or a short video. */
  kind?: "photo" | "video";
  /** Photo: 1600px WebP. Video: the MP4. */
  url: string;
  /** 400px WebP, shown first in the gallery (a captured frame for videos). */
  thumbUrl: string;
  caption?: string;
  /** Videos: length in seconds (15 at most). */
  seconds?: number;
  /** The collection it sits in; none means "More work". */
  collectionId?: string;
  /** The original's shape in pixels, read at upload (photos uploaded before 27 Nov 2026 have none). */
  width?: number;
  height?: number;
  /** Its main colour, "#rrggbb", read at upload: the Photography page tints the room with it. */
  tone?: string;
  /** Camera settings from the original file, when it had them (lib/photo-meta.ts). */
  camera?: PhotoCamera;
}

/** What the Photography page shows under a photo: "Canon EOS R5 · RF 85mm F1.2 L · f/1.8 · 1/200s · ISO 100". */
export interface PhotoCamera {
  camera?: string;
  lens?: string;
  aperture?: string;
  shutter?: string;
  iso?: string;
}

/** The business page's look: "beauty" (the editorial page) or "photography" (the gallery). Only the look changes. */
export type PageStyle = "beauty" | "photography";

export interface PortfolioCollection {
  id: string;
  name: string;
  /** Its link: usetikka.com/<business>/work/<slug>. Set once, so shared links keep working. */
  slug: string;
  /** The service its Book button asks for, by name. */
  serviceName?: string;
  /** One of its own photos; the first when unset. */
  coverId?: string;
}

export type ServeMode = "in_store" | "online" | "come_to_you";

export interface ServiceItem {
  id?: string;
  name: string;
  /** ₦; null when it's "Ask for price". */
  price: number | null;
  /** "₦25,000", "From ₦15,000" or "Ask for price". */
  priceKind?: "fixed" | "from" | "ask";
  description?: string;
  /** "1 hr", "45 min". */
  duration?: string;
  /** How long it takes, for the booking calendar (docs/BOOKINGS.md). Unset counts as one hour. */
  minutes?: number;
  /** Its own deposit when it differs from the business's (REVENUE_PLAN 5.4); kept through page saves. */
  depositMode?: "none" | "fixed" | "full";
  depositKobo?: number;
  imageUrl?: string;
  /** The part of the photo the card crops around (0–1 each way); the upper third when unset. */
  focal?: { x: number; y: number };
  /** Optional group shown as a tab ("Hair", "Nails") when there's more than one. */
  group?: string;
  /** NEW DIRECTION (demo only for now): choices that change the price and time ("Short / Medium / Long"). */
  options?: ServiceOption[];
  /** NEW DIRECTION (demo only for now): extras the customer can tick when booking ("Add wash"). */
  extras?: ServiceExtra[];
  /** NEW DIRECTION (demo only for now): booked as a whole day with a call time (weddings, shoots). */
  eventDay?: boolean;
  /** NEW DIRECTION: the options are people, not choices ("Bride" once, plus "Each bridesmaid" × n). */
  perPerson?: boolean;
  /** NEW DIRECTION: what the owner asks when someone books this ("Any allergies?"). Up to 3. */
  questions?: string[];
  /** NEW DIRECTION: this service's own time after it, instead of the business's (bridal makeup 30, a wash 0). */
  gapMinutes?: number;
}

export interface ServiceOption {
  label: string;
  price: number;
  minutes: number;
}

export interface ServiceExtra {
  name: string;
  price: number;
}

/** NEW DIRECTION: where the owner works. "shop": customers come; "home": the owner goes to them; "both". */
export type WorkPlace = "shop" | "home" | "both";
/** How far the owner travels for home service. */
export type TravelReach = "area" | "city" | "state";

export interface TeamMember {
  id: string;
  name: string;
  role?: string;
  photoUrl?: string;
}

export interface FaqItem {
  id: string;
  q: string;
  a: string;
}

export interface BusinessPage {
  heroImageUrl?: string;
  /** Where the photo's subject is (0–1), so phones crop around it. */
  heroFocal?: { x: number; y: number };
  headline?: string;
  subline?: string;
  aboutImageUrl?: string;
  showTeam?: boolean;
  team?: TeamMember[];
  showFaqs?: boolean;
  faqs?: FaqItem[];
  showText?: boolean;
  textTitle?: string;
  textBody?: string;
  /** Picked under "More options"; unset follows the category (pageStyle() in lib/page.ts). */
  style?: PageStyle;
  /** The gallery's background, picked under "More options"; unset is dark. */
  galleryTone?: "dark" | "light";
}

export type PatternId = "dots" | "stripes" | "grid" | "sparks";

export type CardBackground =
  | { type: "color" }
  | { type: "pattern"; pattern: PatternId }
  /** 1200×600 WebP, cropped to the cover area. */
  | { type: "photo"; url: string };

export interface DayHours {
  open: boolean;
  from: string; // "09:00"
  to: string; // "19:00"
}

export interface OpeningHours {
  weekdays: DayHours;
  saturday: DayHours;
  sunday: DayHours;
}

export interface Reward {
  tier: Tier;
  type: RewardType;
  label: string;
  action?: string;
  /** The condition under the reward: "When you book makeup at ₦20,000". */
  terms?: string;
  count: number;
}

export interface Drop {
  id: string;
  slug: string;
  name: string;
  status: DropStatus;
  total: number;
  claimed: number;
  redeemed: number;
  revenue: number;
  /** Redemptions where staff typed what the customer spent (the rest add nothing to `revenue`). */
  spendLogged?: number;
  /** Naira paid online (pay links sent on this drop's Tikkas, live payments); already inside `revenue`. */
  paidOnline?: number;
  startsAt: string;
  endsAt: string;
  finish: Finish;
  rewards: Reward[];
  notifyWaiting?: number;
  showOnMarketplace?: boolean;
  /** Set once published; a draft has none. */
  publishedAt?: string;
  /** The drop_tiers row this drop was priced at, and its card ceiling. */
  tierId?: string;
  tierMaxCards?: number;
  paymentStatus?: "free" | "pending" | "paid";
  /** How it was paid for: a drop-without-paying (free, pack, earned, gifted) or a payment. */
  paidWith?: "voucher" | "payment";
  /** The pending payment that will publish this draft. */
  pendingPaymentId?: string;
  /** What the drop is for, and the ready-made offer it started from. */
  goal?: "new_customers" | "bring_back" | "quiet_days";
  templateId?: string;
  /** Days each Tikka lasts after it's claimed (even past the drop's end). */
  validityDays?: number;
  /** Quiet-day drops: codes only work on these days (1 = Monday … 7 = Sunday). */
  validWeekdays?: number[] | null;
  /** The next-visit Tikka sent after redeeming: how it reads and how long it lasts. */
  bounceBack?: { reward: string; validityDays: number } | null;
  /** Typed-in claims need the WhatsApp check at the counter (page-claim mode). On unless turned off. */
  counterCheck?: boolean;
  ignoredWarnings?: string[];
  /** Marketplace ranking (drop_activity): claims in the last hour and the last 24 hours. */
  claimsLastHour?: number;
  claims24h?: number;
}

/** A drop as the public claim page sees it. Never the deck or its order (rule 1). */
export interface PublicDrop {
  id: string;
  slug: string;
  name: string;
  status: Exclude<DropStatus, "draft">;
  total: number;
  left: number;
  startsAt: string;
  endsAt: string;
  finish: Finish;
  contents: { legendary: number; rare: number; thankYou: number };
  /** "What's in this drop": how many of each reward, by tier. */
  items: { tier: Tier; count: number; reward: string }[];
  /** "Every Tikka holds something. One per WhatsApp number." */
  note: string;
  /** Page-claim mode: staff check the claimer's WhatsApp at the counter, so the page says so. */
  counterCheck: boolean;
}

/** One claimer's card: only ever sent to the visitor who claimed it. */
export interface ClaimedCard {
  token: string;
  /** "bounce_back": the next-visit Tikka sent after redeeming. */
  kind?: "drop" | "bounce_back";
  tier: Tier;
  reward: string;
  /** Action cards: "Follow @glowstudio on Instagram and show it at the counter". */
  instruction?: string;
  /** Action cards: what they do, for the staff tick ("Follow @glowstudio on Instagram"). */
  action?: string;
  /** The reward's condition, printed under it: "When you book makeup at ₦20,000". */
  terms?: string;
  code: string;
  serial: string;
  total: number;
  claimer: string;
  expiresAt: string;
  /** False when it was claimed on the page with a typed number: it isn't in their WhatsApp. */
  confirmed?: boolean;
  /** Typed in with the counter check on, and not checked yet: "Bring the phone with this WhatsApp". */
  counterCheck?: boolean;
}

/** Link activity (TECH_PLAN §12). */
export type EventKind = "view" | "unwrap" | "claim_tap" | "claim_continue" | "claim_completed" | "redeemed" | "reviewed" | "followup_tap";

/** Where a claimed card stands, for the card page and the claim page. */
export interface CardStatus {
  redeemedAt?: string;
  expired: boolean;
  /** The visit plan, and the days it can be planned for (quiet-day drops: their days only). */
  plannedVisitDate?: string;
  plannedVisitPart?: "morning" | "afternoon" | "evening";
  visitOptions?: { date: string; label: string }[];
  /** After redeeming: the next-visit Tikka, if the drop has one. */
  nextVisit?: { token: string; reward: string; expiresAt: string; redeemedAt?: string };
  review: "open" | "not_redeemed" | "reviewed" | "closed";
}

export interface Lead {
  id: string;
  name: string;
  phone: string;
  /** Every lead goes to the owner in full: first name, WhatsApp number, reward, status. */
  status: "claimed" | "redeemed";
  isNew: boolean;
  fromMarketplace: boolean;
  /** Where they came from (`?c=` on the link they claimed through). */
  source: Source;
  tier: Tier;
  reward: string;
  dropId: string;
  claimedAt: string;
  /** When their Tikka was used at the counter. */
  redeemedAt?: string;
  spent?: number;
  /** The owner's last "Message on WhatsApp" tap. */
  lastFollowupAt?: string;
  /** Ticked "Send me future drops": drop-live alerts may go to them (rule 12). */
  marketingOptIn?: boolean;
  /** When their Tikka expires, and their visit plan. */
  expiresAt?: string;
  plannedVisitDate?: string;
  plannedVisitPart?: "morning" | "afternoon" | "evening";
  /** False when the number was typed on the page, not proven on WhatsApp. */
  phoneConfirmed?: boolean;
  /** A typed number that passed the WhatsApp check at the counter. */
  counterChecked?: boolean;
  /** When the owner gave this Tikka its one extra week ("Give more time"). */
  extendedAt?: string;
}

export type ActivityEvent =
  /** `day`: every open on an earlier day, folded into one line ("12 people opened your link · Sat 7 Nov"). */
  | { id: string; kind: "views"; count: number; source?: Source; at: string; day?: true }
  | { id: string; kind: "claim"; name: string; tier: Tier; at: string }
  | { id: string; kind: "redeem"; name: string; amount?: number; at: string }
  | { id: string; kind: "review"; name: string; rating: number; at: string };

export interface Review {
  id: string;
  name: string;
  rating: number;
  text?: string;
  dropName: string;
  at: string;
  /** Reported reviews stay visible until Tikka decides (PRD B9); only the owner sees hidden ones. */
  status?: "visible" | "reported" | "hidden";
}

/** A drop tile on the marketplace (TECH_PLAN §13, the marketplace_drops view). */
export interface MarketDrop {
  id: string;
  dropSlug: string;
  dropName: string;
  businessName: string;
  businessSlug: string;
  initials: string;
  brandColor: string;
  onBrandColor: string;
  category: string;
  area: string;
  city: string;
  state: string;
  total: number;
  left: number;
  legendary: number;
  rare: number;
  /** Legendary Tikkas still unclaimed ("Legendary inside"). */
  legendaryLeft: number;
  status: "live" | "scheduled";
  startsAt: string;
  endsAt: string;
  publishedAt: string;
  claimsLastHour: number;
  claims24h: number;
  claimed: number;
  thankYou: number;
  /** Notify-me subscribers waiting (a count only). */
  waiting: number;
  rating?: number;
  logoUrl?: string;
}

/** An admin pin on the marketplace (marketplace_pins), e.g. the featured carousel. */
export interface MarketPin {
  dropId: string;
  headline: string;
  blurb: string;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: "owner" | "staff";
  /** DEMO: staff's business, standing in for business_members until M1. */
  businessOwnerId?: string;
  /** DEMO: stands in for profiles.is_admin until M1 (the demo owner is Tikka's admin). */
  isAdmin?: boolean;
  // false until the welcome tour is done; true sends a fresh account through it
  isNew: boolean;
}
