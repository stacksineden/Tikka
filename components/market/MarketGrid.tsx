import { Search } from "lucide-react";
import Link from "next/link";
import { AutoSubmit } from "@/components/leads/LeadBits";
import { areasIn, categorySlug, CITIES, filterAndSort, SORTS, type MarketFilters } from "@/lib/market";
import { CATEGORIES } from "@/lib/nigeria";
import type { MarketDrop } from "@/lib/types";
import { DropTile } from "./DropTile";

/** See all, a category, or search results: filters (as a GET form) and a grid of tiles. */
export function MarketGrid({ drops, filters, now, heading, fixedCategory }: { drops: MarketDrop[]; filters: MarketFilters; now: Date; heading: string; fixedCategory?: string }) {
  const results = filterAndSort(drops, filters);
  const areas = filters.city ? areasIn(drops, filters.city) : [];
  return (
    <div className="grid grid-cols-1 gap-4">
      <div>
        <Link href="/drops" className="text-label text-brand">
          ← All drops
        </Link>
        <h1 className="text-heading mt-2">{heading}</h1>
      </div>

      <AutoSubmit className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <label className="col-span-2 flex min-h-11 items-center gap-2 rounded-md border border-line-strong bg-surface-raised px-3 sm:min-w-64 sm:flex-1">
          <Search size={18} className="shrink-0 text-ink-muted" aria-hidden="true" />
          <span className="sr-only">Search drops</span>
          <input name="q" defaultValue={filters.q} placeholder="Business, area or drop" enterKeyHint="search" className="h-11 min-w-0 flex-1 bg-transparent text-[16px] outline-none" />
        </label>
        <select name="city" defaultValue={filters.city ?? "all"} aria-label="City" className="input sm:w-auto">
          {CITIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        {filters.city && filters.city !== "all" && (
          <select name="area" defaultValue={filters.area ?? ""} aria-label="Area" className="input sm:w-auto">
            <option value="">All areas</option>
            {areas.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        )}
        {!fixedCategory && (
          <select name="category" defaultValue={filters.category ? categorySlug(filters.category) : ""} aria-label="Category" className="input sm:w-auto">
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={categorySlug(c)}>
                {c}
              </option>
            ))}
          </select>
        )}
        <select name="status" defaultValue={filters.status ?? ""} aria-label="Live or coming soon" className="input sm:w-auto">
          <option value="">Live and coming soon</option>
          <option value="live">Live now</option>
          <option value="scheduled">Coming soon</option>
        </select>
        <select name="sort" defaultValue={filters.sort} aria-label="Sort" className="input sm:w-auto">
          {SORTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <label className="text-label col-span-2 flex min-h-11 items-center gap-2 sm:col-span-1">
          <input type="checkbox" name="legendary" value="1" defaultChecked={filters.legendary} className="size-5 accent-brand" />
          Has legendary left
        </label>
        <noscript>
          <button type="submit" className="btn btn-secondary">
            Apply
          </button>
        </noscript>
      </AutoSubmit>

      <p className="text-caption text-ink-muted" aria-live="polite">
        {results.length} {results.length === 1 ? "drop" : "drops"}
      </p>
      {results.length === 0 ? (
        <div className="rounded-card border border-dashed border-line-strong bg-surface-raised p-6">
          <p className="text-body-lg text-ink-muted">No drops match. Try another area, or look across Nigeria.</p>
          <Link href="/drops/all?city=" className="btn btn-secondary mt-4">
            See every drop
          </Link>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {results.map((d) => (
            <li key={d.id} className="min-w-0">
              <DropTile d={d} now={now} wide />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
