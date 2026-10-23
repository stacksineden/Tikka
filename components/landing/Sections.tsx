import {
  BookOpen,
  DoorOpen,
  Dumbbell,
  Flower2,
  ListChecks,
  ReceiptText,
  QrCode,
  Scissors,
  Stethoscope,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { Spark, Tick } from "@/components/tikka/glyphs";
import { RarityBadge } from "@/components/tikka/RarityBadge";
import { SoloCard } from "@/components/tikka/SoloCard";
import type { CardFace } from "@/components/tikka/TikkaCard";
import { count, nairaShort } from "@/lib/format";
import { fromPrice, priceLabel, type DropPack, type DropTier } from "@/lib/pricing";
import { DropTile } from "@/components/market/DropTile";
import type { MarketDrop } from "@/lib/types";
import { ExampleTag } from "./ExampleTag";
import { FaqLink } from "./FaqLink";
import { HeroCardLoop } from "./HeroCardLoop";

const GLOW: CardFace = {
  name: "Glow Studio",
  initials: "GS",
  category: "Skin & beauty studio",
  area: "Lekki",
  city: "Lagos",
  brandColor: "#9C3B5C",
  onBrandColor: "#FFFFFF",
  verified: true,
  tagline: "Facials, peels and glow-ups since 2019.",
};

function Eyebrow({ children, onNight = false }: { children: React.ReactNode; onNight?: boolean }) {
  return (
    <p className={`text-serial font-mono uppercase ${onNight ? "text-gold" : "text-brand"}`}>{children}</p>
  );
}

/* ---------------------------------------------------------------- Hero */

export function Hero() {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-6 px-4 pb-14 pt-6 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:pb-20 lg:pt-10">
      <div className="max-w-xl">
        <Eyebrow onNight>For businesses across Nigeria</Eyebrow>
        <h1 className="mt-4 text-[40px] font-extrabold leading-[42px] tracking-[-0.03em] text-on-night sm:text-display-xl">
          Turn people who see your business into customers who walk in.
        </h1>
        <p className="text-body-lg mt-5 max-w-lg text-on-night-muted">
          Share a Tikka drop, a collectible reward behind one link. People claim it on WhatsApp and come in to use
          it. You get every name and number, and see exactly what it brought in, in naira.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link href="/sign-up" className="btn btn-paper btn-lg">
            Start free
          </Link>
          <a href="#how-it-works" className="btn btn-lg bg-transparent text-on-night ring-1 ring-on-night-muted/40 hover:bg-night-raised">
            See how it works
          </a>
        </div>
        <ul className="text-label mt-8 flex flex-wrap gap-x-5 gap-y-2 text-on-night-muted">
          {["First drop free", "Customers need no app", "Set up in minutes"].map((t) => (
            <li key={t} className="flex items-center gap-1.5">
              <Tick className="size-4 text-gold" />
              {t}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex justify-center lg:justify-end">
        <HeroCardLoop />
      </div>
    </section>
  );
}

/* ------------------------------------------------ Problem and outcomes */

export function ProblemLine() {
  return (
    <section className="bg-surface px-4 pt-14 sm:px-6 sm:pt-20">
      <p className="text-body-lg mx-auto max-w-2xl text-center text-ink-muted">
        Most people who see your status never come in, and you never find out who they were.
      </p>
    </section>
  );
}

const OUTCOMES: { title: string; body: string; Icon: LucideIcon }[] = [
  { title: "More people through your door.", body: "A reason to come in this week, not someday.", Icon: DoorOpen },
  { title: "A list you can follow up.", body: "Everyone who claimed, with their WhatsApp number, even if they didn't come.", Icon: ListChecks },
  { title: "Know what your promo made you.", body: "Customers, sales and cost per customer, in naira.", Icon: ReceiptText },
];

export function Outcomes() {
  return (
    <section className="bg-surface pt-10 sm:pt-12" aria-label="What you get">
      <ul className="mx-auto grid max-w-6xl gap-4 px-4 sm:px-6 md:grid-cols-3">
        {OUTCOMES.map(({ title, body, Icon }) => (
          <li key={title} className="rounded-card border border-line bg-surface-raised p-5 sm:p-6">
            <span className="grid size-11 place-items-center rounded-md bg-brand-soft text-brand">
              <Icon size={22} aria-hidden="true" />
            </span>
            <h3 className="text-title mt-4">{title}</h3>
            <p className="text-body mt-1.5 text-ink-muted">{body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* -------------------------------------------------------- How it works */

function StepVisualCard() {
  return (
    <div className="relative flex h-full items-center justify-center rounded-md bg-night py-5">
      <ExampleTag onNight className="absolute left-3 top-3" />
      <SoloCard zoom={0.56} face={GLOW} total={600} finish="foil" label="An example Tikka card front" />
    </div>
  );
}

function StepVisualDrop() {
  const rows = [
    { tier: "legendary" as const, n: 10, label: "Free signature facial" },
    { tier: "rare" as const, n: 50, label: "20% off any service" },
    { tier: "thank_you" as const, n: 540, label: "Priority booking" },
  ];
  return (
    <div className="flex h-full flex-col justify-center gap-2.5 rounded-md bg-night p-4 text-on-night">
      <div className="text-serial font-mono uppercase text-on-night-muted">600 Tikkas · ends Sat 31 Oct</div>
      {rows.map((r) => (
        <div key={r.tier} className="flex items-center justify-between gap-2">
          <span className="text-label min-w-0 truncate font-normal">
            <b className="mr-1.5 font-mono text-gold">{r.n}×</b>
            {r.label}
          </span>
          <RarityBadge tier={r.tier} />
        </div>
      ))}
    </div>
  );
}

function StepVisualWhatsApp() {
  return (
    <div className="flex h-full flex-col justify-end gap-2 rounded-md bg-surface-sunken p-4">
      <div className="text-caption ml-auto max-w-[85%] rounded-md rounded-br-sm bg-brand-soft px-3 py-2 text-ink">
        Claim my Tikka from Glow Studio TK-4FQ7
      </div>
      <div className="text-caption max-w-[90%] rounded-md rounded-bl-sm bg-surface-raised px-3 py-2 text-ink shadow-raised">
        🎟 You got a Tikka from Glow Studio! 20% off any service · Rare · Code{" "}
        <span className="font-mono font-bold">GS-7X4QP</span> · till Sat 31 Oct
      </div>
    </div>
  );
}

/** What the real redeem screen shows: never a phone number (rule 4). */
function StepVisualRedeem() {
  return (
    <div className="flex h-full flex-col justify-center gap-2 rounded-md bg-surface-sunken p-3">
      <div className="grid gap-1.5 rounded-md bg-success-soft p-3">
        <span className="text-label flex items-center gap-1.5 text-success">
          <Tick className="size-4" />
          Valid
        </span>
        <span className="text-label text-ink">Tunde A.</span>
        <span className="text-caption text-ink">
          20% off any service · <span className="font-semibold">Rare</span>
        </span>
        <span className="text-caption text-ink-muted">Till Sat 31 Oct</span>
      </div>
      <div className="grid grid-cols-2 gap-1 rounded-pill bg-surface-raised p-1 text-center" aria-hidden="true">
        <span className="text-caption rounded-pill bg-brand py-1 font-semibold text-on-brand">New customer</span>
        <span className="text-caption py-1 text-ink-muted">Been here before</span>
      </div>
      <div className="text-caption rounded-md bg-surface-raised px-3 py-2 text-ink-muted">How much did they spend? (₦)</div>
      <div className="text-label rounded-pill bg-brand py-2 text-center text-on-brand">Confirm</div>
    </div>
  );
}

const STEPS = [
  {
    title: "Pick an offer.",
    body: "Ready-made for your business. Change the details and you're done in minutes.",
    Visual: StepVisualDrop,
  },
  {
    title: "Share one link.",
    body: "Your WhatsApp status, Instagram, or the QR at your counter.",
    Visual: StepVisualCard,
  },
  {
    title: "They claim on WhatsApp.",
    body: "You get their name and number the moment they claim.",
    Visual: StepVisualWhatsApp,
  },
  {
    title: "They come in.",
    body: "Check their code at the counter and record what they spent.",
    Visual: StepVisualRedeem,
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-6 bg-surface py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <Eyebrow>How it works</Eyebrow>
          <h2 className="mt-3 text-heading sm:text-display-lg">One link. More people through your door.</h2>
          <p className="text-body-lg mt-4 text-ink-muted">A status disappears in 24 hours. A Tikka drop keeps working.</p>
        </div>
        <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(({ title, body, Visual }, i) => (
            <li key={title} className="flex flex-col rounded-card border border-line bg-surface-raised p-3">
              <div className="h-[244px]">
                <Visual />
              </div>
              <div className="px-2 pb-3 pt-5">
                <div className="text-serial font-mono uppercase text-ink-muted">Step {i + 1}</div>
                <h3 className="text-title mt-1.5">{title}</h3>
                <p className="text-body mt-2 text-ink-muted">{body}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="text-body mt-6 flex items-start gap-2 text-ink-muted">
          <QrCode className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden="true" />
          Print your Tikka QR for your counter. It always opens your latest drop.
        </p>

        <div className="mt-10 rounded-card border border-line bg-surface-raised p-6 sm:p-8">
          <h3 className="text-title">Then Tikka brings them back</h3>
          <ul className="text-body mt-4 grid gap-3 sm:grid-cols-2">
            {[
              "Ready-made offers for your business. Pick one and go.",
              "Tikka reminds them on WhatsApp before their Tikka runs out.",
              "When they come in, they get a reason to come back.",
              "See what each customer cost you.",
            ].map((t) => (
              <li key={t} className="flex gap-2.5">
                <Tick className="mt-0.5 size-5 shrink-0 text-success" />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------- Every Tikka holds */

export function Tiers() {
  const cards = [
    { tier: "legendary" as const, reward: "Free signature facial", code: "GS-K9MWA", serial: "0087", claimer: "Kemi" },
    { tier: "rare" as const, reward: "20% off any service", code: "GS-7X4QP", serial: "0412", claimer: "Adaeze" },
    { tier: "thank_you" as const, reward: "Priority booking", code: "GS-RT6CE", serial: "0533", claimer: "Tunde" },
  ];
  return (
    <section className="overflow-hidden bg-night py-16 text-on-night sm:py-24">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="max-w-md">
          <Eyebrow onNight>Every Tikka holds something</Eyebrow>
          <h2 className="mt-3 text-heading sm:text-display-lg">Three tiers. Nobody walks away with nothing.</h2>
          <p className="text-body-lg mt-5 text-on-night-muted">
            A few legendary, some rare, and a thank-you for everyone else that still names a real benefit. People
            see what&apos;s inside the drop before they claim, so it feels like a fair surprise, not bait.
          </p>
        </div>
        <div className="grid justify-items-center gap-3">
          <ExampleTag onNight />
        <div className="flex justify-center gap-3 sm:gap-5">
          {cards.map((c, i) => (
            <div key={c.tier} className={i === 1 ? "-translate-y-4" : "translate-y-4"}>
              <SoloCard
                zoom={0.62}
                flipped
                face={GLOW}
                total={600}
                reveal={{ ...c, expiry: "31 Oct" }}
                label={`Example ${c.tier === "thank_you" ? "thank-you" : c.tier} Tikka: ${c.reward}`}
              />
            </div>
          ))}
        </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------- Who it's for */

const AUDIENCE: { title: string; idea: string; Icon: LucideIcon; image?: string }[] = [
  { title: "Salons and barbers", idea: "Free wash with any cut", Icon: Scissors },
  { title: "Spas", idea: "Upgrade to a 90-minute massage", Icon: Flower2 },
  { title: "Gyms", idea: "A free week with a trainer", Icon: Dumbbell },
  { title: "Clinics", idea: "Free consultation", Icon: Stethoscope },
  { title: "Food spots", idea: "Free small chops with any platter", Icon: UtensilsCrossed },
  { title: "Tutors", idea: "A free trial lesson", Icon: BookOpen },
];

export function WhoItsFor() {
  return (
    <section id="who-its-for" className="scroll-mt-6 bg-surface py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <Eyebrow>Who it&apos;s for</Eyebrow>
          <h2 className="mt-3 text-heading sm:text-display-lg">Built for places people walk into.</h2>
          <p className="text-body-lg mt-4 text-ink-muted">
            If your customers come to a counter, a chair or a table, a Tikka gives them a reason to come in this
            week, and gives you their number the moment they claim.
          </p>
        </div>
        <ul className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          {AUDIENCE.map(({ title, idea, Icon }) => (
            <li key={title} className="overflow-hidden rounded-card border border-line bg-surface-raised">
              {/* Photo slot: swap for next/image once the who-its-for photos are in public/landing/. */}
              <div className="relative grid aspect-[16/10] place-items-center bg-brand-soft text-brand">
                <Icon className="size-10" strokeWidth={1.5} aria-hidden="true" />
              </div>
              <div className="p-4">
                <h3 className="text-title text-[17px] leading-6 sm:text-title">{title}</h3>
                <p className="text-label mt-2 flex items-start gap-1.5 font-medium text-gold-text">
                  <Spark className="mt-0.5 size-3.5 shrink-0 text-gold" />
                  <span>
                    <span className="sr-only">Example rare Tikka: </span>
                    {idea}
                  </span>
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ------------------------------------------------------ Example results */

export function ExampleResults({ tiers }: { tiers: DropTier[] }) {
  const medium = tiers.find((t) => t.id === "medium");
  const funnel = [
    { k: "Tikkas in the drop", v: "600" },
    { k: "Claimed on WhatsApp", v: "577" },
    { k: "Came in and redeemed", v: "76" },
    { k: "People to follow up", v: "501" },
  ];
  return (
    <section className="bg-surface pb-16 sm:pb-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="relative overflow-hidden rounded-card border border-line bg-surface-raised">
          <div className="grid gap-10 p-6 sm:p-10 lg:grid-cols-[1fr_1.1fr] lg:items-center">
            <div>
              <ExampleTag />
              <h2 className="mt-4 text-heading sm:text-display-lg">
                This drop brought in <span className="text-gold-text">{nairaShort(1_940_000)}</span>.
              </h2>
              <p className="text-body-lg mt-4 text-ink-muted">
                A salon in Lekki runs a 600-Tikka drop for two weeks and shares the link on its WhatsApp status and
                Instagram. Here&apos;s what that looks like on the drop dashboard.
              </p>
              <p className="text-caption mt-4 text-ink-muted">
                An illustration of how a drop works, not a promise of results.
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md bg-line">
              {funnel.map((f) => (
                <div key={f.k} className="bg-surface-raised p-5">
                  <dt className="text-label text-ink-muted">{f.k}</dt>
                  <dd className="mt-1 text-display-lg tabular-nums">{f.v}</dd>
                </div>
              ))}
              <div className="col-span-2 flex items-center justify-between gap-4 bg-gold-soft p-5">
                <dt className="text-label text-ink">Spent by the 76 who came in</dt>
                <dd className="text-heading tabular-nums">₦1,940,000</dd>
              </div>
              {medium && (
                <div className="col-span-2 flex items-center justify-between gap-4 bg-surface-raised p-5">
                  <dt className="text-label text-ink-muted">Tikka cost</dt>
                  <dd className="text-title tabular-nums">
                    {priceLabel(medium.priceKobo)} <span className="text-label font-normal text-ink-muted">({medium.label})</span>
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- Pricing */

/** The cheapest season pack: "3 drops from ₦12,000". */
function cheapestPack(packs: DropPack[]): DropPack | undefined {
  return [...packs].sort((a, b) => a.priceKobo - b.priceKobo)[0];
}

export function Pricing({ tiers, packs }: { tiers: DropTier[]; packs: DropPack[] }) {
  const free = tiers.find((t) => t.priceKobo === 0);
  const paid = tiers.filter((t) => t.priceKobo > 0).sort((x, y) => x.maxCards - y.maxCards);
  const pack = cheapestPack(packs);
  return (
    <section id="pricing" className="scroll-mt-6 border-t border-line bg-surface-sunken py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <Eyebrow>Pricing</Eyebrow>
          <h2 className="mt-3 text-heading sm:text-display-lg">Start free. Pay per drop after that.</h2>
        </div>
        <div className="mt-10 grid gap-4 lg:grid-cols-2">
          <div className="flex flex-col rounded-card border border-line bg-surface-raised p-6 sm:p-8">
            <h3 className="text-title">Start free</h3>
            <p className="mt-2 text-display-lg">₦0</p>
            <p className="text-body mt-1 text-ink-muted">
              Your business page and your first drop (up to {count(free?.maxCards ?? 200)} Tikkas).
            </p>
            <ul className="text-body mt-6 grid gap-3">
              {[
                "Free business page for your Instagram and WhatsApp bio",
                "Your first drop free",
                "Ready-made offers for your business",
                "Redeem codes at the counter, with staff logins",
                "Live link activity",
                "Listed on the Tikka marketplace",
                "Every person who claims is yours to follow up",
              ].map((t) => (
                <li key={t} className="flex gap-2.5">
                  <Tick className="mt-0.5 size-5 shrink-0 text-success" />
                  {t}
                </li>
              ))}
            </ul>
            <Link href="/sign-up" className="btn btn-lg mt-8 w-full">
              Start free
            </Link>
          </div>
          <div className="flex flex-col rounded-card border border-line bg-surface-raised p-6 sm:p-8">
            <h3 className="text-title">Pay per drop</h3>
            <p className="mt-2 text-display-lg">
              <span className="text-title text-ink-muted">from </span>
              {fromPrice(tiers)}
            </p>
            <p className="text-body mt-1 text-ink-muted">Pay by card or transfer when you publish. No subscription.</p>
            <ul className="mt-6 divide-y divide-line overflow-hidden rounded-md border border-line">
              {paid.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span>
                    <span className="text-body block font-semibold">{t.label}</span>
                    <span className="text-caption block text-ink-muted">Up to {count(t.maxCards)} Tikkas</span>
                  </span>
                  <span className="text-title tabular-nums">{priceLabel(t.priceKobo)}</span>
                </li>
              ))}
            </ul>
            {pack && (
              <p className="text-body mt-4">
                <span className="font-semibold">Season pack:</span> {count(pack.drops)} drops from {priceLabel(pack.priceKobo)}. Use them for Black
                Friday, December and Valentine&apos;s.
              </p>
            )}
            <p className="text-body mt-3">
              If a paid drop brings fewer customers than we promise, your next one is free.{" "}
              <FaqLink id="faq-guarantee">How it works</FaqLink>
            </p>
            <p className="text-caption mt-4 text-ink-muted">Need more than {count(paid.at(-1)?.maxCards ?? 3000)} Tikkas in one drop? Talk to us.</p>
            <p className="text-caption mt-auto pt-6 text-ink-muted">During the pilot, Tikka pays for every WhatsApp message.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- FAQs */

function faqs(tiers: DropTier[], packs: DropPack[]): { id?: string; q: string; a: string }[] {
  const free = tiers.find((t) => t.priceKobo === 0);
  const paid = tiers.filter((t) => t.priceKobo > 0).sort((x, y) => x.maxCards - y.maxCards);
  const pack = cheapestPack(packs);
  const list = (parts: string[]) => (parts.length > 1 ? `${parts.slice(0, -1).join(", ")} or ${parts.at(-1)}` : parts[0] ?? "");
  const prices = paid.map((t) => `${priceLabel(t.priceKobo)} for up to ${count(t.maxCards)}`);
  const promised = paid.filter((t) => t.guaranteeMinRedemptions);
  const thresholds = promised.map((t, i) => `${count(t.guaranteeMinRedemptions!)}${i === 0 ? " customers" : ""} (${t.label.replace(/ drop$/, "")})`);
  return [
    {
      q: "Do my customers need to download anything?",
      a: "No. They open your link, claim with WhatsApp and get their Tikka in their WhatsApp chat. That's it.",
    },
    {
      q: "How do people claim?",
      a: "They tap Claim, WhatsApp opens with a short message to Tikka, and they send it. Their Tikka arrives in the chat with a code they show at your counter.",
    },
    {
      q: "Can one person claim many Tikkas?",
      a: "No. It's one Tikka per WhatsApp number per drop. You can also limit a drop to new customers, or to once every few weeks.",
    },
    {
      q: "What does a thank-you Tikka give people?",
      a: "Something small but real that you choose, like 10% off, a free add-on or priority booking. A thank-you Tikka is never empty.",
    },
    {
      q: "How long do Tikkas last?",
      a: "Usually 14 days from when someone claims, even if your drop ends sooner, so everyone gets time to come in. A short deadline gets more people through the door. You can choose 7 or 30 days instead.",
    },
    {
      q: "Can people from other cities claim my Tikkas?",
      a: "Yes. Tikka works across Nigeria. Someone in Ibadan can find your Lagos drop on the marketplace, claim it, and redeem it next time they're in town, as long as it's before the Tikka expires. Every Tikka shows its expiry date.",
    },
    {
      q: "Can my staff check codes?",
      a: "Yes. Invite them by email. Staff only see the redeem screen: they scan or type a code, check it, and confirm. They never see your list.",
    },
    {
      q: "Who sees my customers' numbers?",
      a: "Only you, the owner. Your staff can check codes at the counter but never see phone numbers or your list.",
    },
    {
      q: "Can I message people about my next drop?",
      a: "You can message anyone who claimed about their Tikka. For future drops, only people who ticked 'Send me future drops' when they claimed. That keeps you within Nigeria's data protection rules and keeps people happy to hear from you.",
    },
    {
      q: "What's the business page?",
      a: "Every business gets a free page at usetikka.com/yourname: your services, prices, photos, reviews, hours and location, plus your live drop. Put it in your Instagram and WhatsApp bio. It's free, always.",
    },
    {
      q: "What's the QR poster?",
      a: "A printable poster, standee and sticker with your own Tikka QR. Put it at your counter or in a partner's shop. It always opens your current drop, or lets people sign up for your next one.",
    },
    {
      q: "What does it cost?",
      a: `Your business page and your first drop (up to ${count(free?.maxCards ?? 200)} Tikkas) are free. After that you pay per drop: ${list(prices)}.${pack ? ` Or buy a season pack of ${count(pack.drops)} drops.` : ""} Pay by card or transfer. No subscription.`,
    },
    {
      id: "faq-guarantee",
      q: "What if my drop doesn't bring customers?",
      a: `If a paid drop brings fewer than ${list(thresholds)} through your door, your next drop of the same size is free. You just need to share it in at least 3 places, like your WhatsApp status, Instagram and the QR at your counter. Once per business.`,
    },
  ];
}

export function Faq({ tiers, packs }: { tiers: DropTier[]; packs: DropPack[] }) {
  return (
    <section id="faq" className="scroll-mt-6 bg-surface py-16 sm:py-24">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_1.6fr]">
        <div>
          <Eyebrow>FAQs</Eyebrow>
          <h2 className="mt-3 text-heading sm:text-display-lg">Questions businesses ask first.</h2>
        </div>
        <div className="divide-y divide-line border-y border-line">
          {faqs(tiers, packs).map((f) => (
            <details key={f.q} id={f.id} className="group scroll-mt-6">
              <summary className="text-title flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-[17px] leading-6 [&::-webkit-details-marker]:hidden">
                {f.q}
                <span
                  aria-hidden="true"
                  className="grid size-8 shrink-0 place-items-center rounded-pill bg-surface-sunken text-ink-muted transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="text-body -mt-1 pb-5 pr-10 text-ink-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ Live drops */

/** Real live drops only (the page decides whether to show it); the count matches the stats bar. */
export function LiveDrops({ drops, liveCount, now }: { drops: MarketDrop[]; liveCount: number; now: Date }) {
  return (
    <section className="border-t border-line bg-surface py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>On the marketplace</Eyebrow>
            <h2 className="mt-3 text-heading">Live on Tikka now</h2>
          </div>
          <p className="text-label flex items-center gap-2 text-ink-muted">
            <span className="counter__dot" aria-hidden="true" />
            {liveCount} drops live across Nigeria
          </p>
        </div>
      </div>
      <ul
        className="mx-auto mt-8 flex max-w-6xl snap-x gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:thin] sm:px-6"
        aria-label="Drops on the Tikka marketplace"
      >
        {drops
          .filter((d) => d.status === "live")
          .sort((a, b) => b.claimsLastHour - a.claimsLastHour)
          .slice(0, 10)
          .map((d) => (
            <li key={d.id}>
              <DropTile d={d} now={now} />
            </li>
          ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------- Final CTA */

export function FinalCta() {
  return (
    <section className="bg-night text-on-night">
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-16 sm:px-6 sm:py-20 md:flex-row md:items-center md:justify-between">
        <div className="max-w-xl">
          <h2 className="text-heading sm:text-display-lg">Your first drop can be live today.</h2>
          <p className="text-body-lg mt-3 text-on-night-muted">
            Pick an offer, share one link, and see who walks in. Free to start.
          </p>
        </div>
        <Link href="/sign-up" className="btn btn-paper btn-lg shrink-0">
          Start free
        </Link>
      </div>
    </section>
  );
}
