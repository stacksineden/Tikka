import type { Metadata } from "next";
import { ArrowUpRight, Clock3, Globe, MapPin, Star } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { BookingFlow } from "@/components/business/BookingFlow";
import { ListingExtras } from "@/components/business/ListingExtras";
import { HomeHeader } from "@/components/home/HomeHeader";
import { SiteFooter } from "@/components/site/SiteChrome";
import { demoDepositRule, getBookingRules } from "@/lib/bookings-data";
import { getBusinessBySlug, getBusinessReviews, isDbId } from "@/lib/data";
import { getSpacePhotos } from "@/lib/listing-db";
import { place } from "@/lib/format";
import { bookingLink, pageStyle, priceText } from "@/lib/page";
import { reachLabel, tradesInOrder } from "@/lib/presets";
import { openLabel, searchHref } from "@/lib/search";
import { sheetTheme } from "@/lib/sheet-theme";
import { formatTime } from "@/lib/setup";
import type { Business, ServiceItem } from "@/lib/types";
import { LoadingGrid } from "@/components/ui/Loading";
import { blurProps } from "@/lib/blur";

// A business's listing on Tikka (docs/HOMEPAGE_PLAN.md): what search results open, in one layout for
// every business so customers can compare (like Fresha's). Photos, rating, open now, services with
// Book, team, reviews, about, and a booking card that stays in view on a computer. The business's own
// website (usetikka.com/[slug]) stays its bio link; both open the same booking sheet.

export async function generateMetadata({ params }: PageProps<"/book/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const found = await getBusinessBySlug(slug);
  if (!found) return { title: "Not found" };
  const b = found.business;
  return {
    title: `Book ${b.name} · ${place(b.area, b.city)}`,
    description: `${b.name} in ${place(b.area, b.city)}: services, prices, photos, reviews and free times. Book on Tikka.`,
    alternates: { canonical: `/${b.slug}` },
  };
}

const minutesLabel = (m?: number) => (!m ? "" : m < 60 ? `${m} min` : `${Math.floor(m / 60)} hr${m >= 120 ? "s" : ""}${m % 60 ? ` ${m % 60} min` : ""}`);

function servicePrice(s: ServiceItem): string {
  if (s.options?.length) {
    const low = Math.min(...s.options.map((o) => o.price));
    return priceText({ price: low, priceKind: s.options.length > 1 ? "from" : s.priceKind });
  }
  return priceText(s);
}

function Stars({ rating, count }: { rating?: number; count: number }) {
  if (!rating || !count) return null;
  return (
    <span className="inline-flex items-center gap-1 font-semibold">
      {rating.toFixed(1)}
      <span className="inline-flex text-gold" aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => (
          <Star key={i} size={16} className={i < Math.round(rating) ? "fill-current" : "opacity-30"} />
        ))}
      </span>
      <span className="font-normal text-ink-muted">({count})</span>
    </span>
  );
}

