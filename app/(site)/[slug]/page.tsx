import "@/components/tikka/tikka.css";
import "@/components/business/site.css";
import type { Metadata } from "next";
import { ArrowUpRight, BadgeCheck, Star } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment, Suspense } from "react";
import { Gallery } from "@/components/business/Gallery";
import { Reveal } from "@/components/business/Reveal";
import { ServicesSection } from "@/components/business/ServicesSection";
import { NotifyMe } from "@/components/market/NotifyMe";
import { Logo } from "@/components/site/Logo";
import { ActionIcon, actionHref } from "@/components/tikka/ActionIcon";
import { getBusinessBySlug, getBusinessReviews, getDrops } from "@/lib/data";
import { clockTime, count, place, shortDate } from "@/lib/format";
import { bookingLink, focalPosition, heroHeadline, serviceGroups, showsLocation, visibleSections, whereLine } from "@/lib/page";
import { SITE } from "@/lib/qr";
import { formatTime } from "@/lib/setup";
import type { Business, Drop, OpeningHours } from "@/lib/types";

// The free business page: a one-page website for the business's Instagram and WhatsApp bio
// (PRD A5). One fixed editorial layout filled with their content and brand colour; empty
// sections hide. Animation is CSS plus one IntersectionObserver (components/business/Reveal).

export async function generateMetadata({ params }: PageProps<"/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const found = await getBusinessBySlug(slug);
  if (!found) return { title: "Page not found" };
  const b = found.business;
  const title = `${b.name} · ${place(b.area, b.city)} · Tikka`;
  const description = b.page?.subline || b.about || `${b.name}: ${b.category} in ${place(b.area, b.city)}. Services, prices, photos and reviews.`;
  const image = b.page?.heroImageUrl ?? (b.logoUrl?.startsWith("/") ? b.logoUrl : undefined);
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: `${SITE}/${b.slug}` },
    openGraph: { title, description, url: `${SITE}/${b.slug}`, type: "website", images: image ? [image] : undefined },
    robots: { index: true, follow: true },
  };
}

/** Text as rising words: each word is clipped and slides up (delays capped so long text stays quick). */
function Words({ text, start = 0, tagAfter, tag }: { text: string; start?: number; tagAfter?: number; tag?: string }) {
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <>
      {words.map((w, i) => (
        <Fragment key={i}>
          <span className="w">
            <span className="wi" style={{ "--i": Math.min(start + i, 24) } as React.CSSProperties}>
              {w}
            </span>
          </span>
          {tag && i === (tagAfter ?? 0) && <span className="biz-tag">{tag}</span>}{" "}
        </Fragment>
      ))}
    </>
  );
}

/** Big type that fills the width: sized from the longest line so the name never overflows. */
function fitSize(name: string): string {
  const words = name.trim().split(/\s+/);
  const oneLine = name.length <= 14;
  const chars = oneLine ? name.length : Math.max(...words.map((w) => w.length), 6);
  // Bricolage at 800, uppercase, tight tracking: about 0.53em per letter.
  return `min(${Math.min(22, 86 / (chars * 0.55)).toFixed(2)}vw, 250px)`;
}

function hoursRows(h: OpeningHours): [string, string][] {
  const fmt = (d: OpeningHours["weekdays"]) => (d.open ? `${formatTime(d.from)} – ${formatTime(d.to)}` : "Closed");
  return [
    ["Monday – Friday", fmt(h.weekdays)],
    ["Saturday", fmt(h.saturday)],
    ["Sunday", fmt(h.sunday)],
  ];
}

/** "OUR [ SERVICES ] SERVICES": the section heading with its bracketed tag. */
function Heading({ id, before, tag, after, center = false }: { id: string; before: string; tag: string; after: string; center?: boolean }) {
  return (
    <h2 id={id} data-reveal="words" className={`biz-display text-[clamp(40px,9vw,120px)] ${center ? "text-center" : ""}`}>
      <Words text={before} />
      <span className="biz-tag">{tag}</span> <Words text={after} start={before.split(" ").length} />
    </h2>
  );
}

function Mark({ b, size }: { b: Business; size: number }) {
  return (
    <span className="grid shrink-0 place-items-center overflow-hidden rounded-pill font-extrabold" style={{ width: size, height: size, background: b.brandColor, color: b.onBrandColor, fontSize: size * 0.36 }}>
      {b.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={b.logoUrl} alt="" className="size-full object-cover" />
      ) : (
        b.initials
      )}
    </span>
  );
}

