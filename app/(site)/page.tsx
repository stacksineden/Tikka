import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { BizCard } from "@/components/home/BizCard";
import { HomeHeader } from "@/components/home/HomeHeader";
import { SearchBox } from "@/components/home/SearchBox";
import { TRADE_ICONS } from "@/components/home/tradeIcons";
import { SiteFooter } from "@/components/site/SiteChrome";
import { TRADES } from "@/lib/presets";
import { searchHref } from "@/lib/search";
import { searchBusinesses, type BizCard as Card } from "@/lib/search-db";

// The customer homepage (docs/HOMEPAGE_PLAN.md, prototype design/prototypes/homepage.html): the
// search first (what, where, when), then the kinds of business, rows of businesses with their next
// free time, the offers (drops), how it works, and the way in for businesses.

// The homepage's words (decided 26 Nov 2026). One open idea, like Fresha's "selfcare": everything on
// Tikka makes people look good or feel good (salons to med spas, photographers to content studios),
// so no kind of business reads it as "not for me". It starts with "Book" so it's clear what the site
// does; the subline shows the range and what only Tikka does in Nigeria (prices and free times
// upfront, no "How much?" in the DMs). "Stop asking 'How much?'" is kept for ads and posters.
const TITLE = "Tikka · Book what makes you look and feel good";
const HEADLINE = "Book what makes you look and feel good";
const SUBLINE = "Salons, barbers, spas, makeup artists, photographers and content studios across Nigeria, with real prices and free times upfront. No more \u201cHow\u00a0much?\u201d in the\u00a0DMs.";
// For search engines and link previews: what's on Tikka, in plain words.
const DESCRIPTION = "Book salons, barbers, spas, makeup artists, photographers and content studios anywhere in Nigeria. See their work, real prices and free times, and book in a minute.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, siteName: "Tikka", type: "website" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

function Row({ title, sub, more, cards, now }: { title: string; sub?: string; more?: string; cards: Card[]; now: Date }) {
  if (!cards.length) return null;
  return (
    <section className="mt-10">
      <div className="mb-3.5 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-[22px] leading-tight font-bold tracking-tight">{title}</h2>
          {sub && <p className="mt-1 text-[14px] text-ink-muted">{sub}</p>}
        </div>
        {more && (
          <Link href={more} className="text-label inline-flex min-h-11 shrink-0 items-center underline underline-offset-4">
            See all
          </Link>
        )}
      </div>
      {/* Swipe on a phone, four across on a computer. */}
      <div className="-mx-4 grid snap-x snap-mandatory auto-cols-[72%] grid-flow-col gap-3.5 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:auto-cols-[42%] lg:mx-0 lg:auto-cols-[calc((100%-42px)/4)] lg:px-0">
        {cards.map((b) => (
          <BizCard key={b.slug} b={b} now={now} />
        ))}
      </div>
    </section>
  );
}

async function Rows() {
  await connection();
  const now = new Date();
  const [soon, top, photo, fresh] = await Promise.all([
    searchBusinesses({ sort: "soonest", limit: 12 }, now),
    searchBusinesses({ sort: "rating", limit: 12 }, now),
    searchBusinesses({ trade: "photo", limit: 12 }, now),
    searchBusinesses({ sort: "new", limit: 12 }, now),
  ]);
  return (
    <>
      <Row title="Free soon" sub="Book a time this week" more={searchHref({ when: "any" })} cards={soon.filter((b) => b.nextFree)} now={now} />
      <Row title="Top rated" cards={top.filter((b) => b.rating)} now={now} />
      <Row title="Photographers" sub="Portraits, birthdays, weddings and graduations" more={searchHref({ trade: "photo" })} cards={photo} now={now} />
      <Row title="New on Tikka" cards={fresh.filter((b) => b.isNew)} now={now} />
    </>
  );
}