async function Listing({ params }: { params: PageProps<"/book/[slug]">["params"] }) {
  await connection();
  const { slug } = await params;
  const found = await getBusinessBySlug(slug);
  if (!found) notFound();
  const b: Business = found.business;
  const now = new Date();
  const [reviews, rules, space] = await Promise.all([getBusinessReviews(found.ownerId), getBookingRules(found.ownerId, b), isDbId(b.id) ? getSpacePhotos(b.id) : []]);

  // Booking works as on the business's own page: the booking sheet when bookings are on, else a
  // WhatsApp request, or the owner's own booking link.
  const external = b.actions.find((a) => a.kind === "book")?.value.trim() || null;
  const bookable = b.services.filter((s) => s.id);
  const calendar = !external && !!rules && bookable.length > 0;
  // Only real bookings open a sheet here; otherwise Book goes straight to their WhatsApp (or their
  // own booking link) in a new tab. Search only lists businesses taking bookings, so this is for
  // listings opened from a shared link.
  const sheet = calendar;
  const href = external ?? bookingLink(b) ?? undefined;
  const bookAttrs = (s?: ServiceItem) => ({
    href,
    target: "_blank",
    rel: "noopener noreferrer",
    ...(sheet ? { "data-book": "", ...(s?.id ? { "data-book-id": s.id } : {}) } : {}),
  });

  const trade = tradesInOrder(b.trades)[0];
  const open = openLabel(b.hours, now);
  const goesToCustomers = b.workPlace === "home" || b.workPlace === "both";
  const where = b.workPlace === "home" ? `Comes to you · ${b.city}` : place(b.area, b.city);
  // The owner's own pin when they placed one, else their address in words.
  const exactPin = b.lat != null && b.lng != null && b.locationApprox === false;
  const directions =
    b.workPlace === "home"
      ? null
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(exactPin ? `${b.lat},${b.lng}` : `${b.name}, ${b.address || b.area}, ${b.city}`)}`;
  // Photos of the space lead (Your Tikka listing), then their work.
  const work = b.portfolio.filter((p) => p.kind !== "video");
  const photos = [
    ...space.map((p, i) => ({ id: `space-${i}`, url: p.url, thumbUrl: p.thumbUrl })),
    ...work.map((p) => ({ id: p.id, url: p.url, thumbUrl: p.thumbUrl })),
  ];
  const cover = space[0]?.url ?? b.page?.heroImageUrl ?? photos[0]?.url;
  const side = photos.filter((p) => p.url !== cover).slice(0, 2);
  const team = b.page?.team ?? [];
  const shown = reviews.filter((r) => r.status !== "hidden").slice(0, 6);

  return (
    <>
      <div className="mx-auto max-w-6xl px-4 pt-4 pb-28 sm:px-6 lg:pb-16">
        <nav aria-label="Breadcrumb" className="text-caption flex flex-wrap items-center gap-1.5 text-ink-muted">
          <Link href="/" className="hover:text-ink">
            Home
          </Link>
          <span aria-hidden="true">·</span>
          {trade && (
            <>
              <Link href={searchHref({ trade: trade.id })} className="hover:text-ink">
                {trade.name}
              </Link>
              <span aria-hidden="true">·</span>
            </>
          )}
          <Link href={searchHref({ where: b.city })} className="hover:text-ink">
            {b.city}
          </Link>
          <span aria-hidden="true">·</span>
          <span className="text-ink">{b.name}</span>
        </nav>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-[clamp(32px,6vw,56px)] leading-[1.05] font-bold tracking-tight">{b.name}</h1>
          {/* Their own website: the bio link, with everything about them. */}
          <a target="_blank" rel="noopener" href={`/${b.slug}`} className="btn btn-secondary mt-1 min-h-11 shrink-0 rounded-pill px-4">
            <Globe size={18} aria-hidden="true" /> View website
          </a>
        </div>
        <div className="text-body mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <Stars rating={b.rating} count={b.reviewCount} />
          {open && (
            <span>
              <span className={open.open ? "font-semibold text-success" : "text-ink-muted"}>{open.open ? "Open" : "Closed"}</span>
              <span className="text-ink-muted"> · {open.open ? open.text.replace(/^Open /, "") : open.text}</span>
            </span>
          )}
          <span className="text-ink-muted">· {where}</span>
          {directions && (
            <a href={directions} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand">
              Get directions
            </a>
          )}
        </div>

        {/* Photos: one big, two beside it on a computer. */}
        {cover && (
          <div className="mt-5 grid gap-3 md:grid-cols-[2fr_1fr] md:grid-rows-2">
            <img src={cover} alt="" {...blurProps(cover)} className="aspect-[4/3] w-full rounded-card object-cover md:row-span-2 md:aspect-auto md:h-full md:max-h-[480px]" />
            {side.map((p) => (
              <img key={p.id} src={p.thumbUrl || p.url} alt="" loading="lazy" {...blurProps(p.thumbUrl || p.url)} className="hidden aspect-[4/3] w-full rounded-card object-cover md:block" />
            ))}
          </div>
        )}
        {photos.length > 3 && (
          <a target="_blank" rel="noopener" href={`/${b.slug}#work`} className="text-label mt-3 inline-flex min-h-11 items-center underline underline-offset-4">
            See all {photos.length} photos
          </a>
        )}

        <div className="mt-8 grid items-start gap-10 lg:grid-cols-[1fr_360px]">
          <div className="grid gap-12">
            {/* Services */}
            <section aria-labelledby="services-h">
              <h2 id="services-h" className="text-[26px] font-bold tracking-tight">
                Services
              </h2>
              <ul className="mt-4 grid gap-3">
                {b.services.map((s) => (
                  <li key={s.id ?? s.name} className="flex items-center gap-4 rounded-card border border-line bg-surface-raised p-4">
                    <div className="min-w-0 flex-1">
                      <b className="block text-[16px]">{s.name}</b>
                      <span className="text-caption block text-ink-muted">
                        {[s.eventDay ? "A whole day" : minutesLabel(s.minutes) || s.duration, s.options && s.options.length > 1 ? `${s.options.length} options` : ""].filter(Boolean).join(" · ")}
                      </span>
                      <b className="mt-1.5 block text-[15px]">{servicePrice(s)}</b>
                    </div>
                    {href || sheet ? (
                      <a {...bookAttrs(s)} className="btn btn-secondary shrink-0 rounded-pill px-5">
                        Book
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>

            {team.length > 0 && (
              <section aria-labelledby="team-h">
                <h2 id="team-h" className="text-[26px] font-bold tracking-tight">
                  Team
                </h2>
                <ul className="mt-4 flex flex-wrap gap-6">
                  {team.map((t) => (
                    <li key={t.id} className="grid w-24 justify-items-center gap-2 text-center">
                      {t.photoUrl ? (
                        <img src={t.photoUrl} alt="" className="size-20 rounded-pill object-cover" />
                      ) : (
                        <span className="grid size-20 place-items-center rounded-pill bg-brand-soft text-[28px] font-bold text-brand">{t.name.slice(0, 1)}</span>
                      )}
                      <span className="text-label">{t.name}</span>
                      {t.role && <span className="text-caption -mt-1.5 text-ink-muted">{t.role}</span>}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {shown.length > 0 && (
              <section aria-labelledby="reviews-h">
                <h2 id="reviews-h" className="text-[26px] font-bold tracking-tight">
                  Reviews
                </h2>
                <div className="mt-2">
                  <Stars rating={b.rating} count={b.reviewCount} />
                </div>
                <ul className="mt-4 grid gap-4 sm:grid-cols-2">
                  {shown.map((r) => (
                    <li key={r.id} className="rounded-card border border-line bg-surface-raised p-4">
                      <div className="flex items-center justify-between gap-2">
                        <b>{r.name}</b>
                        <span className="inline-flex items-center gap-1 text-[14px]">
                          <Star size={14} className="fill-current text-gold" aria-hidden="true" />
                          {r.rating}
                        </span>
                      </div>
                      {r.text && <p className="text-body mt-2 text-ink-muted">{r.text}</p>}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section aria-labelledby="about-h">
              <h2 id="about-h" className="text-[26px] font-bold tracking-tight">
                About
              </h2>
              {b.about && <p className="text-body-lg mt-3 leading-relaxed text-ink-muted">{b.about}</p>}
              <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-label">Where</dt>
                  <dd className="text-body mt-1 text-ink-muted">
                    {b.workPlace === "home" ? "Comes to you" : [b.address, place(b.area, b.city)].filter(Boolean).join(", ")}
                    {goesToCustomers && b.travelReach ? `. Goes to customers ${reachLabel(b.travelReach, b).toLowerCase()}${b.travelFee ? ` (₦${b.travelFee.toLocaleString("en-NG")} travel fee)` : ""}.` : ""}
                  </dd>
                </div>
                {b.hours && (
                  <div>
                    <dt className="text-label">Opening hours</dt>
                    <dd className="text-body mt-1 grid gap-0.5 text-ink-muted">
                      {(
                        [
                          ["Monday to Friday", b.hours.weekdays],
                          ["Saturday", b.hours.saturday],
                          ["Sunday", b.hours.sunday],
                        ] as const
                      ).map(([d, h]) => (
                        <span key={d} className="flex justify-between gap-4">
                          <span>{d}</span>
                          <span>{h.open ? `${formatTime(h.from)} – ${formatTime(h.to)}` : "Closed"}</span>
                        </span>
                      ))}
                    </dd>
                  </div>
                )}
              </dl>
            </section>

            <ListingExtras amenities={b.amenities} languages={b.languages} />
          </div>

          {/* The booking card: stays in view on a computer. */}
          <aside className="hidden rounded-card border border-line bg-surface-raised p-6 shadow-raised lg:sticky lg:top-24 lg:block">
            <h2 className="text-[28px] leading-tight font-bold tracking-tight">{b.name}</h2>
            <div className="mt-2">
              <Stars rating={b.rating} count={b.reviewCount} />
            </div>
            {(href || sheet) && (
              <a {...bookAttrs()} className="btn btn-lg mt-5 w-full rounded-pill">
                Book now
              </a>
            )}
            <div className="mt-5 grid gap-3 border-t border-line pt-5">
              {open && (
                <p className="text-body flex items-start gap-2.5">
                  <Clock3 size={20} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <span>
                    <span className={open.open ? "text-success" : ""}>{open.open ? "Open" : "Closed"}</span> · {open.open ? open.text.replace(/^Open /, "") : open.text}
                  </span>
                </p>
              )}
              <p className="text-body flex items-start gap-2.5">
                <MapPin size={20} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>
                  {where}
                  {directions && (
                    <>
                      {" "}
                      <a href={directions} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand">
                        Get directions
                      </a>
                    </>
                  )}
                </span>
              </p>
              <a target="_blank" rel="noopener" href={`/${b.slug}`} className="text-body flex items-center gap-2.5 font-semibold text-brand">
                <Globe size={20} aria-hidden="true" /> Visit their website <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            </div>
          </aside>
        </div>
      </div>

      {/* Phones: Book now within thumb reach. */}
      {(href || sheet) && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface-raised px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] lg:hidden">
          <a {...bookAttrs()} className="btn btn-lg w-full rounded-pill">
            Book now
          </a>
        </div>
      )}

      {calendar ? (
        <BookingFlow
          business={{
            slug: b.slug,
            name: b.name,
            workPlace: b.workPlace ?? "shop",
            travelFee: b.travelFee ?? 0,
            reach: b.travelReach ? reachLabel(b.travelReach, b) : `Anywhere in ${b.city}`,
            address: b.address || place(b.area, b.city),
            rules: b.bookingRules ?? [],
            deposit: demoDepositRule(found.ownerId, b),
            gapMinutes: b.gapMinutes,
            homeGapMinutes: b.homeGapMinutes,
            live: isDbId(found.ownerId),
          }}
          services={bookable}
          theme={sheetTheme(pageStyle(b), b.page?.galleryTone, b.brandColor, b.onBrandColor)}
          via="search"
        />
      ) : null}
    </>
  );
}

export default function ListingPage({ params }: PageProps<"/book/[slug]">) {
  return (
    <>
      <HomeHeader />
      <main>
        <Suspense fallback={<LoadingGrid className="mx-auto mt-6 max-w-6xl" />}>
          <Listing params={params} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}
