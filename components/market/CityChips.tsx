"use client";

import { useRouter } from "next/navigation";
import { CITIES, CITY_COOKIE, type CityId } from "@/lib/market";

/** City chips (remembered in a cookie; Lagos until someone picks) and the area picker. */
export function CityChips({ city, areas, area }: { city: CityId; areas: string[]; area?: string }) {
  const router = useRouter();
  return (
    <div className="grid gap-2">
      <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0" aria-label="City">
        {CITIES.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              aria-pressed={city === c.id}
              onClick={() => {
                document.cookie = `${CITY_COOKIE}=${c.id}; path=/; max-age=31536000; samesite=lax`;
                router.push("/drops");
                router.refresh();
              }}
              className={`text-label min-h-10 whitespace-nowrap rounded-pill border px-4 ${city === c.id ? "border-ink bg-ink text-surface" : "border-line bg-surface-raised text-ink"}`}
            >
              {c.label}
            </button>
          </li>
        ))}
      </ul>
      {city !== "all" && areas.length > 1 && (
        <label className="flex min-h-10 max-w-xs items-center rounded-md border border-line bg-surface-raised px-2">
          <span className="sr-only">Area</span>
          <select
            value={area ?? ""}
            onChange={(e) => router.push(e.target.value ? `/drops?area=${encodeURIComponent(e.target.value)}` : "/drops")}
            className="h-10 min-w-0 flex-1 bg-transparent text-[15px] outline-none"
          >
            <option value="">All areas</option>
            {areas.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