export default function HomePage() {
  return (
    <>
      <HomeHeader />
      <main className="overflow-x-clip">
        <div className="mx-auto max-w-6xl px-4 pt-7 pb-2 text-center sm:px-6 md:pt-16">
          <h1 className="mx-auto max-w-[19ch] text-[clamp(34px,7vw,64px)] leading-[1.02] font-bold tracking-[-0.03em]">{HEADLINE}</h1>
          <p className="mx-auto mt-3.5 max-w-[46ch] text-[clamp(16px,2.2vw,20px)] leading-normal text-ink-muted">{SUBLINE}</p>
          <SearchBox />
        </div>

        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <nav aria-label="Kinds of business" className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pt-6 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:justify-center md:px-0 md:pt-9">
            {TRADES.map((t) => {
              const Icon = TRADE_ICONS[t.id];
              return (
                <Link key={t.id} href={searchHref({ trade: t.id })} className="grid min-w-21 shrink-0 snap-start justify-items-center gap-1.5 rounded-md px-1.5 py-2.5 text-[13px] font-semibold text-ink-muted hover:text-ink">
                  <Icon size={26} className="text-ink" aria-hidden="true" />
                  {t.name}
                </Link>
              );
            })}
          </nav>

          <Suspense fallback={<div className="mt-10 h-72 animate-pulse rounded-card bg-surface-sunken" />}>
            <Rows />
          </Suspense>

          <section aria-labelledby="offers-h" className="relative mt-12 grid gap-5 overflow-hidden rounded-[28px] bg-night p-6 text-on-night md:grid-cols-[1.2fr_1fr] md:items-center md:p-10">
            <div>
              <h2 id="offers-h" className="text-[clamp(24px,4vw,34px)] leading-tight font-bold tracking-tight">
                Offers near you
              </h2>
              <p className="mt-2.5 text-[16px] leading-normal text-on-night-muted">
                Limited gifts and discounts from places near you. Claim one in seconds, it lands on your WhatsApp, and you use it when you go.
              </p>
              <Link href="/drops" className="btn mt-5 min-h-12 rounded-pill bg-gold px-6 text-on-gold hover:bg-gold">
                See offers <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </div>
            {/* The ticket shape, Tikka's signature, kept to this one card on the page. */}
            <div aria-hidden="true" className="relative hidden aspect-[5/7] w-48 -rotate-6 justify-self-center rounded-card bg-brand shadow-card md:block">
              <div className="absolute inset-x-4 top-5 text-[18px] font-bold">20% off any service</div>
              <div className="absolute inset-x-0 top-[72%] border-t-2 border-dashed border-white/40" />
              <div className="text-serial absolute inset-x-4 bottom-4 font-mono text-gold uppercase">23 of 100 left</div>
            </div>
          </section>

          <div aria-label="How it works" className="mt-14 grid gap-3.5 md:grid-cols-3">
            {[
              ["Find your person", "See their work, real reviews and prices, near you or coming to you."],
              ["Pick a free time", "Only free times show. A small deposit holds your place and goes straight to them."],
              ["Show up and glow", "Your booking pass has the time, the place and what you've paid. Need to move? Do it from the pass."],
            ].map(([h, p], i) => (
              <div key={h} className="rounded-card border border-line bg-surface-raised p-5.5">
                <span className="grid size-9 place-items-center rounded-pill bg-brand-soft font-bold text-brand">{i + 1}</span>
                <h3 className="mt-3.5 mb-1.5 text-[18px] font-bold">{h}</h3>
                <p className="text-[15px] leading-normal text-ink-muted">{p}</p>
              </div>
            ))}
          </div>

          <section className="mt-14 mb-14 grid gap-4 rounded-[28px] bg-brand-soft p-6 md:grid-cols-[1fr_auto] md:items-center md:p-10">
            <div>
              <h2 className="text-[clamp(22px,3.5vw,30px)] leading-tight font-bold tracking-tight">Stylist, artist or photographer?</h2>
              <p className="mt-2 leading-normal text-ink-muted">Turn &ldquo;How much?&rdquo; into paid bookings: a free website people book from, deposits that stop no-shows, and what you made each week.</p>
            </div>
            <Link href="/business" className="btn btn-lg rounded-pill">
              For businesses
            </Link>
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
