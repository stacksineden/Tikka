import type { Metadata } from "next";
import { Suspense } from "react";
import { MarketGrid } from "@/components/market/MarketGrid";
import { getMarketplaceDrops } from "@/lib/data";
import { gridFilters } from "@/lib/market-server";

export const metadata: Metadata = { title: "Search drops", robots: { index: false } };

async function Results({ searchParams }: { searchParams: PageProps<"/drops/search">["searchParams"] }) {
  const [drops, sp] = await Promise.all([getMarketplaceDrops(), searchParams]);
  // Search looks across Nigeria unless a city is picked.
  const f = await gridFilters({ city: "", ...sp });
  return <MarketGrid drops={drops} filters={f} now={new Date()} heading={f.q ? `Drops matching “${f.q}”` : "Search drops"} />;
}

export default function Page(props: PageProps<"/drops/search">) {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-5 sm:px-6 sm:pt-8">
      <Suspense fallback={<div className="h-[70vh]" />}>
      <Results searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}
