import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { BizCard } from "@/components/home/BizCard";
import { HomeHeader } from "@/components/home/HomeHeader";
import { ResultsMap, type ResultPin } from "@/components/home/ResultsMap";
import { SearchBox } from "@/components/home/SearchBox";
import { SiteFooter } from "@/components/site/SiteChrome";
import { freeLabel, parseSearch, searchHref, whatLabel, whenLabel, whenPhrase, type SearchQuery } from "@/lib/search";
import { searchBusinesses, type BizCard as Card } from "@/lib/search-db";
import { place } from "@/lib/format";
import { TRADES } from "@/lib/presets";

// Search results (docs/HOMEPAGE_PLAN.md): the businesses that match what, where and when, each with
// its next free time; filters for people who come to you and no deposit. A city with nobody yet says
// so plainly and shows who's free soonest, those who come to you first.

export async function generateMetadata({ searchParams }: PageProps<"/search">): Promise<Metadata> {
  const s = parseSearch(await searchParams);
  const what = whatLabel(s) || "Beauty and photo services";
  return { title: `${what}${s.where ? ` in ${s.where}` : ""}`, robots: { index: false, follow: true } };
}

function Filter({ s, k, label }: { s: SearchQuery; k: "home" | "nodep"; label: string }) {
  const on = !!s[k];
  return (
    <Link
      href={searchHref({ ...s, [k]: !on })}
      aria-pressed={on}
      scroll={false}
      className={`inline-flex min-h-11 shrink-0 items-center rounded-pill border px-4 text-[14px] font-semibold ${on ? "border-ink bg-ink text-surface" : "border-line-strong bg-surface-raised"}`}
    >
      {label}
    </Link>
  );
}

/** "₦12k", "₦8,500", "₦1.2m": short enough for a map pin. */
function pinPrice(n?: number): string | undefined {
  if (n == null) return undefined;
  if (n >= 1_000_000) return `₦${+(n / 1_000_000).toFixed(1)}m`;
  if (n >= 10_000) return `₦${Math.round(n / 1000)}k`;
  return `₦${n.toLocaleString("en-NG")}`;
}

function pinsFor(list: Card[], now: Date): ResultPin[] {
  return list
    .filter((b) => b.lat != null && b.lng != null)
    .map((b) => ({
      id: b.slug,
      lat: b.lat!,
      lng: b.lng!,
      label: pinPrice(b.fromNaira) ?? (b.rating != null ? `★ ${b.rating.toFixed(1)}` : b.name.split(" ")[0]),
      href: `/book/${b.slug}`,
      approx: b.approx,
      name: b.name,
      place: place(b.area, b.city),
      coverUrl: b.coverUrl,
      rating: b.rating,
      reviews: b.reviews,
      trade: TRADES.find((t) => b.trades.includes(t.id))?.name ?? b.category,
      free: b.nextFree ? freeLabel(b.nextFree, now) : undefined,
      price: pinPrice(b.fromNaira),
    }));
}

/** The cards, with the map beside them when any of them has a pin. */
function Cards({ list, now }: { list: Card[]; now: Date }) {
  const pins = pinsFor(list, now);
  const grid = (cols: string) => (
    <div className={`mt-4 grid gap-6 sm:grid-cols-2 ${cols}`}>
      {list.map((b) => (
        <div key={b.slug} id={`biz-${b.slug}`} data-biz="">
          <BizCard b={b} now={now} wide />
        </div>
      ))}
    </div>
  );
  return pins.length ? <ResultsMap pins={pins}>{grid("lg:grid-cols-2")}</ResultsMap> : grid("lg:grid-cols-3");
}

