"use client";

import { ArrowLeft, ArrowRight, ArrowUpRight, Clock } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { focalPosition, priceText } from "@/lib/page";
import type { ServiceItem } from "@/lib/types";

const GLYPHS = ["○", "✕", "◇", "✦", "△", "□"];

/**
 * Services, editorial: outlined group boxes (only with more than one group) that fill with a
 * photo when chosen, the group's name in big type, then the services as photo cards in a carousel
 * (swipe or the arrows; a progress line and "03 / 09" show where you are). Each card
 * opens the booking sheet with its service chosen (or the owner's own booking link).
 */
export function ServicesSection({
  services,
  groups,
  links,
  sheet = false,
  brand,
}: {
  services: ServiceItem[];
  groups: string[];
  /** "Book on WhatsApp" link per service, in the same order (null when there's no number). */
  links: (string | null)[];
  /** Cards open the booking sheet (components/business/BookingSheet) instead of their link. */
  sheet?: boolean;
  brand: { color: string; on: string; initials: string };
}) {
  const [group, setGroup] = useState<string | null>(null);
  const track = useRef<HTMLUListElement>(null);
  // The visible share of the row and where it starts (0–1 each), and the first card in view.
  const [view, setView] = useState({ start: 0, size: 1, first: 0 });
  const all = services.map((s, i) => ({ s, link: links[i] }));
  const shown = all.filter(({ s }) => !group || s.group?.trim() === group);
  const tabs = groups.length ? [null, ...groups] : [];
  const photoOf = (g: string | null) => all.find(({ s }) => (!g || s.group?.trim() === g) && s.imageUrl)?.s.imageUrl;

  return (
    <div className="grid gap-12">
      {tabs.length > 0 && (
        <div role="tablist" aria-label="Service groups" className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
          {tabs.map((g, i) => {
            const n = g ? all.filter(({ s }) => s.group?.trim() === g).length : all.length;
            const photo = photoOf(g);
            return (
              <button
                key={g ?? "all"}
                type="button"
                role="tab"
                aria-selected={group === g}
                data-plain={photo ? undefined : ""}
                onClick={() => setGroup(g)}
                className="biz-cat flex min-h-28 flex-col justify-between p-3.5 text-left sm:min-h-36 sm:p-4"
              >
                {photo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo} alt="" loading="lazy" />
                )}
                <span className="self-end text-[15px] leading-none" aria-hidden="true">
                  {GLYPHS[i % GLYPHS.length]}
                </span>
                <span>
                  <span className="biz-serif block text-[19px] leading-tight sm:text-[22px]">{g ?? "All"}</span>
                  <span className="block text-[12px] opacity-75">
                    {n} service{n === 1 ? "" : "s"}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {tabs.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2 lg:items-end">
          <h3 key={group ?? "all"} className="biz-display text-[clamp(32px,5vw,64px)]">
            <span className="w">
              <span className="wi biz-fade-in" style={{ animationDelay: "0s" }}>
                {group ?? "All services"}
              </span>
            </span>
          </h3>
          <p className="text-body-lg max-w-md text-ink-muted lg:justify-self-end">
            {shown.length} service{shown.length === 1 ? "" : "s"}. Tap one to pick a time and book it.
          </p>
        </div>
      )}

      <div role="region" aria-roledescription="carousel" aria-label="Services">
      <ul ref={track} className="biz-rail">
        {shown.map(({ s, link }) => {
          const Tag = link ? "a" : "div";
          return (
            <li key={s.id ?? s.name} className="biz-card biz-rail-item relative">
              <Tag
                {...(link ? { href: link, target: "_blank", rel: "noopener noreferrer" } : {})}
                {...(link && sheet ? { "data-book": "", "data-book-name": s.name, "data-book-price": s.priceKind === "ask" || s.price === null ? "" : priceText(s) } : {})}
                className="group flex h-full flex-col"
              >
                {/* The photo stays clean: no text or fade on it. */}
                <div className="biz-card-img relative aspect-[4/5] overflow-hidden" style={{ background: brand.color }}>
                  {s.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.imageUrl} alt="" loading="lazy" decoding="async" className="size-full object-cover" style={{ objectPosition: focalPosition(s.focal ?? { x: 0.5, y: 0.3 }) }} />
                  ) : (
                    <span className="biz-serif absolute inset-0 grid place-items-center text-[72px] opacity-30" style={{ color: brand.on }} aria-hidden="true">
                      {brand.initials}
                    </span>
                  )}
                </div>
                {/* Three levels: the name (serif), the price (a small label), the description (muted). */}
                <h4 className="biz-serif mt-5 text-[24px] leading-[1.15] tracking-[-0.01em] sm:text-[26px]">{cleanName(s.name)}</h4>
                <p className={`biz-price mt-2 ${s.description ? "" : "mb-5"}`}>
                  <span>{s.priceKind === "ask" || s.price === null ? "Price on request" : priceText(s)}</span>
                  {s.duration && (
                    <span className="inline-flex items-center gap-1">
                      <span aria-hidden="true">·</span>
                      <Clock size={12} aria-hidden="true" />
                      {s.duration}
                    </span>
                  )}
                </p>
                {s.description && <p className="text-body mb-5 mt-3 line-clamp-2 text-ink-muted">{s.description}</p>}
                {link && (
                  <span className="biz-card-book" aria-hidden="true">
                    Book
                    <ArrowUpRight size={18} className="transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </span>
                )}
                {link && <span className="sr-only">Book {s.name}</span>}
              </Tag>
            </li>
          );
        })}
      </ul>
      <RailControls track={track} view={view} setView={setView} count={shown.length} reset={group} />
      </div>
    </div>
  );
}

type View = { start: number; size: number; first: number };

/**
 * Under the services row: a thin line that fills with the part of the row in view, "03 / 09", and
 * square arrows that move one card at a time. Hidden when every card already fits. No autoplay.
 */
function RailControls({ track, view, setView, count, reset }: { track: React.RefObject<HTMLUListElement | null>; view: View; setView: (v: View) => void; count: number; reset: string | null }) {
  const heading = useRef<{ i: number; at: number } | null>(null);
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    el.scrollTo({ left: 0 });
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const items = Array.from(el.children) as HTMLElement[];
        const first = items.reduce((best, item, i) => (Math.abs(item.offsetLeft - el.offsetLeft - el.scrollLeft) < Math.abs(items[best].offsetLeft - el.offsetLeft - el.scrollLeft) ? i : best), 0);
        setView({ start: el.scrollLeft / el.scrollWidth, size: Math.min(1, el.clientWidth / el.scrollWidth), first });
      });
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const sizes = new ResizeObserver(measure);
    sizes.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      sizes.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [track, setView, count, reset]);

  if (view.size >= 0.995) return null;
  const go = (dir: 1 | -1) => {
    const el = track.current;
    if (!el) return;
    // From the card a scroll is already heading to (quick taps keep moving), else from where the
    // row is now.
    const items = Array.from(el.children) as HTMLElement[];
    const pad = parseFloat(getComputedStyle(el).scrollPaddingLeft || "0");
    const pending = heading.current && Date.now() - heading.current.at < 700 ? heading.current.i : null;
    const from = pending ?? items.reduce((best, it, i) => (Math.abs(it.offsetLeft - el.offsetLeft - pad - el.scrollLeft) < Math.abs(items[best].offsetLeft - el.offsetLeft - pad - el.scrollLeft) ? i : best), 0);
    const i = Math.min(items.length - 1, Math.max(0, from + dir));
    const target = items[i];
    if (!target) return;
    heading.current = { i, at: Date.now() };
    const smooth = !matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left: target.offsetLeft - el.offsetLeft - parseFloat(getComputedStyle(el).scrollPaddingLeft || "0"), behavior: smooth ? "smooth" : "auto" });
  };
  const atEnd = view.start + view.size >= 0.995;
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="mt-8 flex items-center gap-5">
      <div className="biz-progress" aria-hidden="true">
        <span style={{ width: `${view.size * 100}%`, transform: `translateX(${(view.start / view.size) * 100}%)` }} />
      </div>
      <p className="shrink-0 font-mono text-[12px] tracking-[0.08em] text-ink-muted" aria-live="polite">
        {pad(view.first + 1)} / {pad(count)}
      </p>
      <div className="flex shrink-0 gap-2">
        <button type="button" className="biz-rail-btn" onClick={() => go(-1)} disabled={view.first === 0} aria-label="Previous service">
          <ArrowLeft size={18} aria-hidden="true" />
        </button>
        <button type="button" className="biz-rail-btn" onClick={() => go(1)} disabled={atEnd} aria-label="Next service">
          <ArrowRight size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/** "MAKEUP ARTISTRY," → "MAKEUP ARTISTRY": stray punctuation an owner left at the end. */
function cleanName(name: string): string {
  return name.trim().replace(/[\s,.;:–—-]+$/, "");
}
