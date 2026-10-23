"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

const EVERY_MS = 6000;

/**
 * The featured drops' carousel: swipe on phones (the next card peeks in), arrows on desktop,
 * dots for where you are. It moves on by itself every few seconds until someone touches it,
 * pauses while hovered, focused or off screen, and never moves for people who turned motion off.
 */
export function Carousel({ count, label, children }: { count: number; label: string; children: ReactNode }) {
  const track = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(0);
  const [stopped, setStopped] = useState(false);
  const [paused, setPaused] = useState(false);
  // How many cards fit at once (one on phones, two on wider screens): the dots count pages.
  const [perView, setPerView] = useState(1);
  const pages = Math.max(1, count - perView + 1);

  const items = () => Array.from(track.current?.children ?? []) as HTMLElement[];

  function go(i: number) {
    const el = track.current;
    const target = items()[(i + pages) % pages];
    if (!el || !target) return;
    const smooth = !matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left: target.offsetLeft - el.offsetLeft - parseFloat(getComputedStyle(el).scrollPaddingLeft || "0"), behavior: smooth ? "smooth" : "auto" });
  }

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const measure = () => {
      const first = items()[0];
      if (first) setPerView(Math.max(1, Math.round(el.clientWidth / first.offsetWidth)));
    };
    measure();
    const sizes = new ResizeObserver(measure);
    sizes.observe(el);
    return () => sizes.disconnect();
  }, [count]);

  // Which page is showing: the card whose left edge is nearest the track's.
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const left = el.scrollLeft;
        const nearest = items().reduce(
          (best, item, i) => {
            const d = Math.abs(item.offsetLeft - el.offsetLeft - left);
            return d < best.d ? { i, d } : best;
          },
          { i: 0, d: Infinity },
        );
        setActive(Math.min(nearest.i, pages - 1));
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [pages]);

  // Moving on by itself: not with motion off, not once they've touched it, not while paused or hidden.
  useEffect(() => {
    if (pages < 2 || stopped || paused || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = track.current;
    let visible = true;
    const seen = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    if (el) seen.observe(el);
    const timer = setInterval(() => {
      if (visible && !document.hidden) go(active + 1);
    }, EVERY_MS);
    return () => {
      clearInterval(timer);
      seen.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, pages, stopped, paused]);

  const stop = () => setStopped(true);

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <ul
        ref={track}
        onPointerDown={stop}
        onTouchStart={stop}
        onWheel={(e) => Math.abs(e.deltaX) > Math.abs(e.deltaY) && stop()}
        className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:scroll-px-0 sm:px-0"
      >
        {children}
      </ul>
      {pages > 1 && (
        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="flex items-center" role="group" aria-label="Choose a featured drop">
            {Array.from({ length: pages }, (_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  stop();
                  go(i);
                }}
                aria-label={perView > 1 ? `Featured drops, page ${i + 1} of ${pages}` : `Featured drop ${i + 1} of ${pages}`}
                aria-current={i === active ? "true" : undefined}
                className="grid h-11 w-7 place-items-center"
              >
                <span className={`block h-2 rounded-pill transition-[width,background-color] duration-300 ${i === active ? "w-6 bg-on-night" : "w-2 bg-on-night-muted"}`} />
              </button>
            ))}
          </div>
          <div className="hidden gap-2 sm:flex">
            <button
              type="button"
              onClick={() => {
                stop();
                go(active - 1);
              }}
              aria-label="Previous featured drop"
              className="grid size-11 place-items-center rounded-pill bg-night-raised text-on-night hover:opacity-90"
            >
              <ChevronLeft size={20} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => {
                stop();
                go(active + 1);
              }}
              aria-label="Next featured drop"
              className="grid size-11 place-items-center rounded-pill bg-night-raised text-on-night hover:opacity-90"
            >
              <ChevronRight size={20} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
