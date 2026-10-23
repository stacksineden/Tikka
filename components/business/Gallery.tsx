"use client";

import { ChevronLeft, ChevronRight, Play, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PortfolioPhoto } from "@/lib/types";

/** Portfolio grid: thumbnails first (lazy), tap to view full screen with captions. Videos play there, never inline. */
export function Gallery({ photos, businessName, editorial = false }: { photos: PortfolioPhoto[]; businessName: string; editorial?: boolean }) {
  const [open, setOpen] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open !== null && !d.open) d.showModal();
    if (open === null && d.open) d.close();
  }, [open]);

  const step = (by: number) => setOpen((i) => (i === null ? i : (i + by + photos.length) % photos.length));
  const current = open !== null ? photos[open] : null;

  return (
    <>
      <ul className={editorial ? "grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-4" : "grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3"}>
        {photos.map((p, i) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => setOpen(i)}
              className={`group relative block w-full overflow-hidden bg-surface-sunken ${editorial ? `${i % 5 === 0 ? "aspect-[3/4] sm:row-span-2 sm:aspect-auto sm:h-full" : "aspect-[3/4]"}` : "aspect-[4/5] rounded-card"}`}
              aria-label={`Open ${p.kind === "video" ? "video" : "photo"} ${i + 1} of ${photos.length}${p.caption ? `: ${p.caption}` : ""}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.thumbUrl} alt="" loading="lazy" decoding="async" className={`size-full object-cover group-hover:scale-[1.04] ${editorial ? "transition-transform duration-700" : "transition-transform duration-300"}`} />
              {p.kind === "video" && (
                <span className="absolute left-2 top-2 grid size-9 place-items-center rounded-pill bg-night/70 text-on-night" aria-hidden="true">
                  <Play size={16} className="fill-current" />
                </span>
              )}
              {p.caption && (
                <span className="text-caption absolute inset-x-0 bottom-0 bg-linear-to-t from-night/80 to-transparent px-2.5 pb-2 pt-6 text-left text-on-night">
                  {p.caption}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>

      <dialog
        ref={dialog}
        onClose={() => setOpen(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") step(1);
          if (e.key === "ArrowLeft") step(-1);
        }}
        aria-label={`${businessName} photos`}
        className="m-0 h-dvh max-h-none w-full max-w-none bg-night p-0 text-on-night backdrop:bg-night"
      >
        {current && (
          <div className="stage flex h-full flex-col">
            <div className="flex h-14 items-center justify-between px-2">
              <span className="text-label px-2 text-on-night-muted">
                {open! + 1} of {photos.length}
              </span>
              <button type="button" onClick={() => setOpen(null)} className="grid size-11 place-items-center rounded-pill text-on-night" aria-label="Close">
                <X size={22} aria-hidden="true" />
              </button>
            </div>
            <div className="relative flex min-h-0 flex-1 items-center justify-center px-2">
              {current.kind === "video" ? (
                <video key={current.id} src={current.url} poster={current.thumbUrl} controls autoPlay playsInline className="max-h-full max-w-full" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={current.url} alt={current.caption ?? `${businessName} photo ${open! + 1}`} className="max-h-full max-w-full object-contain" />
              )}
              {photos.length > 1 && (
                <>
                  <button type="button" onClick={() => step(-1)} className="absolute left-2 grid size-11 place-items-center rounded-pill bg-night-raised/80" aria-label="Previous photo">
                    <ChevronLeft size={22} aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => step(1)} className="absolute right-2 grid size-11 place-items-center rounded-pill bg-night-raised/80" aria-label="Next photo">
                    <ChevronRight size={22} aria-hidden="true" />
                  </button>
                </>
              )}
            </div>
            <p className="text-body min-h-14 px-4 py-4 text-center text-on-night-muted">{current.caption}</p>
          </div>
        )}
      </dialog>
    </>
  );
}
