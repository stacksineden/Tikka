import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { NotifyMe } from "@/components/market/NotifyMe";
import { actionHref } from "@/components/tikka/ActionIcon";
import { clockTime, count, naira, place, shortDate } from "@/lib/format";
import { heroHeadline, priceText, showsLocation, whereLine, type PageDrop } from "@/lib/page";
import { portfolioView } from "@/lib/portfolio";
import { xsOf } from "@/lib/media-path";
import { formatTime } from "@/lib/setup";
import type { OpeningHours } from "@/lib/types";
import type { PhotoPageProps } from "@/components/business/photo/PhotoPage";

// Shared by the four newer page styles (Luxe, Soft studio, Minimal portfolio, Film; prototypes in
// design/page-styles/). Same props as the gallery, the same content worked out once, so each style
// is only its own markup and CSS.

export type StylePageProps = PhotoPageProps;

export function pageData({ b, reviews, serviceLinks, deposits, sheet }: StylePageProps) {
  const page = b.page ?? {};
  const photos = b.portfolio.filter((p) => p.kind !== "video");
  const hero = page.heroImageUrl ?? photos.find((p) => !p.width || p.width >= (p.height ?? 0))?.url ?? photos[0]?.url;
  const work = portfolioView(b);
  const wa = b.actions.find((a) => a.kind === "whatsapp");
  const services = b.services.map((s, i) => {
    const price = s.priceKind === "ask" || s.price === null ? "" : priceText(s);
    const link = serviceLinks[i];
    const deposit = s.id ? deposits[s.id] : undefined;
    return {
      key: s.id ?? s.name,
      name: s.name,
      group: s.group?.trim() || "",
      price: price || "Price on request",
      about: [s.duration, s.description].filter(Boolean).join(" · "),
      depositLine: deposit ? `${naira(deposit / 100)} deposit to book` : "",
      link,
      // The booking sheet opens from these (BookingFlow / CalendarSheet listen for [data-book]).
      linkProps: link ? { href: link, target: "_blank", rel: "noopener noreferrer", ...(sheet ? { "data-book": "", "data-book-id": s.id, "data-book-name": s.name, "data-book-price": price } : {}) } : null,
    };
  });
  return {
    page,
    photos,
    hero,
    collections: work.collections,
    services,
    groups: [...new Set(services.map((s) => s.group).filter(Boolean))],
    reviews: reviews.filter((r) => r.status !== "hidden" && r.text?.trim()).slice(0, 6),
    statement: page.headline?.trim() || heroHeadline(b),
    intro: page.subline?.trim() || "",
    where: showsLocation(b) ? place(b.area, b.city) : whereLine(b),
    waHref: wa ? actionHref("whatsapp", wa.value) : undefined,
    hours: b.hours ? hoursRows(b.hours) : [],
    rules: b.bookingRules ?? [],
    faqs: b.page?.faqs ?? [],
    initials: b.initials,
    style: { "--biz": b.brandColor, "--on-biz": b.onBrandColor } as React.CSSProperties,
  };
}

function hoursRows(h: OpeningHours): [string, string][] {
  const fmt = (d: OpeningHours["weekdays"]) => (d.open ? `${formatTime(d.from)} – ${formatTime(d.to)}` : "Closed");
  return [
    ["Mon – Fri", fmt(h.weekdays)],
    ["Saturday", fmt(h.saturday)],
    ["Sunday", fmt(h.sunday)],
  ];
}

/** A long "about" (over 160 characters) is set at reading size, not as a big statement. */
export const longText = (t: string | undefined) => (t?.trim().length ?? 0) > 160;

/** A photo as a background layer over its tiny blurred copy (lib/blur.ts) and the style's own tinted placeholder. */
export const bg = (url?: string) => {
  if (!url) return undefined;
  const xs = xsOf(url);
  return { "--img": `url("${url}")`, ...(xs ? { "--img-xs": `url("${xs}")` } : {}) } as React.CSSProperties;
};

/**
 * The drop band in the style's own colours: a live drop with the gold Claim button (the one Tikka
 * mark on the page, design/BRAND.md), or the next drop / Notify me.
 */
export function StyleDropBand({ b, live, next, fromCard, cls }: Pick<StylePageProps, "b" | "live" | "next" | "fromCard"> & { cls: string }) {
  if (live) return <LiveBand b={b} live={live} fromCard={fromCard} cls={cls} />;
  return (
    <div className={`${cls}-band`}>
      <p>
        {next ? (
          <>
            <b>{next.name}</b>
            <small>
              Opens {shortDate(next.startsAt)}, {clockTime(next.startsAt)}
            </small>
          </>
        ) : (
          <>
            <b>Be the first to know</b>
            <small>When {b.name} has something new</small>
          </>
        )}
      </p>
      <NotifyMe businessSlug={b.slug} businessName={b.name} dropSlug={next?.slug} opensLabel={next ? `${shortDate(next.startsAt)}, ${clockTime(next.startsAt)}` : undefined} className={`${cls}-notify`}>
        {next ? "Notify me" : "Get notified"}
      </NotifyMe>
    </div>
  );
}

function LiveBand({ b, live, fromCard, cls }: { b: StylePageProps["b"]; live: PageDrop; fromCard?: boolean; cls: string }) {
  return (
    <div className={`${cls}-band`}>
      <p>
        <b>{live.name}</b>
        <small>
          {count(live.left)} Tikkas left · ends {shortDate(live.endsAt)}
        </small>
      </p>
      <Link href={`/d/${b.slug}/${live.slug}${fromCard ? "?c=card" : ""}`} className="st-claim">
        Claim yours <ArrowUpRight size={16} aria-hidden="true" />
      </Link>
    </div>
  );
}
