import "./styles.css";
import { BadgeCheck, MapPin, Star } from "lucide-react";
import { Reveal } from "@/components/business/Reveal";
import { ActionIcon } from "@/components/tikka/ActionIcon";
import { bg, longText, pageData, StyleDropBand, type StylePageProps } from "./data";
import { hasPlus } from "@/lib/plus";

// The two newer beauty styles of the business page (prototypes: design/page-styles/beauty-luxe.html
// and beauty-soft.html). Luxe: dark and rich, a full-screen opening, services as a printed menu.
// Soft studio: light and rounded, the business colour as a soft tint, service cards.

function Stars({ n }: { n: number }) {
  return <span aria-label={`${n} out of 5`}>{"★".repeat(Math.round(n))}{"☆".repeat(5 - Math.round(n))}</span>;
}

/* ------------------------------------------------------------------ LUXE */

export function LuxePage(props: StylePageProps) {
  const { b, sections, book, bookProps } = props;
  const d = pageData(props);
  const [first, ...rest] = b.name.split(" ");
  return (
    <div id="biz" data-theme="light" className="st st-luxe" style={d.style}>
      <Reveal rootId="biz" />
      <header className="lx-nav">
        <span className="lx-mark">
          <span className="lx-logo">
            {b.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={b.logoUrl} alt="" />
            ) : (
              d.initials
            )}
          </span>
          <span className="lx-name">{b.name}</span>
        </span>
        {book && (
          <a {...bookProps} className="lx-pill">
            Book
          </a>
        )}
      </header>

      <section className="lx-hero">
        <div className="lx-photo lx-hero-img" style={bg(d.hero)} role="img" aria-label={`${b.name}'s work`} />
        <div className="lx-wrap lx-hero-in">
          <p className="lx-eyebrow">
            {b.category} · {d.where}
          </p>
          <h1 className="lx-h1">
            {first}
            {rest.length ? (
              <>
                {" "}
                <em>{rest.join(" ")}</em>
              </>
            ) : null}
          </h1>
          <p className="lx-lede">{d.intro || d.statement}</p>
          <div className="lx-row">
            {book && (
              <a {...bookProps} className="lx-btn lx-btn-solid">
                Book a time
              </a>
            )}
            {sections.has("portfolio") && (
              <a href="#work" className="lx-btn lx-btn-ghost">
                See the work
              </a>
            )}
          </div>
          <p className="lx-meta">
            {b.rating ? (
              <span>
                <b>{b.rating.toFixed(1)}</b> · {b.reviewCount} reviews
              </span>
            ) : null}
            {b.verified && (
              <span>
                <BadgeCheck size={14} aria-hidden="true" /> Verified
              </span>
            )}
          </p>
        </div>
      </section>

      <StyleDropBand cls="lx" b={b} live={props.live} next={props.next} fromCard={props.fromCard} />

      {sections.has("about") && (
        <section className="lx-sec" id="about">
          <div className="lx-wrap lx-about">
            <div data-reveal="up">
              <p className="lx-eyebrow">About</p>
              <p className="lx-statement" data-long={longText(b.about) || undefined}>{b.about}</p>
            </div>
            {d.page.aboutImageUrl || d.photos[1] ? <div data-reveal="up" className="lx-photo lx-about-img" style={bg(d.page.aboutImageUrl ?? d.photos[1]?.url)} role="img" aria-label={`Inside ${b.name}`} /> : null}
          </div>
        </section>
      )}

      {sections.has("services") && (
        <section className="lx-sec lx-alt" id="services">
          <div className="lx-wrap">
            <div className="lx-menu-head">
              <h2 className="lx-h2">
                The <em>menu</em>
              </h2>
            </div>
            {(d.groups.length ? d.groups : [""]).map((g) => (
              <div key={g || "all"}>
                {g && <p className="lx-eyebrow lx-group">{g}</p>}
                {d.services
                  .filter((s) => !d.groups.length || s.group === g)
                  .map((s) => (
                    <article key={s.key} data-reveal="up" className="lx-svc">
                      <h3>{s.name}</h3>
                      <span className="lx-price">{s.price}</span>
                      {s.about && <p>{s.about}</p>}
                      <div className="lx-dep">
                        <span>{s.depositLine}</span>
                        {s.linkProps && (
                          <a {...s.linkProps}>
                            Book <span className="sr-only">{s.name}</span>
                          </a>
                        )}
                      </div>
                    </article>
                  ))}
              </div>
            ))}
          </div>
        </section>
      )}

      {sections.has("portfolio") && d.photos.length > 0 && (
        <section className="lx-sec lx-flush" id="work">
          <div className="lx-wrap">
            <p className="lx-eyebrow">Recent work</p>
            <h2 className="lx-h2">
              Faces we&apos;ve <em>loved</em>
            </h2>
          </div>
          <div className="lx-strip">
            {d.photos.slice(0, 12).map((p) => (
              <figure key={p.id} className="lx-photo" style={bg(p.thumbUrl || p.url)}>
                {p.caption && <figcaption>{p.caption}</figcaption>}
              </figure>
            ))}
          </div>
        </section>
      )}

      {sections.has("reviews") && d.reviews[0] && (
        <section className="lx-sec lx-alt">
          <div className="lx-wrap" data-reveal="up">
            <p className="lx-stars">
              <Stars n={d.reviews[0].rating} />
            </p>
            <p className="lx-quote">“{d.reviews[0].text}”</p>
            <p className="lx-who">{d.reviews[0].name}</p>
            {d.reviews.length > 1 && (
              <div className="lx-more">
                {d.reviews.slice(1, 4).map((r) => (
                  <p key={r.id}>
                    “{r.text}” <span>· {r.name}</span>
                  </p>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {(d.rules.length > 0 || sections.has("location") || d.hours.length > 0) && (
        <section className="lx-sec" id="visit">
          <div className="lx-wrap lx-cols">
            {d.rules.length > 0 && (
              <div data-reveal="up">
                <h2 className="lx-h3">Before you book</h2>
                <ul className="lx-list">
                  {d.rules.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
            <div data-reveal="up">
              <h2 className="lx-h3">Visit</h2>
              <ul className="lx-list">
                {d.hours.map(([k, v]) => (
                  <li key={k}>
                    <span>{k}</span>
                    <b>{v}</b>
                  </li>
                ))}
                <li>
                  <span>
                    <MapPin size={14} aria-hidden="true" /> {b.address ? b.address : "Where"}
                  </span>
                  <b>{d.where}</b>
                </li>
              </ul>
            </div>
          </div>
        </section>
      )}

      <footer className="lx-foot">
        <p className="lx-foot-name">{b.name}</p>
        <p>{d.where}</p>
        {!hasPlus(b) && (
          <a href="https://usetikka.com" className="lx-made">
            Made with Tikka
          </a>
        )}
      </footer>

      <StickyBar cls="lx" book={book} bookProps={bookProps} wa={d.waHref} />
    </div>
  );
}

/* ----------------------------------------------------------- SOFT STUDIO */

export function SoftPage(props: StylePageProps) {
  const { b, sections, book, bookProps } = props;
  const d = pageData(props);
  const words = b.name.split(" ");
  const last = words.length > 1 ? words.pop() : null;
  const today = d.hours[0]?.[1];
  return (
    <div id="biz" data-theme="light" className="st st-soft" style={d.style}>
      <Reveal rootId="biz" />
      <header className="sf-top sf-wrap">
        {today && today !== "Closed" ? <span className="sf-label">● Open {today}</span> : <span className="sf-label">{b.category}</span>}
        {book && (
          <a {...bookProps} className="sf-chip">
            Book
          </a>
        )}
      </header>

      <div className="sf-wrap">
        <section className="sf-hero">
          <div>
            <div className="sf-logo">
              {b.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={b.logoUrl} alt="" />
              ) : (
                d.initials
              )}
            </div>
            <h1 className="sf-h1">
              {words.join(" ")} {last && <em>{last}</em>}
            </h1>
            <p className="sf-sub">{d.intro || d.statement}</p>
            <div className="sf-facts">
              {b.rating ? (
                <span className="sf-label">
                  <Star size={12} aria-hidden="true" /> {b.rating.toFixed(1)} · {b.reviewCount} reviews
                </span>
              ) : null}
              <span className="sf-label">{d.where}</span>
              {b.verified && <span className="sf-label">Verified</span>}
            </div>
          </div>
          <div className="sf-stage">
            <div className="sf-photo sf-hero-img" style={bg(d.hero)} role="img" aria-label={`${b.name}'s work`} />
            {d.services[0] && (
              <div className="sf-float sf-f1">
                <b>{d.services[0].name}</b>
                {d.services[0].price}
              </div>
            )}
          </div>
        </section>

        <StyleDropBand cls="sf" b={b} live={props.live} next={props.next} fromCard={props.fromCard} />

        {sections.has("services") && (
          <section className="sf-sec" id="services">
            <span className="sf-label">Services</span>
            <h2 className="sf-h2">
              Pick your <em>service</em>
            </h2>
            <div className="sf-cards">
              {d.services.map((s, i) => (
                <article key={s.key} data-reveal="up" className="sf-svc">
                  <div className="sf-photo sf-svc-img" style={bg(d.photos[i % Math.max(1, d.photos.length)]?.thumbUrl)} />
                  <div>
                    <h3>{s.name}</h3>
                    {s.about && <p>{s.about}</p>}
                  </div>
                  <div className="sf-row">
                    <span className="sf-price">
                      <b>{s.price}</b>
                      {s.depositLine && <small>{s.depositLine}</small>}
                    </span>
                    {s.linkProps && (
                      <a {...s.linkProps} className="sf-book">
                        Book <span className="sr-only">{s.name}</span>
                      </a>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {sections.has("portfolio") && d.photos.length > 0 && (
          <section className="sf-sec" id="work">
            <span className="sf-label">Our work</span>
            <h2 className="sf-h2">
              Fresh from the <em>studio</em>
            </h2>
            <div className="sf-grid">
              {d.photos.slice(0, 12).map((p) => (
                <div key={p.id} className="sf-photo" style={bg(p.thumbUrl || p.url)} role="img" aria-label={p.caption ?? ""} />
              ))}
            </div>
          </section>
        )}

        {sections.has("about") && (
          <section className="sf-sec" id="about">
            <span className="sf-label">About</span>
            <p className="sf-about" data-reveal="up" data-long={longText(b.about) || undefined}>
              {b.about}
            </p>
          </section>
        )}
      </div>

      {sections.has("reviews") && d.reviews.length > 0 && (
        <section className="sf-sec">
          <div className="sf-wrap">
            <span className="sf-label">Reviews</span>
            <h2 className="sf-h2">
              From people who <em>came in</em>
            </h2>
          </div>
          <div className="sf-reviews">
            {d.reviews.map((r) => (
              <article key={r.id} className="sf-rev">
                <span className="sf-stars">
                  <Stars n={r.rating} />
                </span>
                <p>“{r.text}”</p>
                <small>{r.name}</small>
              </article>
            ))}
          </div>
        </section>
      )}

      <div className="sf-wrap">
        <section className="sf-sec sf-two" id="visit">
          <div>
            <span className="sf-label">Visit</span>
            <h2 className="sf-h2">Hours</h2>
            <ul className="sf-panel">
              {d.hours.map(([k, v]) => (
                <li key={k}>
                  <span>{k}</span>
                  <b>{v}</b>
                </li>
              ))}
              <li>
                <span>{b.address || "Where"}</span>
                <b>{d.where}</b>
              </li>
            </ul>
          </div>
          {(d.rules.length > 0 || (sections.has("faqs") && d.faqs.length > 0)) && (
            <div>
              <span className="sf-label">Good to know</span>
              <h2 className="sf-h2">Questions</h2>
              <div className="sf-panel">
                {d.rules.length > 0 && (
                  <details>
                    <summary>Booking rules</summary>
                    <ul>
                      {d.rules.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  </details>
                )}
                {sections.has("faqs") &&
                  d.faqs.map((f) => (
                    <details key={f.id}>
                      <summary>{f.q}</summary>
                      <p>{f.a}</p>
                    </details>
                  ))}
              </div>
            </div>
          )}
        </section>
      </div>

      <footer className="sf-foot">
        <p className="sf-foot-name">{b.name}</p>
        <p>{d.where}</p>
        {!hasPlus(b) && (
          <a href="https://usetikka.com" className="sf-made">
            Made with Tikka
          </a>
        )}
      </footer>

      <StickyBar cls="sf" book={book} bookProps={bookProps} wa={d.waHref} />
    </div>
  );
}

/** Phones: Book and WhatsApp within thumb reach. */
export function StickyBar({ cls, book, bookProps, wa }: { cls: string; book: string | null; bookProps: Record<string, string | undefined>; wa?: string }) {
  if (!book && !wa) return null;
  return (
    <div className={`st-bar ${cls}-bar`}>
      {book && (
        <a {...bookProps} className="st-bar-main">
          Book a time
        </a>
      )}
      {wa && (
        <a href={wa} target="_blank" rel="noopener noreferrer" className="st-bar-wa" aria-label="WhatsApp">
          <ActionIcon kind="whatsapp" />
        </a>
      )}
    </div>
  );
}
