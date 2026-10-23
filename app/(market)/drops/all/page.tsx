import type { Metadata } from "next";
import { Suspense } from "react";
import { MarketGrid } from "@/components/market/MarketGrid";
import { getMarketplaceDrops } from "@/lib/data";
import { cityLabel } from "@/lib/market";
import { gridFilters } from "@/lib/market-server";

export const metadata: Metadata = { title: "All drops" };

async function All({ searchParams }: { searchParams: PageProps<"/drops/all">["searchParams"] }) {
  const [drops, sp] = await Promise.all([getMarketplaceDrops(), searchParams]);
  const f = await gridFilters(sp);
  return <MarketGrid drops={drops} filters={f} now={new Date()} heading={f.city && f.city !== "all" ? `Drops in ${f.city === "other" ? "other cities" : cityLabel(f.city)}` : "Drops across Nigeria"} />;
}

export default function Page(props: PageProps<"/drops/all">) {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-5 sm:px-6 sm:pt-8">
      <Suspense fallback={<div className="h-[70vh]" />}>
      <All searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}
