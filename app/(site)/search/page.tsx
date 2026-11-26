import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { BizCard } from "@/components/home/BizCard";
import { HomeHeader } from "@/components/home/HomeHeader";
import { SearchBox } from "@/components/home/SearchBox";
import { SiteFooter } from "@/components/site/SiteChrome";
import { parseSearch, searchHref, whatLabel, whenLabel, type SearchQuery } from "@/lib/search";
import { searchBusinesses } from "@/lib/search-db";

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

async function Results({ searchParams }: { searchParams: PageProps<"/search">["searchParams"] }) {
  await connection();
  const now = new Date();
  const s = parseSearch(await searchParams);
  const keep = (list: Awaited<ReturnType<typeof searchBusinesses>>) => list.filter((b) => (!s.home || b.comesToYou) && (!s.nodep || !b.deposit));
  const found = keep(await searchBusinesses({ ...s, limit: 48 }, now));
  // Nobody here yet: say so, then who's free soonest anywhere, people who come to you first.
  // The same kind of business anywhere first; if there's none yet, anyone free soonest.
  const at = (iso?: string) => (iso ? Date.parse(iso) : Number.POSITIVE_INFINITY);
  const soonest = (list: typeof found) => list.sort((a, b) => Number(b.comesToYou) - Number(a.comesToYou) || at(a.nextFree) - at(b.nextFree));
  let fallback: typeof found = [];
  if (!found.length) {
    fallback = keep(await searchBusinesses({ q: s.q, trade: s.trade, limit: 12 }, now));
    if (!fallback.length && (s.q || s.trade)) fallback = keep(await searchBusinesses({ limit: 12 }, now));
    fallback = soonest(fallback);
  }
  const where = s.where ? ` in ${s.where}` : "";

  return (
    <>
      <div className="sticky top-16 z-30 border-b border-line bg-surface py-3">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SearchBox initial={s} variant="bar" />
          <div className="mt-3 flex gap-2 overflow-x-auto [scrollbar-width:none]">
            <Filter s={s} k="home" label="Comes to you" />
            <Filter s={s} k="nodep" label="No deposit" />
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
        {found.length > 0 ? (
          <>
            <p className="mt-4 text-[14px] text-ink-muted">
              {found.length} {found.length === 1 ? "place" : "places"}
              {where} · {whenLabel(s)}
            </p>
            <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {found.map((b) => (
                <BizCard key={b.slug} b={b} now={now} wide />
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="mt-6 rounded-card border border-line bg-surface-raised p-5.5">
              <h2 className="mb-1.5 text-[18px] font-bold">
                {s.where ? `Nobody in ${s.where} yet` : `Nobody free ${s.when === "any" ? "for that" : whenLabel(s).toLowerCase()} yet`}
              </h2>
              <p className="leading-normal text-ink-muted">
                {s.where ? `Tikka is new there. Here's who's free soonest, including people who come to you.` : "Try another day, or here's who's free soonest."}
              </p>
            </div>
            {fallback.length > 0 && (
              <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {fallback.map((b) => (
                  <BizCard key={b.slug} b={b} now={now} wide />
                ))}
              </div>
            )}
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