/** The live drop band: a moving ticker, the only place the page promotes anything. */
function DropBand({ b, live, next }: { b: Business; live?: Drop; next?: Drop }) {
  if (live) {
    const left = count(Math.max(0, live.total - live.claimed));
    const item = (k: number) => (
      <span key={k} className="flex shrink-0 items-center gap-6 pr-6 font-mono text-[13px] uppercase tracking-[0.12em]">
        <span className="text-gold">● Live now</span>
        <span>{live.name}</span>
        <span className="text-on-night-muted">{left} Tikkas left</span>
        <span className="text-on-night-muted">Ends {shortDate(live.endsAt)}</span>
        <span aria-hidden="true">✦</span>
      </span>
    );
    return (
      <div data-theme="light" className="stage relative flex items-center overflow-hidden bg-night text-on-night">
        <div className="min-w-0 flex-1 overflow-hidden py-4" aria-hidden="true">
          <div className="biz-marquee">{[0, 1, 2, 3, 4, 5].map(item)}</div>
        </div>
        <p className="sr-only">
          Live now: {live.name}, {left} Tikkas left, ends {shortDate(live.endsAt)}.
        </p>
        <Link href={`/d/${b.slug}/${live.slug}`} className="biz-btn shrink-0 self-stretch bg-gold text-on-gold">
          Claim yours
          <ArrowUpRight aria-hidden="true" />
        </Link>
      </div>
    );
  }
  return (
    <div className="border-y border-[var(--biz-rule)] px-4 py-4 sm:px-8">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <p className="text-body text-ink-muted">
          {next ? (
            <>
              <b className="text-ink">{next.name}</b> opens {shortDate(next.startsAt)}, {clockTime(next.startsAt)}.
            </>
          ) : (
            <>Be the first to hear when {b.name} has something new.</>
          )}
        </p>
        <NotifyMe
          businessSlug={b.slug}
          businessName={b.name}
          dropSlug={next?.slug}
          opensLabel={next ? `${shortDate(next.startsAt)}, ${clockTime(next.startsAt)}` : undefined}
          className="biz-btn border border-ink bg-transparent text-ink"
        >
          {next ? "Notify me" : "Get notified"}
        </NotifyMe>
      </div>
    </div>
  );
}

