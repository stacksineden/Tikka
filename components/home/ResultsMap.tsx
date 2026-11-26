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
  reviews: number;
  trade: string;
  /** "Free tomorrow, 9am". */
  free?: string;
  price?: string;
}

/** The business behind a pin, over the map (like Fresha's): photo, name, rating, where, what. */
function PinCard({ p, onClose, wide }: { p: ResultPin; onClose: () => void; wide: boolean }) {
  return (
    <div
      className={`absolute z-10 overflow-hidden rounded-card border border-line bg-surface-raised shadow-xl ${wide ? "top-4 left-1/2 w-[min(380px,calc(100%-32px))] -translate-x-1/2" : "inset-x-3 bottom-24"}`}
    >
      <Link href={p.href ?? "#"} className="block">
        <span className={`relative block bg-surface-sunken ${wide ? "aspect-[16/9]" : "aspect-[2/1]"}`}>
          {p.coverUrl ? <img src={p.coverUrl} alt="" className="size-full object-cover" /> : <span className="block size-full bg-brand" />}
          {p.free && <span className="absolute bottom-2.5 left-2.5 rounded-pill bg-success px-2.5 py-1 text-[12px] font-semibold text-on-success">{p.free}</span>}
        </span>
        <span className="block px-4 pt-3 pb-3.5">
          <span className="flex items-start justify-between gap-3">
            <b className="min-w-0 text-[17px] leading-snug">{p.name}</b>
            {p.rating != null && (
              <span className="inline-flex shrink-0 items-center gap-1 text-[15px] font-semibold">
                <Star size={15} className="fill-current" aria-hidden="true" /> {p.rating.toFixed(1)}
              </span>
            )}
          </span>
          <span className="mt-0.5 block text-[14px] text-ink-muted">{p.place}</span>
          <span className="block text-[14px] text-ink-muted">
            {p.trade}
            {p.reviews > 0 && ` · ${p.reviews} review${p.reviews === 1 ? "" : "s"}`}
            {p.price && ` · From ${p.price}`}
          </span>
        </span>
      </Link>
      <button type="button" onClick={onClose} aria-label="Close" className="absolute top-2.5 right-2.5 grid size-10 place-items-center rounded-pill bg-surface-raised text-ink shadow-md">
        <X size={18} aria-hidden="true" />
      </button>
    </div>
  );
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
          <TikkaMap pins={pins} selected={selected} onSelect={pick} onMapClick={() => setSelected(null)} focusOffset={wide ? 150 : -110} className="size-full" label="Results on a map" />
          {chosen && <PinCard p={chosen} wide={wide} onClose={() => setSelected(null)} />}
          {wide && !chosen && pins.some((p) => p.approx) && (
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
