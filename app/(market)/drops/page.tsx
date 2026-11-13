import type { Metadata } from "next";
import { Activity, CalendarClock, Flame, Gem, LayoutGrid, MapPin, Search, Store, Trophy } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { CityChips } from "@/components/market/CityChips";
import { DropTile } from "@/components/market/DropTile";
import { CategoryGrid, Featured, JustClaimed, Rail, RankList, SellBand, StatStrip, Ticker, TopBusinesses, TopCities } from "@/components/market/HomeBits";
import { RankTabs } from "@/components/market/RankTabs";
import { getMarketPins, getMarketplaceDrops } from "@/lib/data";
import { areasIn, cityLabel, inCity, marketStats, rankings, recentClaims, topBusinesses, topCities, type CityId } from "@/lib/market";
import { rememberedCity } from "@/lib/market-server";
import { CATEGORIES } from "@/lib/nigeria";
import type { MarketDrop } from "@/lib/types";

export const metadata: Metadata = {
  title: "Drops near you",
  description: "Live Tikka drops from businesses across Nigeria. Tear one open and see what you get.",
};

function Panel({ title, icon, children, action }: { title: string; icon: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-[20px] border border-line bg-surface-raised p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-title flex items-center gap-2 text-[17px]">
          {icon}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

async function Home({ searchParams }: { searchParams: PageProps<"/drops">["searchParams"] }) {
  const [all, pins, city, sp] = await Promise.all([getMarketplaceDrops(), getMarketPins(), rememberedCity(), searchParams]);
  const now = new Date();
  const area = typeof sp.area === "string" ? sp.area : undefined;
  const inThisCity = all.filter((d) => inCity(d, city) && (!area || d.area === area));
  const here: MarketDrop[] = inThisCity.length > 0 ? inThisCity : all;
  const fellBack = inThisCity.length === 0 && city !== "all";
  const shownCity: CityId = fellBack ? "all" : city;
  const where = shownCity === "all" ? "across Nigeria" : shownCity === "other" ? "in other cities" : `in ${area ? `${area}, ` : ""}${cityLabel(shownCity)}`;

  // Featured is nationwide: admin pins first, then whatever is hottest.
  const byId = new Map(all.map((d) => [d.id, d]));
  const featured = pins.flatMap((pin) => (byId.get(pin.dropId) ? [{ pin, d: byId.get(pin.dropId)! }] : []));
  // A small city still gets a full page: any list that's thin locally shows Nigeria-wide, and says so.
  const local = shownCity !== "all";
  const pick = <T,>(mine: T[], everywhere: T[], min: number) => (mine.length >= min || !local ? { list: mine, wide: false } : { list: everywhere, wide: true });
  const liveOf = (xs: MarketDrop[]) => xs.filter((d) => d.status === "live" && d.left > 0);
  const hotOf = (xs: MarketDrop[]) => [...liveOf(xs)].sort((a, b) => b.claimsLastHour - a.claimsLastHour).slice(0, 10);
  const legendaryOf = (xs: MarketDrop[]) => liveOf(xs).filter((d) => d.legendaryLeft > 0).sort((a, b) => b.legendaryLeft - a.legendaryLeft).slice(0, 10);
  const soonOf = (xs: MarketDrop[]) => xs.filter((d) => d.status === "scheduled").sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const rankPick = pick(liveOf(here), liveOf(all), 5);
  const ranks = rankings(rankPick.wide ? all : here, now);
  const hot = pick(hotOf(here), hotOf(all), 3);
  const legendary = pick(legendaryOf(here), legendaryOf(all), 3);
  const soon = pick(soonOf(here), soonOf(all), 3);
  const sub = (text: string, wide: boolean) => (wide ? `${text}, across Nigeria` : text);
  const claims = recentClaims(all, now, 24);
  const categoryCounts = CATEGORIES.map((c) => ({ category: c, live: all.filter((d) => d.category === c && d.status === "live").length }));
  const cityQ = `city=${shownCity}`;

  return (
    <>
      {/* The live hero: ticker, headline numbers and the featured carousel, on the night stage. */}
      <div className="stage bg-night text-on-night" data-theme="light">
        <Ticker claims={claims} now={now} />
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-5 px-4 pb-8 pt-6 sm:px-6">
          <div>
            <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-on-night-muted">
              <span className="counter__dot" aria-hidden="true" />
              Live on Tikka right now
            </p>
            <h1 className="text-display-lg mt-2 max-w-2xl text-[34px] leading-[38px] sm:text-[44px] sm:leading-[48px]">Tear open something good today.</h1>
          </div>
          <StatStrip stats={marketStats(all)} />
          {featured.length > 0 && <Featured items={featured} now={now} />}
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-7 px-4 pt-6 sm:px-6">
        <div className="grid gap-3">
          <form action="/drops/search" className="flex min-h-12 items-center gap-2 rounded-pill border border-line-strong bg-surface-raised px-4">
            <Search size={18} className="shrink-0 text-ink-muted" aria-hidden="true" />
            <label htmlFor="market-q" className="sr-only">
              Search drops
            </label>
            <input id="market-q" name="q" placeholder="Search a business, area or drop" enterKeyHint="search" className="h-11 min-w-0 flex-1 bg-transparent text-[16px] outline-none" />
          </form>
          <CityChips city={city} areas={areasIn(all, city)} area={area} />
          {fellBack && (
            <p className="text-body rounded-card border border-dashed border-line-strong bg-surface-raised p-4">
              No drops {area ? `in ${area}` : `in ${city === "other" ? "other cities" : cityLabel(city)}`} right now. Here&apos;s what&apos;s on across Nigeria.
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-7 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <div className="grid min-w-0 gap-8">
            <section className="grid gap-1">
              <div className="flex items-end justify-between gap-3">
                <h2 className="text-title flex items-center gap-2">
                  <Trophy size={20} className="text-brand" aria-hidden="true" />
                  Top drops today
                </h2>
                <Link href={`/drops/all?${cityQ}&sort=trending&status=live`} className="text-label text-brand">
                  See all
                </Link>
              </div>
              <p className="text-caption mb-2 text-ink-muted">Ranked live {rankPick.wide ? "across Nigeria" : where}.</p>
              <RankTabs
                tabs={[
                  { id: "trending", label: "Trending", panel: <RankList drops={ranks.trending} now={now} metric="hour" /> },
                  { id: "most", label: "Most claimed", panel: <RankList drops={ranks.most} now={now} metric="day" /> },
                  { id: "ending", label: "Ending soon", panel: <RankList drops={ranks.ending} now={now} metric="ends" /> },
                  { id: "new", label: "Newest", panel: <RankList drops={ranks.new} now={now} metric="new" /> },
                ]}
              />
            </section>

            {hot.list.length >= 3 && (
              <Rail title="Hot right now" icon={<Flame size={20} className="text-rarity-legendary" aria-hidden="true" />} subtitle={sub("Claimed the most in the last hour", hot.wide)} href={`/drops/all?${hot.wide ? "city=all" : cityQ}&sort=trending&status=live`}>
                {hot.list.map((d) => (
                  <li key={d.id}>
                    <DropTile d={d} now={now} />
                  </li>
                ))}
              </Rail>
            )}

            {legendary.list.length >= 3 && (
              <Rail title="Legendary hunt" icon={<Gem size={20} className="text-rarity-legendary" aria-hidden="true" />} subtitle={sub("Legendary Tikkas still unclaimed", legendary.wide)} href={`/drops/all?${legendary.wide ? "city=all" : cityQ}&legendary=1&status=live&sort=trending`}>
                {legendary.list.map((d) => (
                  <li key={d.id}>
                    <DropTile d={d} now={now} />
                  </li>
                ))}
              </Rail>
            )}

            {/* Even one: a scheduled drop is only on the marketplace through this row. */}
            {soon.list.length > 0 && (
              <Rail title="Coming soon" icon={<CalendarClock size={20} className="text-brand" aria-hidden="true" />} subtitle={sub("Get a WhatsApp message when one opens", soon.wide)} href={`/drops/all?${soon.wide ? "city=all" : cityQ}&status=scheduled`}>
                {soon.list.map((d) => (
                  <li key={d.id}>
                    <DropTile d={d} now={now} />
                  </li>
                ))}
              </Rail>
            )}

            <section className="grid gap-3">
              <h2 className="text-title flex items-center gap-2">
                <LayoutGrid size={20} className="text-brand" aria-hidden="true" />
                Browse by category
              </h2>
              <CategoryGrid counts={categoryCounts} />
            </section>
          </div>

          <aside className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4" aria-label="Around the marketplace">
            <Panel title="Just claimed" icon={<Activity size={18} className="text-success" aria-hidden="true" />} action={<span className="counter__dot" aria-hidden="true" />}>
              <JustClaimed claims={claims} now={now} />
            </Panel>
            <Panel title="Top cities today" icon={<MapPin size={18} className="text-brand" aria-hidden="true" />}>
              <TopCities cities={topCities(all)} />
            </Panel>
            <Panel title="Top businesses today" icon={<Store size={18} className="text-brand" aria-hidden="true" />}>
              <TopBusinesses items={topBusinesses(local && topBusinesses(here).length < 3 ? all : here)} />
            </Panel>
          </aside>
        </div>

        <SellBand />
      </div>
    </>
  );
}

export default function Page(props: PageProps<"/drops">) {
  return (
    <Suspense fallback={<div className="h-[70vh] bg-night" />}>
      <Home searchParams={props.searchParams} />
    </Suspense>
  );
}