async function BusinessPage({ params }: { params: PageProps<"/[slug]">["params"] }) {
  const { slug } = await params;
  const found = await getBusinessBySlug(slug);
  if (!found) notFound();
  const b = found.business;
  const [drops, reviews] = await Promise.all([getDrops({ id: found.ownerId }), getBusinessReviews(found.ownerId)]);
  const live = drops.find((d) => d.status === "live");
  const next = drops.find((d) => d.status === "scheduled");
  const sections = new Set(visibleSections(b, { reviews: reviews.length }));
  const page = b.page ?? {};
  const book = bookingLink(b);
  const call = b.actions.find((a) => a.kind === "call");
  const instagram = b.actions.find((a) => a.kind === "instagram");
  const loc = place(b.area, b.city);
  const mapsQuery = b.address || `${b.name}, ${loc}`;
  const statement = heroHeadline(b);
  const intro = page.subline?.trim() || `Welcome to ${b.name}.`;
  const nav = [
    sections.has("about") && ["About", "#about"],
    sections.has("services") && ["Services", "#services"],
    sections.has("portfolio") && ["Work", "#work"],
    sections.has("location") && ["Visit", "#visit"],
  ].filter(Boolean) as [string, string][];
  const style = { "--biz": b.brandColor, "--on-biz": b.onBrandColor } as React.CSSProperties;

  return (
    <div id="biz" data-theme="light" className="biz" style={style}>
      <Reveal rootId="biz" />

      {/* 1. Hero: full-bleed photo, slim nav, a line and a link bottom-left, the name in giant type. */}
      {/* The backdrop: a soft, blurred copy of the same photo (same file, no extra download), with
          the sharp hero inset on top of it like a card. */}
      <header className="biz-backdrop relative isolate p-2.5 sm:p-5 lg:p-8" style={{ background: b.brandColor }}>
        {page.heroImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={page.heroImageUrl} alt="" aria-hidden="true" className="biz-backdrop-img absolute inset-0 -z-10 size-full object-cover" />
        )}
        <div className="biz-hero-frame relative isolate flex min-h-[calc(100svh-20px)] flex-col overflow-hidden text-on-night sm:min-h-[calc(100svh-40px)] lg:min-h-[calc(100svh-64px)]" style={{ background: b.brandColor }}>
        {page.heroImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={page.heroImageUrl} alt="" fetchPriority="high" className="biz-hero-img absolute inset-0 -z-10 size-full object-cover" style={{ objectPosition: focalPosition(page.heroFocal) }} />
        ) : (
          <div className="absolute inset-0 -z-10" aria-hidden="true">
            <div className="absolute -right-32 -top-32 size-[520px] rounded-pill bg-on-night/10" />
            <div className="absolute -bottom-40 -left-24 size-96 rounded-pill bg-night/15" />
          </div>
        )}
        <div className="absolute inset-0 -z-10 bg-linear-to-b from-night/45 via-night/5 to-night/65" aria-hidden="true" />

        <nav className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 pt-4 sm:px-8 sm:pt-6" aria-label={b.name}>
          <span className="flex min-w-0 items-center gap-2.5">
            <Mark b={b} size={36} />
            <span className="truncate font-display text-[17px] font-extrabold uppercase tracking-[-0.02em]">{b.name}</span>
          </span>
          {nav.length > 0 && (
            <ul className="hidden items-center gap-7 md:flex">
              {nav.map(([l, h]) => (
                <li key={h}>
                  <a href={h} className="text-[12px] font-semibold uppercase tracking-[0.1em] text-on-night/85 hover:text-on-night">
                    {l}
                  </a>
                </li>
              ))}
            </ul>
          )}
          {book && (
            <a href={book} target="_blank" rel="noopener noreferrer" className="biz-btn min-h-10 bg-ink px-4 text-[13px] text-surface-raised">
              <span className="sm:hidden">Book</span>
              <span className="hidden sm:inline">Book an appointment</span>
            </a>
          )}
        </nav>

        <div className="mt-auto w-full px-4 pb-6 sm:px-8 sm:pb-8">
          <div className="biz-fade-in mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-x-8 gap-y-3">
            <div className="max-w-md">
              <div className="mb-3 flex flex-wrap gap-2">
                {b.verified && (
                  <span className="inline-flex items-center gap-1 text-[12px] font-semibold uppercase tracking-[0.08em]">
                    <BadgeCheck size={14} aria-hidden="true" /> Verified on Tikka
                  </span>
                )}
                {b.rating ? (
                  <span className="inline-flex items-center gap-1 text-[12px] font-semibold uppercase tracking-[0.08em]">
                    <Star size={13} className="fill-current text-gold" aria-hidden="true" /> {b.rating} · {count(b.reviewCount)} {b.reviewCount === 1 ? "review" : "reviews"}
                  </span>
                ) : null}
              </div>
              <p className="text-body-lg text-on-night/90">{intro}</p>
              <p className="text-body mt-1 text-on-night/70">{whereLine(b)}</p>
              {book && (
                <a href={book} target="_blank" rel="noopener noreferrer" className="biz-link text-[17px]">
                  Book an appointment
                </a>
              )}
            </div>
          </div>
          <h1 className="biz-hero-title biz-display mx-auto mt-2 max-w-7xl" style={{ fontSize: fitSize(b.name) }}>
            <Words text={b.name} />
          </h1>
        </div>
        </div>
      </header>

      {/* 2. The live drop band */}
      <DropBand b={b} live={live} next={next} />

      {/* 3. About: a big statement with its tag, then the story. */}
      {sections.has("about") && (
        <section id="about" aria-labelledby="about-h" className="scroll-mt-4 px-4 py-24 sm:px-8 sm:py-36">
          <div className="mx-auto grid max-w-6xl justify-items-center gap-10 text-center">
            <h2 id="about-h" data-reveal="words" className="biz-display text-[clamp(34px,7.2vw,96px)]">
              <Words text={statement} tagAfter={0} tag="About us" />
            </h2>
            <div data-reveal="up" className="max-w-xl">
              <p className="text-body-lg whitespace-pre-line text-ink-muted">{b.about}</p>
              {sections.has("services") && (
                <a href="#services" className="biz-link mt-4">
                  See our services
                </a>
              )}
            </div>
            {page.aboutImageUrl && (
              <div data-reveal="img" className="aspect-[16/9] w-full max-w-5xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={page.aboutImageUrl} alt="" loading="lazy" className="size-full object-cover" />
              </div>
            )}
          </div>
        </section>
      )}

      {/* 4. Services */}
      {sections.has("services") && (
        <section id="services" aria-labelledby="services-h" className="scroll-mt-4 border-t border-[var(--biz-rule)] px-4 py-24 sm:px-8 sm:py-32">
          <div className="mx-auto max-w-7xl">
            <Heading id="services-h" before="Our" tag="Services" after="Services" center />
            <div className="mt-12">
              <ServicesSection
                services={b.services}
                groups={serviceGroups(b.services)}
                links={b.services.map((s) => bookingLink(b, s))}
                brand={{ color: b.brandColor, on: b.onBrandColor, initials: b.initials }}
              />
            </div>
          </div>
        </section>
      )}

      {/* 5. Portfolio */}
      {sections.has("portfolio") && (
        <section id="work" aria-labelledby="work-h" className="scroll-mt-4 bg-surface px-4 py-24 sm:px-8 sm:py-32">
          <div className="mx-auto max-w-7xl">
            <Heading id="work-h" before="Our" tag="Portfolio" after="Work" />
            <div data-reveal="up" className="mt-12">
              <Gallery photos={b.portfolio} businessName={b.name} editorial />
            </div>
          </div>
        </section>
      )}

      {/* 6. Reviews (people who redeemed only) */}
      {sections.has("reviews") && (
        <section id="reviews" aria-labelledby="reviews-h" className="scroll-mt-4 px-4 py-24 sm:px-8 sm:py-32">
          <div className="mx-auto max-w-7xl">
            <Heading id="reviews-h" before="Kind" tag="Reviews" after="Words" />
            {b.rating ? (
              <p className="text-body mt-6 flex items-center gap-1.5 text-ink-muted">
                <Star size={16} className="fill-current text-gold" aria-hidden="true" />
                {b.rating} from {count(b.reviewCount)} {b.reviewCount === 1 ? "review" : "reviews"} · every review is from a real visit
              </p>
            ) : null}
            <ul className="-mx-4 mt-10 flex snap-x snap-mandatory scroll-px-4 gap-px overflow-x-auto bg-[var(--biz-rule)] px-4 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3">
              {reviews.slice(0, 6).map((r, i) => (
                <li key={r.id} data-reveal="up" style={{ "--i": i % 3 } as React.CSSProperties} className="flex w-[82%] shrink-0 snap-start flex-col bg-surface-raised p-6 sm:w-auto sm:p-8">
                  <p className="flex gap-0.5" aria-label={`${r.rating} out of 5`}>
                    {Array.from({ length: 5 }, (_, k) => (
                      <Star key={k} size={15} className={k < r.rating ? "fill-current text-gold" : "text-line-strong"} aria-hidden="true" />
                    ))}
                  </p>
                  {r.text && <p className="mt-5 text-[20px] font-medium leading-snug tracking-[-0.01em]">&ldquo;{r.text}&rdquo;</p>}
                  <p className="mt-auto pt-6 text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-muted">{r.name}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* 7. Team (optional) */}
      {sections.has("team") && (
        <section id="team" aria-labelledby="team-h" className="scroll-mt-4 border-t border-[var(--biz-rule)] px-4 py-24 sm:px-8 sm:py-32">
          <div className="mx-auto max-w-7xl">
            <Heading id="team-h" before="The" tag="Team" after="People" />
            <ul className="mt-12 grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
              {page.team!.map((t, i) => (
                <li key={t.id} data-reveal="up" style={{ "--i": i % 4 } as React.CSSProperties}>
                  <div data-reveal="img" className="grid aspect-[3/4] place-items-center text-[56px] font-extrabold" style={{ background: b.brandColor, color: b.onBrandColor }}>
                    {t.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={t.photoUrl} alt="" loading="lazy" className="size-full object-cover" />
                    ) : (
                      t.name.trim().charAt(0)
                    )}
                  </div>
                  <p className="mt-4 font-display text-[18px] font-extrabold uppercase tracking-[-0.02em]">{t.name}</p>
                  {t.role && <p className="text-body text-ink-muted">{t.role}</p>}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* 8. Text section (optional): big title left, words right. */}
      {sections.has("text") && (
        <section id="more" aria-labelledby="more-h" className="scroll-mt-4 bg-surface px-4 py-24 sm:px-8 sm:py-32">
          <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-2 lg:items-start">
            <h2 id="more-h" data-reveal="words" className="biz-display text-[clamp(40px,7vw,96px)]">
              <Words text={page.textTitle!} />
            </h2>
            <p data-reveal="up" className="text-body-lg max-w-xl whitespace-pre-line text-ink-muted lg:pt-3">
              {page.textBody}
            </p>
          </div>
        </section>
      )}

      {/* 9. FAQs (optional) */}
      {sections.has("faqs") && (
        <section id="faqs" aria-labelledby="faqs-h" className="scroll-mt-4 px-4 py-24 sm:px-8 sm:py-32">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1fr_1.4fr]">
            <Heading id="faqs-h" before="Good" tag="FAQs" after="Questions" />
            <div className="border-t border-[var(--biz-rule)]">
              {page.faqs!.map((f) => (
                <details key={f.id} className="group border-b border-[var(--biz-rule)]">
                  <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-6 py-5 font-display text-[19px] font-bold leading-tight [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <span aria-hidden="true" className="text-[26px] font-light transition-transform duration-300 group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="text-body-lg -mt-1 max-w-2xl pb-6 text-ink-muted">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 10. Hours and location (businesses people visit only) */}
      {sections.has("location") && (
        <section id="visit" aria-labelledby="visit-h" className="scroll-mt-4 border-t border-[var(--biz-rule)] px-4 py-24 sm:px-8 sm:py-32">
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-2">
            <div>
              <Heading id="visit-h" before="Come" tag="Visit" after="Say hi" />
              <p data-reveal="up" className="text-body-lg mt-8">
                {b.address && <span className="block">{b.address}</span>}
                <span className="block text-ink-muted">{loc}</span>
              </p>
              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`} target="_blank" rel="noopener noreferrer" className="biz-link mt-2 gap-1">
                Directions <ArrowUpRight size={18} aria-hidden="true" />
              </a>
            </div>
            {b.hours && (
              <dl data-reveal="up" className="self-end border-t border-[var(--biz-rule)]">
                {hoursRows(b.hours).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 border-b border-[var(--biz-rule)] py-5">
                    <dt className="text-[13px] font-semibold uppercase tracking-[0.1em] text-ink-muted">{k}</dt>
                    <dd className="text-body-lg font-semibold">{v}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </section>
      )}

      {/* 11. Final call to action */}
      <section className="px-4 py-24 sm:px-8 sm:py-32" style={{ background: b.brandColor, color: b.onBrandColor }} aria-labelledby="cta-h">
        <div className="mx-auto max-w-7xl">
          <h2 id="cta-h" data-reveal="words" className="biz-display text-[clamp(48px,11vw,170px)]">
            <Words text="Book your visit" />
          </h2>
          <div data-reveal="up" className="mt-10 flex flex-wrap items-center gap-3">
            {book && (
              <a href={book} target="_blank" rel="noopener noreferrer" className="biz-btn bg-surface-raised text-ink">
                <ActionIcon kind="whatsapp" />
                Book on WhatsApp
              </a>
            )}
            {call && (
              <a href={actionHref("call", call.value)} className="biz-btn border" style={{ borderColor: b.onBrandColor }}>
                <ActionIcon kind="call" />
                Call
              </a>
            )}
            {instagram && (
              <a href={actionHref("instagram", instagram.value)} target="_blank" rel="noopener noreferrer" className="biz-btn border" style={{ borderColor: b.onBrandColor }}>
                <ActionIcon kind="instagram" />
                Instagram
              </a>
            )}
          </div>
        </div>
      </section>

      {/* 12. Footer: made with Tikka (no marketplace link) */}
      <footer className="px-4 pb-28 pt-8 sm:px-8 sm:pb-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <p className="text-caption text-ink-muted">
            © {b.name} · {showsLocation(b) ? loc : whereLine(b)}
          </p>
          <Link href="/" className="text-caption flex items-center gap-2 text-ink-muted hover:text-ink">
            Made with
            <Logo height={18} />
            <span>· Get a free page for your business</span>
          </Link>
        </div>
      </footer>

      {/* Phones: booking stays one tap away. */}
      {book && (
        <div className="fixed inset-x-0 bottom-0 z-20 bg-surface-raised/95 px-4 pb-[calc(10px+env(safe-area-inset-bottom))] pt-2.5 backdrop-blur sm:hidden">
          <a href={book} target="_blank" rel="noopener noreferrer" className="biz-btn w-full bg-ink text-surface-raised">
            <ActionIcon kind="whatsapp" />
            Book on WhatsApp
          </a>
        </div>
      )}
    </div>
  );
}

export default function Page(props: PageProps<"/[slug]">) {
  return (
    <main className="min-h-dvh bg-surface-raised">
      <Suspense fallback={<div className="h-dvh bg-surface-raised" />}>
        <BusinessPage params={props.params} />
      </Suspense>
    </main>
  );
}