async function Results({ searchParams }: { searchParams: PageProps<"/search">["searchParams"] }) {
  await connection();
  const now = new Date();
  const s = parseSearch(await searchParams);
  const keep = (list: Awaited<ReturnType<typeof searchBusinesses>>) => list.filter((b) => (!s.home || b.comesToYou) && (!s.nodep || !b.deposit));
  const found = keep(await searchBusinesses({ ...s, limit: 48 }, now));
  // Nothing matched: widen one step at a time and say exactly what was widened, so the message is
  // always true (never "nobody in Ibadan" when Ibadan has businesses, just not this one that day).
  const at = (iso?: string) => (iso ? Date.parse(iso) : Number.POSITIVE_INFINITY);
  const soonest = (list: typeof found) => list.sort((a, b) => Number(b.comesToYou) - Number(a.comesToYou) || at(a.nextFree) - at(b.nextFree));
  const what = whatLabel(s);
  const asked = what ? what.toLowerCase() : "";
  const timed = s.when !== "any" || !!s.tod;
  let fallback: typeof found = [];
  let empty = { title: "", body: "" };
  if (!found.length) {
    const tries: { q: Partial<SearchQuery>; title: string; body: string }[] = [];
    // 1. Same thing, same place, any day.
    if (timed)
      tries.push({
        q: { q: s.q, trade: s.trade, where: s.where },
        title: `${what ? `No ${asked}` : "Nobody"} free ${whenPhrase(s)}${s.where ? ` in ${s.where}` : ""}`,
        body: what ? `Here's who does it${s.where ? ` in ${s.where}` : ""}.` : `Here's who's free on other days${s.where ? ` in ${s.where}` : ""}.`,
      });
    // 2. Same thing, anywhere (people who come to you first).
    if (s.where && (s.q || s.trade)) tries.push({ q: { q: s.q, trade: s.trade }, title: `Nobody in ${s.where} has ${asked} on Tikka yet`, body: "Here's who has it elsewhere, including people who come to you." });
    // 3. Anyone in that place.
    if (s.where && (s.q || s.trade)) tries.push({ q: { where: s.where }, title: `Nobody in ${s.where} has ${asked} on Tikka yet`, body: `Here's who's in ${s.where}.` });
    // 4. Anyone at all.
    tries.push({ q: {}, title: s.where ? `Nobody in ${s.where} yet` : what ? `Nobody has ${asked} on Tikka yet` : "Nobody free yet", body: s.where ? "Tikka is new there. Here's who's free soonest, including people who come to you." : "Here's who's free soonest." });
    for (const t of tries) {
      const list = keep(await searchBusinesses({ ...t.q, limit: 12 }, now));
      if (list.length) {
        fallback = soonest(list);
        empty = { title: t.title, body: t.body };
        break;
      }
    }
    if (!fallback.length) empty = { title: tries[tries.length - 1].title, body: "Try again soon: new businesses join every week." };
  }
  const where = s.where ? ` in ${s.where}` : "";
  const related = found.filter((b) => b.match === "related").length;

  return (
    <>
      <div data-search-bar="" className="sticky top-16 z-30 border-b border-line bg-surface py-3">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SearchBox initial={s} variant="bar" />
          <div className="mt-3 flex gap-2 overflow-x-auto [scrollbar-width:none]">
            <Filter s={s} k="home" label="Comes to you" />
            <Filter s={s} k="nodep" label="No deposit" />
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:pb-14">
        {found.length > 0 ? (
          <>
            <p className="mt-4 text-[14px] text-ink-muted">
              {found.length} {found.length === 1 ? "place" : "places"}
              {where} · {whenLabel(s)}
            </p>
            {/* Close matches: say so, never pretend they list exactly what was asked. */}
            {s.q && related > 0 && (
              <p className="mt-2 text-[15px]">
                {related === found.length
                  ? `Nobody lists “${s.q}” exactly${where} yet. ${found.length === 1 ? "This does" : "These do"} similar work.`
                  : `${found.length - related} ${found.length - related === 1 ? "lists" : "list"} “${s.q}”. ${related} more ${related === 1 ? "does" : "do"} similar work.`}
              </p>
            )}
            <Cards list={found} now={now} />
          </>
        ) : (
          <>
            <div className="mt-6 rounded-card border border-line bg-surface-raised p-5.5">
              <h2 className="mb-1.5 text-[18px] font-bold">{empty.title}</h2>
              <p className="leading-normal text-ink-muted">{empty.body}</p>
            </div>
            {fallback.length > 0 && <Cards list={fallback} now={now} />}
          </>
        )}
      </div>
    </>
  );
}

export default function SearchPage({ searchParams }: PageProps<"/search">) {
  return (
    <>
      <HomeHeader />
      <main>
        <Suspense fallback={<div className="mx-auto mt-6 h-72 max-w-6xl animate-pulse rounded-card bg-surface-sunken" />}>
          <Results searchParams={searchParams} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}
