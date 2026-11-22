import "./photo.css";
import { ArrowUpRight, BadgeCheck, CalendarDays, Play, Star } from "lucide-react";
import Link from "next/link";
import { DropBand } from "@/components/business/DropBand";
import { ACTION_LABEL, ActionIcon, actionHref } from "@/components/tikka/ActionIcon";
import { count, naira, place } from "@/lib/format";
import { photoSrcSet } from "@/lib/media-path";
import { focalPosition, heroHeadline, priceText, showsLocation, whereLine, type PageDrop, type SectionId } from "@/lib/page";
import { cameraChips } from "@/lib/photo-meta";
import { collectionLine, portfolioView, type ShownCollection } from "@/lib/portfolio";
import { formatTime } from "@/lib/setup";
import { isSocial } from "@/lib/social";
import type { Business, OpeningHours, PortfolioPhoto, Review } from "@/lib/types";
import { PhotoStage, type StageCollection, type StagePhoto } from "./PhotoStage";

// The Photography style of the free business page (PRD A5; prototype in
// design/page-styles/photography.html). The same content and the same booking as the beauty page;
// only the experience changes: an ink room that takes each photo's colour, a contact-sheet opening,
// exhibitions (collections), a photo book that keeps every photo's shape, and a full-screen viewer.
// Everything here is server-rendered; PhotoStage adds the motion and the full-screen layers.

/** A collection named like this shows as "The studio": the sets and backdrops, swiped sideways. */
const SETS_NAME = /\b(studio|sets?|backdrops?)\b/i;

export interface PhotoPageProps {
  b: Business;
  live?: PageDrop;
  next?: PageDrop;
  reviews: Review[];
  sections: Set<SectionId>;
  /** Where Book goes (the calendar's "#book", the WhatsApp request, or the owner's own link). */
  book: string | null;
  bookProps: Record<string, string | undefined>;
  /** Book opens a sheet (calendar or WhatsApp request) rather than a link. */
  sheet: boolean;
  /** Each service's own Book link, in b.services order. */
  serviceLinks: (string | null)[];
  deposits: Record<string, number>;
}

const ratio = (p: PortfolioPhoto) => (p.width && p.height ? p.width / p.height : 0.8);

function hoursRows(h: OpeningHours): [string, string][] {
  const fmt = (d: OpeningHours["weekdays"]) => (d.open ? `${formatTime(d.from)} – ${formatTime(d.to)}` : "Closed");
  return [
    ["Monday – Friday", fmt(h.weekdays)],
    ["Saturday", fmt(h.saturday)],
    ["Sunday", fmt(h.sunday)],
  ];
}

/** The name in giant type, sized so a long name never runs past two lines. */
function nameSize(name: string): string {
  const words = name.trim().split(/\s+/);
  const chars = name.length <= 12 ? name.length : Math.max(...words.map((w) => w.length), Math.ceil(name.length / 2), 6);
  return `min(${Math.min(18, 86 / (chars * 0.5)).toFixed(2)}vw, 240px)`;
}

/** A photo in its own colour; the image fades in once loaded (PhotoStage marks it). */
function Ph({ p, sizes, eager = false, className = "" }: { p: PortfolioPhoto; sizes: string; eager?: boolean; className?: string }) {
  const src = p.kind === "video" ? p.thumbUrl : p.url;
  return (
    <div className={`pg-ph ${className}`} data-tone={p.tone} style={p.tone ? ({ "--tone": p.tone } as React.CSSProperties) : undefined}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} srcSet={p.kind === "video" ? undefined : photoSrcSet(p.url)} sizes={sizes} alt={p.caption ?? ""} loading={eager ? "eager" : "lazy"} decoding="async" />
    </div>
  );
}

function Heading({ n, label, children, id }: { n: number; label: string; children: React.ReactNode; id: string }) {
  return (
    <div>
      <p data-pg-r className="pg-eyebrow">
        <span className="n">{String(n).padStart(2, "0")}</span>
        {label}
      </p>
      <h2 id={id} data-pg-r className="pg-h2">
        {children}
      </h2>
    </div>
  );
}

