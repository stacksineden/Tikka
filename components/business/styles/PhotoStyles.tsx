import "./styles.css";
import Link from "next/link";
import { Reveal } from "@/components/business/Reveal";
import { collectionLine } from "@/lib/portfolio";
import { StickyBar } from "./BeautyStyles";
import { bg, longText, pageData, StyleDropBand, type StylePageProps } from "./data";
import { hasPlus } from "@/lib/plus";

// The two newer photography styles of the business page (prototypes: design/page-styles/
// photo-minimal.html and photo-film.html). Both sit on the gallery's neutral tones (soft white or
// black, design/BRAND.md) so photos aren't tinted; the business colour only marks numbers.

/** The uneven wall: shapes repeat every six photos. */
const WALL = ["a", "b", "c", "d", "e", "f"] as const;

/* ------------------------------------------------------ MINIMAL PORTFOLIO */

export function PortfolioPage(props: StylePageProps) {
  const { b, sections, book, bookProps } = props;
  const d = pageData(props);
  const [first, ...rest] = b.name.split(" ");
  return (
    <div id="biz" data-theme="light" className="st st-portfolio" style={d.style}>
      <Reveal rootId="biz" />
      <div className="pf-wrap">
        <header className="pf-top">
          <span className="pf-cap pf-brand">{b.name}</span>
          <nav>
            {sections.has("portfolio") && <a href="#work">Work</a>}
            {book && (
              <a {...bookProps} className="pf-book">
                Book
              </a>
            )}
          </nav>
        </header>

        <div className="pf-hero">
          <h1 className="pf-h1">
            {first}
            {rest.length ? (
              <>
                <br />
                <em>{rest.join(" ")}</em>
              </>
            ) : null}
          </h1>
          <div className="pf-line">
            <p>{d.intro || d.statement}</p>
            <span className="pf-num">{d.where}</span>
          </div>
        </div>

        <StyleDropBand cls="pf" b={b} live={props.live} next={props.next} fromCard={props.fromCard} />

        {sections.has("portfolio") && d.photos.length > 0 && (
          <div className="pf-wall" id="work">
            {d.photos.slice(0, 12).map((p, i) => (
              <figure key={p.id} data-reveal="up" className={`pf-${WALL[i % 6]}`}>
                <div className="pf-photo" style={bg(i === 0 ? p.url : p.thumbUrl || p.url)} role="img" aria-label={p.caption ?? ""} />
                <figcaption>
                  <span>{p.caption ?? ""}</span>
                  <span className="pf-num">{String(i + 1).padStart(2, "0")}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        )}

        {d.collections.length > 0 && (
          <section className="pf-sec">
            <div className="pf-head">
              <h2 className="pf-h2">Index</h2>
              <span className="pf-cap">
                {d.collections.length} {d.collections.length === 1 ? "collection" : "collections"}
              </span>
            </div>
            <div className="pf-index">
              {d.collections.map((c, i) => (
                <Link key={c.id} href={`/${b.slug}/work/${c.slug}`}>
                  <span className="pf-num">{String(i + 1).padStart(2, "0")}</span>
                  <b>{c.name}</b>
                  <span>{collectionLine(c)}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {sections.has("services") && (
          <section className="pf-sec pf-split" id="services">
            <div>
              <div className="pf-head">
                <h2 className="pf-h2">Book</h2>
              </div>
              <p className="pf-muted">Pick a session and a free time.{d.services.some((s) => s.depositLine) ? " A deposit holds it; the rest is paid on the day." : ""}</p>
            </div>
            <div className="pf-pk">
              {d.services.map((s) => (
                <article key={s.key} data-reveal="up">
                  <h3>{s.name}</h3>
                  <span className="pf-p">{s.price}</span>
                  {s.about && <p>{s.about}</p>}
                  <div className="pf-go">
                    <span>{s.depositLine}</span>
                    {s.linkProps && (
                      <a {...s.linkProps}>
                        Book → <span className="sr-only">{s.name}</span>
                      </a>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {sections.has("about") && (
          <section className="pf-sec pf-about" id="about">
            {d.page.aboutImageUrl || d.photos[1] ? <div className="pf-photo pf-about-img" style={bg(d.page.aboutImageUrl ?? d.photos[1]?.url)} role="img" aria-label={`${b.name} at work`} /> : null}
            <div>
              <p className="pf-cap">About</p>
              <p className="pf-big" data-long={longText(b.about) || undefined}>{b.about}</p>
            </div>
          </section>
        )}

        {sections.has("reviews") && d.reviews[0] && (
          <section className="pf-sec">
            <p className="pf-cap">Kind words</p>
            <p className="pf-quote">“{d.reviews[0].text}”</p>
            <p className="pf-muted pf-small">
              {d.reviews[0].name} · {"★".repeat(Math.round(d.reviews[0].rating))}
            </p>
          </section>
        )}

        {(d.hours.length > 0 || d.rules.length > 0) && (
          <section className="pf-sec pf-split" id="visit">
            {d.rules.length > 0 && (
              <ul className="pf-list">
                {d.rules.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
            <ul className="pf-list">
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
          </section>
        )}

        <footer className="pf-foot">
          <span>
            {b.name} · {d.where}
          </span>
          {!hasPlus(b) && <a href="https://usetikka.com">Made with Tikka</a>}
        </footer>
      </div>
      <StickyBar cls="pf" book={book} bookProps={bookProps} wa={d.waHref} />
    </div>
  );
}

/* ------------------------------------------------------------------ FILM */

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];

export function FilmPage(props: StylePageProps) {
  const { b, sections, book, bookProps } = props;
  const d = pageData(props);
  const [first, ...rest] = b.name.split(" ");
  // Chapters: their collections (up to 4), each with up to 2 full-screen frames; without
  // collections, their photos in one chapter.
  const chapters = d.collections.length
    ? d.collections.slice(0, 4).map((c) => ({ title: c.name, frames: c.photos.filter((p) => p.kind !== "video").slice(0, 2) }))
    : d.photos.length
      ? [{ title: "The work", frames: d.photos.slice(0, 4) }]
      : [];
  return (
    <div id="biz" data-theme="light" className="st st-film" style={d.style}>
      <Reveal rootId="biz" />
      <header className="fm-top">
        <span className="fm-mono">{b.name}</span>
        {book && (
          <a {...bookProps} className="fm-mono fm-rec">
            <i aria-hidden="true" />
            Book
          </a>
        )}
      </header>

      <div className="fm-open">
        <div className="fm-photo fm-open-img" style={bg(d.hero)} role="img" aria-label={`${b.name}'s work`} />
        <div className="fm-open-t">
          <p className="fm-mono fm-mark">
            {b.category} · {d.where}
          </p>
          <h1 className="fm-h1">
            {first}
            {rest.length ? (
              <>
                <br />
                <em>{rest.join(" ")}</em>
              </>
            ) : null}
          </h1>
          <p className="fm-muted">{d.intro || d.statement}</p>
        </div>
        <span className="fm-scroll fm-mono">Scroll ↓</span>
      </div>

      <StyleDropBand cls="fm" b={b} live={props.live} next={props.next} fromCard={props.fromCard} />

      {sections.has("portfolio") &&
        chapters.map((c, i) => (
          <div key={c.title} className="fm-chapter" id={i === 0 ? "work" : undefined}>
            <div className="fm-title">
              <div>
                <span className="fm-mono fm-mark">Chapter {ROMAN[i]}</span>
                <h2 className="fm-h2">{c.title}</h2>
              </div>
            </div>
            {c.frames.map((p) => (
              <div key={p.id} data-reveal="up" className="fm-frame">
                <div className="fm-photo" style={bg(p.url)} role="img" aria-label={p.caption ?? c.title} />
                {p.caption && <p className="fm-sub">{p.caption}</p>}
              </div>
            ))}
          </div>
        ))}

      {sections.has("about") && (
        <section className="fm-sec fm-center" id="about">
          <div className="fm-wrap" data-reveal="up">
            <p className="fm-mono fm-mark">About</p>
            <p className="fm-about" data-long={longText(b.about) || undefined}>{b.about}</p>
          </div>
        </section>
      )}

      {sections.has("services") && (
        <section className="fm-sec fm-credits" id="services">
          <div className="fm-wrap">
            <h2 className="fm-h2 fm-credits-h">
              Book your <em>day</em>
            </h2>
            <div className="fm-grid">
              {d.services.map((s) => (
                <div key={s.key} data-reveal="up" className="fm-credit">
                  {s.group && <span className="fm-mono fm-mark">{s.group}</span>}
                  <h3>{s.name}</h3>
                  {s.about && <p>{s.about}</p>}
                  <div className="fm-row">
                    <span className="fm-price">{s.price}</span>
                    {s.linkProps && (
                      <a {...s.linkProps}>
                        Book <span className="sr-only">{s.name}</span>
                      </a>
                    )}
                  </div>
                  {s.depositLine && <p className="fm-mono fm-dep">{s.depositLine}</p>}
                </div>
              ))}
            </div>
            {d.rules.length > 0 && <p className="fm-mono fm-rules">{d.rules.join(" · ")}</p>}
          </div>
        </section>
      )}

      {sections.has("reviews") && d.reviews[0] && (
        <section className="fm-sec fm-center">
          <div className="fm-wrap" data-reveal="up">
            <p className="fm-quote">“{d.reviews[0].text}”</p>
            <small className="fm-muted">
              {d.reviews[0].name} · {"★".repeat(Math.round(d.reviews[0].rating))}
            </small>
          </div>
        </section>
      )}

      <div className="fm-end">
        <p className="fm-h2">
          See you <em>on the day</em>
        </p>
        <p className="fm-muted">
          {d.where}
          {d.hours.length ? ` · ${d.hours.map(([k, v]) => `${k} ${v}`).join(" · ")}` : ""}
        </p>
        {book && (
          <a {...bookProps} className="fm-btn">
            Check my date
          </a>
        )}
        {!hasPlus(b) && (
          <a href="https://usetikka.com" className="fm-made">
            Made with Tikka
          </a>
        )}
      </div>
      <StickyBar cls="fm" book={book} bookProps={bookProps} wa={d.waHref} />
    </div>
  );
}
