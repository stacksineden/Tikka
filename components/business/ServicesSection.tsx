"use client";

import { ArrowUpRight, Clock } from "lucide-react";
import { useState } from "react";
import { priceText } from "@/lib/page";
import type { ServiceItem } from "@/lib/types";

const GLYPHS = ["○", "✕", "◇", "✦", "△", "□"];

/**
 * Services, editorial: outlined group boxes (only with more than one group) that fill with a
 * photo when chosen, the group's name in big type, then the services as photo cards. Each card
 * books on WhatsApp.
 */
export function ServicesSection({
  services,
  groups,
  links,
  brand,
}: {
  services: ServiceItem[];
  groups: string[];
  /** "Book on WhatsApp" link per service, in the same order (null when there's no number). */
  links: (string | null)[];
  brand: { color: string; on: string; initials: string };
}) {
  const [group, setGroup] = useState<string | null>(null);
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
                  <span className="block font-display text-[15px] font-extrabold uppercase leading-tight tracking-[-0.01em] sm:text-[17px]">{g ?? "All"}</span>
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
          <h3 key={group ?? "all"} className="biz-display text-[clamp(36px,6.5vw,88px)]">
            <span className="w">
              <span className="wi biz-fade-in" style={{ animationDelay: "0s" }}>
                {group ?? "All services"}
              </span>
            </span>
          </h3>
          <p className="text-body-lg max-w-md text-ink-muted lg:justify-self-end">
            {shown.length} service{shown.length === 1 ? "" : "s"}. Tap one to book it on WhatsApp; prices are shown before you book.
          </p>
        </div>
      )}

      <ul className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-x-5 sm:gap-y-12 sm:overflow-visible sm:px-0 lg:grid-cols-3">
        {shown.map(({ s, link }) => {
          const Tag = link ? "a" : "div";
          return (
            <li key={s.id ?? s.name} className="biz-card relative w-[80%] shrink-0 snap-start sm:w-auto">
              <Tag {...(link ? { href: link, target: "_blank", rel: "noopener noreferrer" } : {})} className="group block">
                <div className="biz-card-img relative aspect-[4/5] overflow-hidden" style={{ background: brand.color }}>
                  {s.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.imageUrl} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
                  ) : (
                    <span className="absolute inset-0 grid place-items-center font-display text-[64px] font-extrabold opacity-25" style={{ color: brand.on }} aria-hidden="true">
                      {brand.initials}
                    </span>
                  )}
                  <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-linear-to-t from-night/75 to-transparent p-4 pt-16 text-on-night">
                    <span className="font-display text-[20px] font-extrabold uppercase leading-none tracking-[-0.02em]">{s.name}</span>
                    {link && (
                      <span className="grid size-10 shrink-0 place-items-center bg-surface-raised text-ink transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true">
                        <ArrowUpRight size={18} />
                      </span>
                    )}
                  </span>
                </div>
                <div className="mt-3 flex items-baseline justify-between gap-3">
                  <span className={`tabular-nums ${s.priceKind === "ask" || s.price === null ? "text-label text-ink-muted" : "text-title text-[18px]"}`}>{priceText(s)}</span>
                  {s.duration && (
                    <span className="text-caption inline-flex items-center gap-1 text-ink-muted">
                      <Clock size={13} aria-hidden="true" />
                      {s.duration}
                    </span>
                  )}
                </div>
                {s.description && <p className="text-body mt-1 line-clamp-2 text-ink-muted">{s.description}</p>}
                {link && <span className="sr-only">Book {s.name} on WhatsApp</span>}
              </Tag>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