export function PhotoPage({ b, live, next, reviews, sections, book, bookProps, sheet, serviceLinks, deposits }: PhotoPageProps) {
  const page = b.page ?? {};
  const work = portfolioView(b);
  const sets = work.collections.find((c) => SETS_NAME.test(c.name));
  const exhibitions = work.collections.filter((c) => c !== sets);
  const photos = b.portfolio;
  const loc = place(b.area, b.city);
  const where = showsLocation(b) ? loc : whereLine(b);
  const heroPhoto = photos.find((p) => p.kind !== "video" && ratio(p) >= 1) ?? photos.find((p) => p.kind !== "video");
  const heroSrc = page.heroImageUrl ?? heroPhoto?.url;
  const wide = photos.find((p) => p.kind !== "video" && ratio(p) > 1.3 && p.url !== heroSrc);
  const endPhoto = [...photos].reverse().find((p) => p.kind !== "video" && p !== wide && p.url !== heroSrc);
  const call = b.actions.find((a) => a.kind === "call");
  const socials = b.actions.filter((a) => isSocial(a.kind));
  const statement = heroHeadline(b);
  const intro = page.subline?.trim() || statement;
  const style = { "--biz": b.brandColor, "--on-biz": b.onBrandColor } as React.CSSProperties;

  // Section numbers in page order, counting only what this page shows.
  const order = [sections.has("about") && "about", exhibitions.length > 0 && "exh", sections.has("portfolio") && "work", sets && "sets", sections.has("services") && "sessions", sections.has("team") && "team", sections.has("faqs") && "faqs", sections.has("location") && "visit"].filter(Boolean) as string[];
  const num = (k: string) => order.indexOf(k) + 1;

  // What the client needs for the full-screen layers: every photo once, and collections by index.
  const index = new Map(photos.map((p, i) => [p.id, i]));
  const groupOf = new Map<string, string>();
  for (const c of work.collections) for (const p of c.photos) groupOf.set(p.id, c.name);
  const stagePhotos: StagePhoto[] = photos.map((p, i) => ({
    kind: p.kind ?? "photo",
    url: p.url,
    thumb: p.thumbUrl,
    r: ratio(p),
    measured: !!(p.width && p.height),
    tone: p.tone,
    title: p.caption?.trim() || `Frame ${String(i + 1).padStart(3, "0")}`,
    group: groupOf.get(p.id) ?? "More work",
    chips: cameraChips(p.camera),
  }));
  const toStage = (c: ShownCollection): StageCollection => ({ name: c.name, line: collectionLine(c), ids: c.photos.map((p) => index.get(p.id)!) });
  const groups = [...new Set(stagePhotos.map((p) => p.group))];
  // The opening: up to 12 of their own frames on a contact sheet, the hero circled.
  const sheetFrames = photos.filter((p) => p.kind !== "video").slice(0, 12);
  const playSheet = !!heroSrc && sheetFrames.length >= 6;
  const pick = Math.min(4, sheetFrames.length - 1);

  const bookLink = (className: string, children: React.ReactNode) =>
    book ? (
      <a {...bookProps} className={className}>
        {children}
      </a>
    ) : null;

  return (
    <div id="biz" data-theme="light" className={`pg ${page.galleryTone === "light" ? "pg-light" : ""}`} style={style}>
      {/* 0. The contact sheet (once per visit; shown before first paint by the inline script). */}
      {playSheet && (
        <>
          <div id="pg-sheet" className="pg-sheet" hidden aria-hidden="true" suppressHydrationWarning>
            <div className="pg-sheet-in">
              <div className="pg-sheet-head">
                <span>{b.name} · Contact sheet</span>
                <span>{sheetFrames.length} frames</span>
              </div>
              <div className="pg-strips" data-sheet-strips>
                {[0, 1, 2, 3].map((row) => (
                  <div key={row} className="pg-strip" style={{ "--cols": 3, "--k": row } as React.CSSProperties}>
                    {[0, 1, 2].map((col) => {
                      const k = row * 3 + col;
                      const p = sheetFrames[k % sheetFrames.length];
                      const picked = k === pick;
                      return (
                        <div key={col} className="pg-fr" data-picked={picked ? "" : undefined}>
                          <div className="pg-ph" style={p.tone ? ({ "--tone": p.tone } as React.CSSProperties) : undefined}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={picked ? heroSrc : p.thumbUrl} alt="" decoding="async" />
                          </div>
                          <i>{String(k + 1).padStart(2, "0")}A ▸</i>
                          {picked && (
                            <svg className="pg-pencil" viewBox="0 0 100 70" preserveAspectRatio="none" aria-hidden="true">
                              <path d="M52 4 C 84 2, 98 18, 96 36 C 94 58, 70 67, 46 66 C 18 65, 3 52, 4 34 C 5 16, 24 5, 56 6 C 62 6, 66 8, 70 10" />
                            </svg>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
            <button type="button" className="pg-skip" data-sheet-skip>
              Skip ›
            </button>
          </div>
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(){try{var s=document.getElementById("pg-sheet");if(!s||matchMedia("(prefers-reduced-motion: reduce)").matches)return;var k="pg-sheet:${b.slug}";if(sessionStorage.getItem(k))return;sessionStorage.setItem(k,"1");s.hidden=false;s.dataset.t=Date.now();s.className+=" play";setTimeout(function(){if(!s.dataset.run)s.hidden=true},6000)}catch(e){}})();`,
            }}
          />
        </>
      )}

      {/* 1. Top bar */}
      <header className="pg-bar" data-pg-bar>
        <div className="pg-wrap">
          <span className="pg-logo">
            <span className="pg-logo-mark" style={{ background: b.brandColor, color: b.onBrandColor }}>
              {b.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={b.logoUrl} alt="" />
              ) : (
                b.initials
              )}
            </span>
            <nav aria-label={b.name}>
              {exhibitions.length > 0 && <a href="#exhibitions">Exhibitions</a>}
              {sections.has("portfolio") && <a href="#work">Work</a>}
              {sections.has("services") && <a href="#sessions">Sessions</a>}
              {sections.has("location") && <a href="#visit">Visit</a>}
            </nav>
          </span>
          <a href="#top" className="pg-mark">
            {b.name}
          </a>
          {bookLink("pg-btn pg-btn-paper", "Book")}
        </div>
      </header>

      {/* 2. Hero */}
      <section id="top" className="pg-hero" data-pg-hero>
        <div className="pg-ph" data-tone={heroPhoto?.tone} style={heroPhoto?.tone ? ({ "--tone": heroPhoto.tone } as React.CSSProperties) : { background: b.brandColor }}>
          {heroSrc && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={heroSrc} alt="" fetchPriority="high" decoding="async" style={{ objectPosition: page.heroImageUrl ? focalPosition(page.heroFocal) : "50% 40%" }} />
          )}
        </div>
        <div className="pg-wrap pg-hero-in">
          {(b.verified || b.rating) && (
            <div className="pg-chips">
              {b.verified && (
                <span className="pg-chip">
                  <BadgeCheck size={14} aria-hidden="true" /> Verified on Tikka
                </span>
              )}
              {b.rating ? (
                <span className="pg-chip">
                  <b>★</b> {b.rating} · {count(b.reviewCount)} {b.reviewCount === 1 ? "review" : "reviews"}
                </span>
              ) : null}
            </div>
          )}
          <h1 style={{ fontSize: nameSize(b.name) }}>{b.name}</h1>
          <div className="pg-hero-meta">
            <p>{intro}</p>
            <span className="pg-mono pg-muted">{where}</span>
          </div>
        </div>
      </section>

      {/* 3. The live drop */}
      <DropBand b={b} live={live} next={next} dark />

      {/* 4. About */}
      {sections.has("about") && (
        <section id="about" aria-labelledby="about-h" className="pg-statement">
          <div className="pg-wrap">
            <p data-pg-r className="pg-eyebrow">
              <span className="n">{String(num("about")).padStart(2, "0")}</span>
              About
            </p>
            <h2 id="about-h" data-pg-r className="q">
              {statement}
            </h2>
            <div className="row">
              <p data-pg-r className="pg-lede" style={{ whiteSpace: "pre-line" }}>
                {b.about}
              </p>
              {page.aboutImageUrl && (
                <div data-pg-r className="pg-about-img">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={page.aboutImageUrl} srcSet={photoSrcSet(page.aboutImageUrl)} sizes="(min-width: 900px) 50vw, 100vw" alt="" loading="lazy" decoding="async" />
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* 5. Exhibitions (collections) */}
      {exhibitions.length > 0 && (
        <section id="exhibitions" aria-labelledby="exh-h" className="pg-sec" style={{ paddingBottom: 40 }}>
          <div className="pg-pin" data-pg-pin>
            <div className="pg-stick">
              <div className="pg-wrap">
                <div className="pg-sec-head">
                  <Heading n={num("exh")} label="Collections" id="exh-h">
                    The <em>exhibitions</em>
                  </Heading>
                  <p data-pg-r className="pg-lede">
                    Each one opens full screen. Take your time.
                  </p>
                </div>
              </div>
              <div className="pg-wall" data-pg-wall>
                {exhibitions.map((c, i) => (
                  <button key={c.id} type="button" className="pg-ex" data-ex={i} aria-label={`Open the ${c.name} exhibition`}>
                    <div className="frame">
                      <Ph p={c.cover} sizes="(min-width: 900px) 400px, 100vw" />
                    </div>
                    <div className="pg-ex-meta">
                      <span className="pg-mono">{String(i + 1).padStart(2, "0")}</span>
                      <h3>{c.name}</h3>
                      <span>{c.photos.length} photos</span>
                    </div>
                  </button>
                ))}
              </div>
              <div className="pg-wall-bar">
                <i data-pg-wall-bar />
              </div>
            </div>
          </div>
        </section>
      )}

      {/* A wide frame across the screen */}
      {wide && (
        <figure className="pg-bleed">
          <Ph p={wide} sizes="100vw" />
          <div className="pg-leak" data-pg-leak />
          {wide.caption && <figcaption>{wide.caption}</figcaption>}
        </figure>
      )}

      {/* 6. Every frame: the photo book */}
      {sections.has("portfolio") && (
        <section id="work" aria-labelledby="work-h" className="pg-sec">
          <div className="pg-wrap">
            <div className="pg-sec-head">
              <Heading n={num("work")} label="Portfolio" id="work-h">
                Every <em>frame</em>
              </Heading>
              <p data-pg-r className="pg-lede">
                Tap any photo to see it full screen.
              </p>
            </div>
            {groups.length > 1 && (
              <div className="pg-filters" role="group" aria-label="Show" data-pg-filters>
                <button type="button" aria-pressed="true" data-f="">
                  All
                </button>
                {groups.map((g) => (
                  <button key={g} type="button" aria-pressed="false" data-f={g}>
                    {g}
                  </button>
                ))}
              </div>
            )}
            <div className="pg-book" data-pg-book>
              {photos.map((p, i) => (
                <button key={p.id} type="button" className="pg-pic" data-i={i} data-g={stagePhotos[i].group} style={{ "--r": ratio(p) } as React.CSSProperties} aria-label={`Open ${stagePhotos[i].title}`}>
                  <Ph p={p} sizes="(min-width: 768px) 40vw, 60vw" />
                  {p.kind === "video" && (
                    <span className="play" aria-hidden="true">
                      <Play size={14} />
                    </span>
                  )}
                  <span className="num">{String(i + 1).padStart(3, "0")}</span>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 7. The studio: sets and backdrops */}
      {sets && (
        <section id="studio" aria-labelledby="sets-h" className="pg-sec">
          <div className="pg-wrap">
            <div className="pg-sec-head">
              <Heading n={num("sets")} label={sets.name} id="sets-h">
                Our <em>sets</em>
              </Heading>
              <p data-pg-r className="pg-lede">
                Swipe through them.
              </p>
            </div>
            <div className="pg-sets">
              {sets.photos.map((p, k) => (
                <figure key={p.id}>
                  <button type="button" data-set={k} aria-label={`Open ${p.caption ?? `set ${k + 1}`}`}>
                    <Ph p={p} sizes="(min-width: 768px) 31vw, 74vw" />
                  </button>
                  <figcaption>
                    <b>{p.caption ?? `Set ${String(k + 1).padStart(2, "0")}`}</b>
                    <span className="pg-mono pg-muted">{String(k + 1).padStart(2, "0")}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 8. Sessions: the same services, Book and deposits as every style */}
      {sections.has("services") && (
        <section id="sessions" aria-labelledby="sessions-h" className="pg-sec">
          <div className="pg-wrap">
            <div className="pg-sec-head">
              <Heading n={num("sessions")} label="Sessions" id="sessions-h">
                Book a <em>session</em>
              </Heading>
              {sheet && (
                <p data-pg-r className="pg-lede">
                  Pick a session and a free time.
                </p>
              )}
            </div>
            <div className="pg-sessions">
              {b.services.map((s, i) => {
                const link = serviceLinks[i];
                const price = s.priceKind === "ask" || s.price === null ? "" : priceText(s);
                const meta = [s.duration, s.description].filter(Boolean).join(" · ");
                return (
                  <div key={s.id ?? s.name} data-pg-r className="pg-session">
                    <h3>{s.name}</h3>
                    <span className="price">{price || "Price on request"}</span>
                    {(meta || (s.id && deposits[s.id])) && (
                      <p className="meta">
                        {meta}
                        {s.id && deposits[s.id] ? (
                          <>
                            {meta ? " · " : ""}
                            <i>{naira(deposits[s.id] / 100)} deposit to book</i>
                          </>
                        ) : null}
                      </p>
                    )}
                    {link && (
                      <div className="go">
                        <a
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="pg-btn pg-btn-paper"
                          {...(sheet ? { "data-book": "", "data-book-id": s.id, "data-book-name": s.name, "data-book-price": price } : {})}
                        >
                          Book <span className="sr-only">{s.name}</span>
                        </a>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* 9. Kind words (people who redeemed only) */}
      {sections.has("reviews") && (
        <section aria-labelledby="reviews-h" className="pg-sec">
          <div className="pg-wrap">
            <p className="pg-eyebrow" style={{ justifyContent: "center" }} id="reviews-h">
              Kind words
            </p>
            <div className="pg-quotes" style={{ marginTop: 22 }}>
              {reviews.slice(0, 6).map((r) => (
                <figure key={r.id} className="pg-quote">
                  <p className="stars" aria-label={`${r.rating} out of 5`}>
                    {"★".repeat(r.rating)}
                  </p>
                  {r.text && <blockquote>&ldquo;{r.text}&rdquo;</blockquote>}
                  <cite>{r.name}</cite>
                </figure>
              ))}
            </div>
            {b.rating ? (
              <p className="pg-muted" style={{ marginTop: 24, textAlign: "center", fontSize: 13 }}>
                <Star size={13} className="inline fill-current text-gold" aria-hidden="true" /> {b.rating} from {count(b.reviewCount)} {b.reviewCount === 1 ? "review" : "reviews"} · every review is from a real visit
                {reviews.length > 1 ? " · swipe for more" : ""}
              </p>
            ) : null}
          </div>
        </section>
      )}

      {/* 10. The team (optional) */}
      {sections.has("team") && (
        <section aria-labelledby="team-h" className="pg-sec">
          <div className="pg-wrap">
            <div className="pg-sec-head">
              <Heading n={num("team")} label="The team" id="team-h">
                Behind the <em>camera</em>
              </Heading>
            </div>
            <ul className="pg-team">
              {page.team!.map((t) => (
                <li key={t.id} data-pg-r>
                  <div className="pg-ph" style={{ background: b.brandColor, color: b.onBrandColor }}>
                    {t.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={t.photoUrl} alt="" loading="lazy" className="ok" />
                    ) : (
                      t.name.trim().charAt(0)
                    )}
                  </div>
                  <p className="pg-serif" style={{ marginTop: 14, fontSize: 22 }}>
                    {t.name}
                  </p>
                  {t.role && <p className="pg-muted">{t.role}</p>}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* 11. Text section (optional) */}
      {sections.has("text") && (
        <section aria-labelledby="text-h" className="pg-sec">
          <div className="pg-wrap pg-two">
            <h2 id="text-h" data-pg-r className="pg-h2" style={{ marginTop: 0 }}>
              {page.textTitle}
            </h2>
            <p data-pg-r className="pg-lede" style={{ maxWidth: "52ch", whiteSpace: "pre-line" }}>
              {page.textBody}
            </p>
          </div>
        </section>
      )}

      {/* 12. FAQs and visit */}
      {(sections.has("faqs") || sections.has("location")) && (
        <section id="visit" aria-label="Questions and visit" className="pg-sec">
          <div className="pg-wrap pg-two">
            {sections.has("faqs") && (
              <div>
                <Heading n={num("faqs")} label="Good questions" id="faqs-h">
                  Before <em>you come</em>
                </Heading>
                <div style={{ marginTop: 28 }}>
                  {page.faqs!.map((f) => (
                    <details key={f.id}>
                      <summary>{f.q}</summary>
                      <p>{f.a}</p>
                    </details>
                  ))}
                </div>
              </div>
            )}
            {sections.has("location") && (
              <div>
                <Heading n={num("visit")} label="Visit" id="visit-h">
                  {b.area}, <em>{b.city}</em>
                </Heading>
                {b.address && (
                  <p data-pg-r className="pg-lede" style={{ marginTop: 12 }}>
                    {b.address}
                  </p>
                )}
                {b.hours && (
                  <dl className="pg-hours">
                    {hoursRows(b.hours).map(([k, v]) => (
                      <div key={k}>
                        <dt>{k}</dt>
                        <dd>{v}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.address || `${b.name}, ${loc}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pg-btn pg-btn-line"
                  style={{ marginTop: 28 }}
                >
                  Get directions <ArrowUpRight size={16} aria-hidden="true" />
                </a>
              </div>
            )}
          </div>
        </section>
      )}

      {/* 13. Closing frame */}
      <section className="pg-end" aria-labelledby="end-h">
        {endPhoto ? <Ph p={endPhoto} sizes="100vw" /> : <div className="pg-ph" style={{ background: b.brandColor }} />}
        <div className="pg-leak" data-pg-leak />
        <div style={{ position: "relative", zIndex: 3 }}>
          <h2 id="end-h" data-pg-r>
            Your <em className="pg-it">turn.</em>
          </h2>
          <p data-pg-r>{sheet ? "Pick a session and a free time." : `Book your session with ${b.name}.`}</p>
          <div className="acts" data-pg-r>
            {bookLink(
              "pg-btn pg-btn-paper",
              <>
                <CalendarDays size={18} aria-hidden="true" />
                {sheet ? "Book a time" : "Book a session"}
              </>,
            )}
            {call && (
              <a href={actionHref("call", call.value)} className="pg-btn pg-btn-line">
                <ActionIcon kind="call" />
                Call
              </a>
            )}
            {socials.map((a) => (
              <a key={a.kind} href={actionHref(a.kind, a.value)} target="_blank" rel="noopener noreferrer" className="pg-btn pg-btn-line">
                <ActionIcon kind={a.kind} />
                {ACTION_LABEL[a.kind]}
              </a>
            ))}
          </div>
        </div>
      </section>

      <footer className="pg-foot">
        <div className="pg-wrap">
          <span>
            © {b.name} · {where}
          </span>
          <Link href="/" className="flex items-center gap-2">
            Made with
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="pg-made-dark" src="/brand/tikka-lockup-reversed.svg" alt="Tikka" width={58} height={17} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="pg-made-light" src="/brand/tikka-lockup.svg" alt="Tikka" width={58} height={17} />
          </Link>
        </div>
      </footer>

      {/* Phones: Book stays within thumb reach once you're past the hero. */}
      {book && (
        <div className="pg-dock" data-pg-dock>
          <a {...bookProps} className="pg-btn pg-btn-paper">
            <CalendarDays size={18} aria-hidden="true" />
            {sheet ? "Book a time" : "Book a session"}
          </a>
        </div>
      )}

      <PhotoStage
        photos={stagePhotos}
        exhibitions={exhibitions.map(toStage)}
        sets={sets ? toStage(sets) : undefined}
        heroSrc={heroSrc}
        book={book ? { ...bookProps, label: "Book a session like this" } : undefined}
      />
    </div>
  );
}
