import { ArrowRight, CalendarCheck, Car, Check, Clock3, Globe, Layers, QrCode, ReceiptText, Smartphone, Users, Wallet, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { Tick } from "@/components/tikka/glyphs";
import { CustomerVisual, DepositVisual, TodayVisual, WebsiteVisual } from "./FeatureVisuals";
import { HeroDemo } from "./HeroDemo";
import { count } from "@/lib/format";
import { paidTier, priceLabel, type DropPack, type DropTier } from "@/lib/pricing";

// "For businesses" (usetikka.com/business), the wording agreed in docs/BUSINESS_PAGE_COPY.md: the
// website people book from, deposits, Today and Money, the customer list, drops for new customers,
// pricing (read from drop_tiers and drop_packs, so it follows /admin), FAQs. Plain and numeric
// (design/BRAND.md), no gambling words, naira as ₦.

function Eyebrow({ children, onNight = false }: { children: React.ReactNode; onNight?: boolean }) {
  return <p className={`text-serial font-mono uppercase ${onNight ? "text-gold" : "text-brand"}`}>{children}</p>;
}

/* ---------------------------------------------------------------- Hero */

export function BizHero() {
  return (
    <section className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] items-center gap-8 px-5 pt-4 pb-10 sm:gap-10 sm:pt-6 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-6 lg:pb-14">
      <div className="max-w-xl">
        {/* Phones get the short version of everything above the demo (one look, then the phone). */}
        <Eyebrow onNight>
          <span className="sm:hidden">Beauty and photo businesses</span>
          <span className="hidden sm:inline">For hair, makeup, nails, lashes and photographers across Nigeria</span>
        </Eyebrow>
        <h1 className="mt-3 text-[34px] leading-[38px] sm:mt-4 font-extrabold tracking-[-0.03em] text-on-night sm:text-display-xl sm:leading-[58px] sm:tracking-[-0.025em]">
          Turn &ldquo;How much?&rdquo; into a paid booking
        </h1>
        <p className="text-body-lg mt-4 max-w-lg text-on-night-muted sm:mt-5">
          A free website people book from, with deposits that stop no-shows.<span className="hidden sm:inline"> And knowing what you made each week. All from your phone.</span>
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3 sm:mt-8">
          <Link href="/sign-up" className="btn btn-paper btn-lg">
            Start free
          </Link>
          <a href="#website" className="btn btn-lg bg-transparent text-on-night ring-1 ring-on-night-muted/40 hover:bg-night-raised">
            See how it works
          </a>
        </div>
        <ul className="text-label mt-8 hidden flex-wrap gap-x-5 gap-y-2 text-on-night-muted sm:flex">
          {["Free website and bookings", "Deposits go straight to your bank", "Customers need no app"].map((t) => (
            <li key={t} className="flex items-center gap-1.5">
              <Tick className="size-4 text-gold" />
              {t}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex justify-center lg:justify-end">
        <HeroDemo />
      </div>
    </section>
  );
}

export function BizProblem() {
  return (
    <section className="border-b border-line bg-surface px-5 py-10 sm:px-6 sm:py-14">
      <p className="mx-auto max-w-3xl text-center text-[22px] leading-[30px] font-bold text-balance sm:text-heading">
        Right now, people see your work on Instagram and WhatsApp, ask the price in your DMs, then disappear. Or they book and don&apos;t come.
      </p>
    </section>
  );
}

/* ---------------------------------------------------------------- Features */

function Feature({
  id,
  eyebrow,
  title,
  body,
  points,
  small,
  Icon,
  visual,
  flip = false,
}: {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  points: { text: string; Icon: LucideIcon }[];
  small?: string;
  Icon: LucideIcon;
  /** A drawn screen of the feature (FeatureVisuals.tsx). */
  visual: React.ReactNode;
  flip?: boolean;
}) {
  return (
    <section id={id} className={`scroll-mt-6 px-5 py-14 sm:px-6 sm:py-20 ${flip ? "bg-surface-sunken" : "bg-surface"}`}>
      <div className={`mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2 lg:gap-16 ${flip ? "lg:[&>*:first-child]:order-2" : ""}`}>
        <div>
          <span className="grid size-12 place-items-center rounded-card bg-brand-soft text-brand">
            <Icon size={24} aria-hidden="true" />
          </span>
          <div className="mt-5">
            <Eyebrow>{eyebrow}</Eyebrow>
          </div>
          <h2 className="mt-3 text-heading sm:text-display-lg">{title}</h2>
          <p className="text-body-lg mt-4 max-w-xl text-ink-muted">{body}</p>
          <ul className="mt-5 sm:mt-6 grid max-w-xl gap-3">
            {/* Phones: the first two; the picture shows the rest. */}
            {points.map(({ text, Icon: P }, i) => (
              <li key={text} className={`text-body items-start gap-3 ${i < 2 ? "flex" : "hidden sm:flex"}`}>
                <P size={20} className="mt-0.5 shrink-0 text-brand" aria-hidden="true" />
                {text}
              </li>
            ))}
          </ul>
          {small && <p className="text-caption mt-5 max-w-xl text-ink-muted">{small}</p>}
        </div>
        <div className="pt-3">{visual}</div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- How it starts */

export function BizSteps() {
  const steps = [
    ["Pick what you do", "Your services and prices come filled in for your trade and your city. Change anything."],
    ["Share your link", "Put it in your Instagram and WhatsApp bio, and answer “How much?” with it."],
    ["Get booked and paid", "Customers pick a free time and pay the deposit. You see it on Today."],
  ];
  return (
    <section className="bg-surface px-5 pt-12 pb-2 sm:px-6 sm:pt-16">
      <div className="mx-auto max-w-6xl">
        <Eyebrow>How it starts</Eyebrow>
        <h2 className="mt-3 text-heading sm:text-display-lg">Live in about 10 minutes, from your phone</h2>
        <ol className="mt-8 grid gap-4 md:grid-cols-3">
          {steps.map(([t, d], i) => (
            <li key={t} className="rounded-card border border-line bg-surface-raised p-5">
              <span className="text-serial grid size-9 place-items-center rounded-pill bg-ink font-mono text-surface">{i + 1}</span>
              <h3 className="text-title mt-4">{t}</h3>
              <p className="text-body mt-1.5 text-ink-muted">{d}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function BizFeatures() {
  return (
    <>
      <Feature
        id="website"
        eyebrow="Your website"
        title="A website people book from, free"
        body="Your page at usetikka.com/yourname: your work, your services and prices, your hours, your reviews. Customers pick a service and a free time, and it's booked. Put the link in your Instagram and WhatsApp bio."
        Icon={Globe}
        visual={<WebsiteVisual />}
        points={[
          { text: "Only your free times show, so nobody books when you're busy", Icon: CalendarCheck },
          { text: "Choices like short, medium or long, each with its own price and time", Icon: Layers },
          { text: "Home visits with your travel fee, and whole days for weddings and shoots", Icon: Car },
          { text: "Six page styles, from soft and light to a photographer's gallery", Icon: Smartphone },
        ]}
      />
      <Feature
        id="deposits"
        eyebrow="Deposits"
        title="No-shows stop costing you"
        body="Customers pay a small deposit to hold their time. It goes straight to your bank the next working day. If they don't come, the deposit is already yours."
        small="Tikka takes 1% of each payment, and Paystack takes its fee. We check your ID before payments switch on."
        Icon={Wallet}
        visual={<DepositVisual />}
        flip
        points={[
          { text: "You pick the deposit: a percentage or a fixed amount, at least ₦1,000", Icon: Wallet },
          { text: "Your booking rules show before they pay, so everyone knows where they stand", Icon: Check },
          { text: "They can move with 24 hours' notice and keep their deposit; cancelling doesn't refund it", Icon: Clock3 },
          { text: "Send a pay link for a balance or a custom job, from your phone", Icon: ReceiptText },
        ]}
      />
      <Feature
        id="today"
        eyebrow="Today and Money"
        title="Know who's coming and what you made"
        body="Open Tikka in the morning and see today: who's coming, who paid their deposit, what's left to collect. Tap Paid when they pay you cash or transfer. On Sunday, see what came in, what you spent and what you kept."
        Icon={CalendarCheck}
        visual={<TodayVisual />}
        points={[
          { text: "Who still owes you, with a reminder you send from your own WhatsApp", Icon: Clock3 },
          { text: "Receipts your customers can keep", Icon: ReceiptText },
          { text: "A note at 8pm: anything you spent today?", Icon: Smartphone },
        ]}
      />
      <Feature
        id="customers"
        eyebrow="Your customers"
        title="Every customer, one list"
        body="Everyone who booked, bought or claimed an offer from you, by their WhatsApp number: their visits, what they spent, your notes and their birthday. When a day is full, they can join your waitlist, and you tell them when a place opens."
        small="Only you see your customers' numbers. Staff who check codes at the counter never do."
        Icon={Users}
        visual={<CustomerVisual />}
        flip
        points={[
          { text: "Notes like “sensitive scalp” or “likes medium length”, kept with each customer", Icon: Users },
          { text: "A birthday (day and month), so you can send a message on the day", Icon: CalendarCheck },
          { text: "A waitlist for full days, with their number ready when a place opens", Icon: Clock3 },
        ]}
      />
    </>
  );
}

/* ---------------------------------------------------------------- Drops */

export function BizDrops() {
  return (
    <section id="drops" className="stage scroll-mt-6 bg-night px-5 py-14 text-on-night sm:px-6 sm:py-20">
      <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <Eyebrow onNight>Drops</Eyebrow>
          <h2 className="mt-3 text-heading text-on-night sm:text-display-lg">Bring in new customers with a drop</h2>
          <p className="text-body-lg mt-4 max-w-xl text-on-night-muted">
            A drop is a limited batch of offers from you: a few big ones, some good ones, and a small thank-you for everyone else. People open one on your link, it lands on their WhatsApp, and they show it at your counter. You get every claimer&apos;s number, and you see what the drop brought in, in naira.
          </p>
          <ul className="mt-6 grid gap-2.5">
            {[
              { t: "Ready-made offers for your trade, so you don't start from nothing", I: Layers },
              { t: "One link for your bio and status, and a QR poster for your counter", I: QrCode },
              { t: "On Tikka's homepage under “Offers near you”", I: Globe },
            ].map(({ t, I }) => (
              <li key={t} className="text-body flex items-start gap-3 text-on-night">
                <I size={20} className="mt-0.5 shrink-0 text-gold" aria-hidden="true" />
                {t}
              </li>
            ))}
          </ul>
        </div>
        {/* The ticket shape, Tikka's signature (design/BRAND.md). */}
        <div aria-hidden="true" className="relative mx-auto aspect-[5/7] w-52 -rotate-6 rounded-card bg-brand shadow-card">
          <div className="absolute inset-x-5 top-6 text-[20px] leading-tight font-bold text-white">Free gele tying with any glam</div>
          <div className="absolute inset-x-0 top-[72%] border-t-2 border-dashed border-white/40" />
          <div className="text-serial absolute inset-x-5 bottom-5 font-mono text-gold uppercase">23 of 100 left</div>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- Pricing */

function cheapestPack(packs: DropPack[]): DropPack | undefined {
  return [...packs].sort((a, b) => a.priceKobo - b.priceKobo)[0];
}

export function BizPricing({ tiers, packs }: { tiers: DropTier[]; packs: DropPack[] }) {
  const drop = paidTier(tiers);
  const pack = cheapestPack(packs);
  const founding = (normal: number, f?: number | null) => (f && f < normal ? ` (founding members ${priceLabel(f)})` : "");
  // Two plain lists: what's free, and what you pay for (docs/BUSINESS_PAGE_COPY.md, revised 26 Nov 2026).
  const free = [
    "Your website at usetikka.com/yourname",
    "Bookings and your calendar",
    "Today and Money",
    "Your customer list",
    "Receipts and business cards",
    "Your first drop",
  ];
  const paid: [string, string][] = [
    ["Deposits and pay links", "1% of each payment, plus Paystack's fee"],
    ...(drop ? ([["Each drop after your first", `${priceLabel(drop.priceKobo)}${founding(drop.priceKobo, drop.foundingPriceKobo)}`]] as [string, string][]) : []),
    ...(pack ? ([[`${count(pack.drops)} drops at once`, `${priceLabel(pack.priceKobo)}${founding(pack.priceKobo, pack.foundingPriceKobo)}`]] as [string, string][]) : []),
  ];
  return (
    <section id="pricing" className="scroll-mt-6 border-t border-line bg-surface-sunken px-5 py-14 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-5xl">
        <Eyebrow>Pricing</Eyebrow>
        <h2 className="mt-3 text-heading sm:text-display-lg">What&apos;s free, and what you pay for</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-card border border-line bg-surface-raised p-6">
            <h3 className="text-title">Free</h3>
            <p className="text-caption mt-1 text-ink-muted">No monthly fee. No card needed to start.</p>
            <ul className="mt-5 grid gap-3">
              {free.map((f) => (
                <li key={f} className="text-body flex items-start gap-2.5">
                  <Check size={20} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-card border border-line bg-surface-raised p-6">
            <h3 className="text-title">Paid</h3>
            <p className="text-caption mt-1 text-ink-muted">Only when money comes in, or when you want new customers.</p>
            <dl className="mt-5 grid gap-4">
              {paid.map(([what, price]) => (
                <div key={what}>
                  <dt className="text-body font-semibold">{what}</dt>
                  <dd className="text-body text-ink-muted">{price}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
        <Link href="/sign-up" className="btn btn-lg mt-8">
          Start free <ArrowRight aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- FAQs and final call */

export function BizFaq({ tiers }: { tiers: DropTier[] }) {
  const drop = paidTier(tiers);
  const faqs: [string, string][] = [
    ["Do my customers need an app?", "No. They book on your page and get a booking pass. Drop offers arrive in WhatsApp."],
    ["How do I get paid?", "Add your ID and bank account in Get paid. Once we've checked your ID, deposits and pay links go straight to your bank the next working day. Tikka never holds your money."],
    ["Who refunds a deposit?", "Tikka doesn't refund payments. If you agree a refund with a customer, send it from your bank. Your booking rules say what happens when someone cancels."],
    ["Can I take bookings without deposits?", "Yes. Deposits are your choice, for every service or just some."],
    ["I work from home, or I go to customers. Does it work?", "Yes. Set where you work, your travel fee and how far you go. Customers give their address when they book."],
    ["Can my staff use it?", "Yes. Invite them to check codes and mark who came. They never see customers' numbers or your money."],
    ["Can people in other cities book me?", "Yes. Tikka is for businesses anywhere in Nigeria, and customers search by city and area."],
    [
      "What does it cost?",
      `The website, bookings and daily tools are free. Payments cost 1% plus Paystack's fee.${drop ? ` Drops are ${priceLabel(drop.priceKobo)} each after your first free one.` : ""}`,
    ],
  ];
  return (
    <section id="faq" className="scroll-mt-6 bg-surface px-5 py-14 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-3xl">
        <Eyebrow>Questions</Eyebrow>
        <h2 className="mt-3 text-heading sm:text-display-lg">Questions businesses ask first</h2>
        <div className="mt-8 divide-y divide-line rounded-card border border-line bg-surface-raised">
          {faqs.map(([q, a]) => (
            <details key={q} className="group px-5">
              <summary className="text-body flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 font-semibold">
                {q}
                <span className="text-xl text-ink-muted transition-transform group-open:rotate-45" aria-hidden="true">
                  +
                </span>
              </summary>
              <p className="text-body pb-4 text-ink-muted">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function BizFinal() {
  return (
    <section className="stage bg-night px-5 py-16 text-center sm:px-6 sm:py-20">
      <h2 className="text-heading text-on-night sm:text-display-lg">Your page can be live today</h2>
      <p className="text-body-lg mx-auto mt-3 max-w-lg text-on-night-muted">Pick what you do, add your services and photos, and share your link. It takes about 10 minutes.</p>
      <Link href="/sign-up" className="btn btn-paper btn-lg mt-7">
        Start free
      </Link>
    </section>
  );
}
