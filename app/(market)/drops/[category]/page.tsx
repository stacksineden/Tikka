import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { MarketGrid } from "@/components/market/MarketGrid";
import { getMarketplaceDrops } from "@/lib/data";
import { categoryFromSlug, cityLabel } from "@/lib/market";
import { gridFilters } from "@/lib/market-server";

export async function generateMetadata({ params }: PageProps<"/drops/[category]">): Promise<Metadata> {
  const c = categoryFromSlug((await params).category);
  return c ? { title: `${c} drops`, description: `Limited Tikka drops from ${c.toLowerCase()} businesses across Nigeria.` } : { title: "Drops" };
}

async function Category({ params, searchParams }: PageProps<"/drops/[category]">) {
  const [{ category: slug }, sp, drops] = await Promise.all([params, searchParams, getMarketplaceDrops()]);
  const category = categoryFromSlug(slug);
  if (!category) notFound();
  const f = await gridFilters(sp, { category });
  const where = f.city && f.city !== "all" ? (f.city === "other" ? " in other cities" : ` in ${cityLabel(f.city)}`) : " across Nigeria";
  return <MarketGrid drops={drops} filters={f} now={new Date()} heading={`${category}${where}`} fixedCategory={category} />;
}

export default function Page(props: PageProps<"/drops/[category]">) {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-5 sm:px-6 sm:pt-8">
      <Suspense fallback={<div className="h-[70vh]" />}>
      <Category {...props} />
      </Suspense>
    </div>
  );
}
