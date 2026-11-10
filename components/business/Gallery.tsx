"use client";

import { ChevronLeft, ChevronRight, Play, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PortfolioPhoto } from "@/lib/types";

/** The masonry's tile shapes, repeated: tall, square and in between, so columns stagger. */
const RHYTHM = ["3 / 4", "1 / 1", "4 / 5", "2 / 3", "1 / 1", "3 / 4"];
/** Tiles shown before "See all". */
const MASONRY_FIRST = 6;

/**
 * Portfolio: thumbnails first (lazy), tap to view full screen with captions. Videos play there,
 * never inline. On the claim page, a plain grid. On the business page (`editorial`), a masonry:
 * two columns on phones, three on desktop, tiles in a varied rhythm of tall and square shapes,
 * the first six with "See all" for the rest, so the page stays short.
 */
export function Gallery({ photos, businessName, editorial = false }: { photos: PortfolioPhoto[]; businessName: string; editorial?: boolean }) {
  const [open, setOpen] = useState<number | null>(null);
  const [all, setAll] = useState(false);
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
      {editorial ? (
        <>
          <ul className="biz-masonry">
            {(all ? photos : photos.slice(0, MASONRY_FIRST)).map((p, i) => (
              <li key={p.id} className="biz-masonry-item">
                <button
                  type="button"
                  onClick={() => setOpen(i)}
                  className="group relative block w-full overflow-hidden bg-surface-sunken"
                  style={{ aspectRatio: RHYTHM[i % RHYTHM.length] }}
                  aria-label={`Open ${p.kind === "video" ? "video" : "photo"} ${i + 1} of ${photos.length}${p.caption ? `: ${p.caption}` : ""}`}
                >
                  {/* The small thumbnail on phones; the full photo on wider screens, so it stays sharp. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.thumbUrl}
                    srcSet={p.kind === "video" ? undefined : `${p.thumbUrl} 400w, ${p.url} 1600w`}
                    sizes="(min-width: 640px) 33vw, 50vw"
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="size-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                  />
                  {p.kind === "video" && (
                    <span className="absolute left-3 top-3 grid size-10 place-items-center bg-surface-raised text-ink" aria-hidden="true">
                      <Play size={16} className="fill-current" />
                    </span>
                  )}
                  {p.caption && <span className="biz-masonry-cap">{p.caption}</span>}
                </button>
              </li>
            ))}
          </ul>
          {!all && photos.length > MASONRY_FIRST && (
            <button type="button" onClick={() => setAll(true)} className="biz-btn mt-8 w-full border border-[var(--ink)] sm:w-auto">
              See all {photos.length}
            </button>
          )}
        </>
      ) : (
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
        {photos.map((p, i) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => setOpen(i)}
              className="group relative block aspect-[4/5] w-full overflow-hidden rounded-card bg-surface-sunken"
              aria-label={`Open ${p.kind === "video" ? "video" : "photo"} ${i + 1} of ${photos.length}${p.caption ? `: ${p.caption}` : ""}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.thumbUrl} alt="" loading="lazy" decoding="async" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.04]" />
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
      )}

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
