"use client";

// Search results with a map (docs/HOMEPAGE_PLAN.md, like Airbnb's): on a computer the list sits left
// and the map right, and tapping a pin brings its card into view; on a phone the list comes first and
// a Map button swaps to a full map, where tapping a pin shows a small card that opens the listing.
// The map library loads only when a map is on screen.

import { List, Map as MapIcon, Star, X } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { MapPin } from "@/components/map/TikkaMap";

const TikkaMap = dynamic(() => import("@/components/map/TikkaMap").then((m) => m.TikkaMap), {
  ssr: false,
  loading: () => <div className="size-full animate-pulse bg-surface-sunken" />,
});

export interface ResultPin extends MapPin {
  name: string;
  place: string;
  coverUrl?: string;
  rating?: number;
  price?: string;
}

export function ResultsMap({ pins, children }: { pins: ResultPin[]; children: React.ReactNode }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [phoneMap, setPhoneMap] = useState(false);
  const [wide, setWide] = useState(false);
  // Where the sticky search bar ends, so the map sits just under it.
  const [top, setTop] = useState(176);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => {
      setWide(mq.matches);
      const bar = document.querySelector("[data-search-bar]");
      if (bar) setTop(bar.getBoundingClientRect().height + 64);
    };
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  function pick(id: string) {
    setSelected(id);
    if (wide) document.getElementById(`biz-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // The card that goes with the picked pin, highlighted in the list.
  useEffect(() => {
    document.querySelectorAll("[data-biz].ring-2").forEach((el) => el.classList.remove("ring-2", "ring-ink", "rounded-card"));
    if (selected) document.getElementById(`biz-${selected}`)?.classList.add("ring-2", "ring-ink", "rounded-card");
  }, [selected]);

  const chosen = pins.find((p) => p.id === selected);
  const showMap = wide || phoneMap;

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,44%)] lg:gap-6">
      <div className={phoneMap ? "hidden lg:block" : ""}>{children}</div>

      {showMap && (
        <div
          style={wide ? { top: top + 16, height: `calc(100vh - ${top + 32}px)` } : { top }}
          className={wide ? "sticky mt-4 overflow-hidden rounded-card border border-line" : "fixed inset-x-0 bottom-0 z-20 bg-surface"}
        >
          <TikkaMap pins={pins} selected={selected} onSelect={pick} className="size-full" label="Results on a map" />
          {!wide && chosen && (
            <div className="absolute inset-x-3 bottom-24 flex items-stretch overflow-hidden rounded-card border border-line bg-surface-raised shadow-lg">
              <Link href={chosen.href ?? "#"} className="flex min-w-0 flex-1 items-stretch">
                {chosen.coverUrl ? <img src={chosen.coverUrl} alt="" className="w-24 shrink-0 object-cover" /> : <span className="w-3 shrink-0 bg-brand" />}
                <span className="min-w-0 flex-1 px-3 py-2.5">
                  <b className="block truncate text-[15px]">{chosen.name}</b>
                  <span className="block truncate text-[13px] text-ink-muted">{chosen.place}</span>
                  <span className="mt-1 flex items-center gap-2 text-[13px]">
                    {chosen.rating != null && (
                      <span className="inline-flex items-center gap-0.5 font-semibold">
                        <Star size={13} className="fill-current" aria-hidden="true" /> {chosen.rating.toFixed(1)}
                      </span>
                    )}
                    {chosen.price && <span>From {chosen.price}</span>}
                  </span>
                </span>
              </Link>
              <button type="button" onClick={() => setSelected(null)} aria-label="Close" className="grid w-11 shrink-0 place-items-start justify-center pt-2 text-ink-muted">
                <X size={18} aria-hidden="true" />
              </button>
            </div>
          )}
          {wide && pins.some((p) => p.approx) && (
            <p className="absolute top-2 left-2 rounded-pill bg-surface-raised/90 px-3 py-1 text-[12px] text-ink-muted shadow">Dashed pins show the area</p>
          )}
        </div>
      )}

      {/* Phones: one button to swap between the list and the map, in thumb reach. */}
      <button
        type="button"
        onClick={() => (setPhoneMap((v) => !v), setSelected(null))}
        className="fixed bottom-6 left-1/2 z-30 inline-flex min-h-12 -translate-x-1/2 items-center gap-2 rounded-pill bg-ink px-5 text-[15px] font-semibold text-surface shadow-lg lg:hidden"
      >
        {phoneMap ? <List size={18} aria-hidden="true" /> : <MapIcon size={18} aria-hidden="true" />}
        {phoneMap ? "List" : "Map"}
      </button>
    </div>
  );
}
