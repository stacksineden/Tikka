import "./photo.css";
import { ArrowLeft, CalendarDays, Play } from "lucide-react";
import Link from "next/link";
import { ShareButton } from "@/components/business/ShareButton";
import { photoSrcSet } from "@/lib/media-path";
import { priceText } from "@/lib/page";
import { cameraChips } from "@/lib/photo-meta";
import type { ShownCollection } from "@/lib/portfolio";
import type { Business } from "@/lib/types";
import { PhotoStage, type StagePhoto } from "./PhotoStage";

// One collection on its own page (usetikka.com/<business>/work/<collection>) for the Photography
// style: an exhibition. A title, then each photo on its own, in its own shape, with its number and
// camera settings; tap one for the full-screen viewer. The same Book and share as the classic page.

export function PhotoCollection({ b, c, others, book, bookLabel, url, where }: { b: Business; c: ShownCollection; others: ShownCollection[]; book: string | null; bookLabel: string; url: string; where: string }) {
  const style = { "--biz": b.brandColor, "--on-biz": b.onBrandColor } as React.CSSProperties;
  const ratio = (p: ShownCollection["photos"][number]) => (p.width && p.height ? p.width / p.height : 0.8);
  const photos: StagePhoto[] = c.photos.map((p, i) => ({
    kind: p.kind ?? "photo",
    url: p.url,
    thumb: p.thumbUrl,
    r: ratio(p),
    measured: !!(p.width && p.height),
    tone: p.tone,
    title: p.caption?.trim() || `Frame ${String(i + 1).padStart(3, "0")}`,
    group: c.name,
    chips: cameraChips(p.camera),
  }));
  const n = c.photos.length;

  return (
    <div id="biz" data-theme="light" className="pg" style={style}>
      <header className="pg-bar solid">
        <div className="pg-wrap">
          <Link href={`/${b.slug}#exhibitions`} className="pg-logo" style={{ minHeight: 44 }}>
            <ArrowLeft size={18} aria-hidden="true" />
            <span className="pg-mono">{b.name}</span>
          </Link>
          <span />
          {book && (
            <a href={book} target="_blank" rel="noopener noreferrer" className="pg-btn pg-btn-paper">
              Book
            </a>
          )}
        </div>
      </header>

      <section className="pg-sec" aria-labelledby="coll-h" style={{ paddingTop: 140 }}>
        <div className="pg-wrap">
          <p className="pg-eyebrow">
            <span className="n">Exhibition</span>
            {b.name}
          </p>
          <h1 id="coll-h" className="pg-h2" style={{ fontSize: "clamp(56px, 13vw, 170px)", fontWeight: 200 }}>
            {c.name}
          </h1>
          <p className="pg-muted" style={{ marginTop: 16 }}>
            {n} {n === 1 ? "photo" : "photos"} · {where}
            {c.service && (
              <>
                {" · "}
                {c.service.name} · {priceText(c.service)}
              </>
            )}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 28 }}>
            {book && (
              <a href={book} target="_blank" rel="noopener noreferrer" className="pg-btn pg-btn-paper">
                <CalendarDays size={18} aria-hidden="true" />
                {bookLabel}
              </a>
            )}
            <ShareButton url={url} title={`${c.name} · ${b.name}`} className="pg-btn pg-btn-line" />
          </div>
        </div>
      </section>

      <div className="pg-exhibit" data-pg-book>
        {c.photos.map((p, i) => (
          <figure key={p.id} data-pg-r>
            <button type="button" className="pg-pic" data-i={i} style={{ "--r": ratio(p) } as React.CSSProperties} aria-label={`Open ${photos[i].title}`}>
              <div className="pg-ph" data-tone={p.tone} style={p.tone ? ({ "--tone": p.tone } as React.CSSProperties) : undefined}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.kind === "video" ? p.thumbUrl : p.url} srcSet={p.kind === "video" ? undefined : photoSrcSet(p.url)} sizes="(min-width: 900px) 70vw, 100vw" alt={p.caption ?? ""} loading={i < 2 ? "eager" : "lazy"} decoding="async" />
              </div>
              {p.kind === "video" && (
                <span className="play" aria-hidden="true">
                  <Play size={14} />
                </span>
              )}
            </button>
            <figcaption className="pg-mono">
              <b className="pg-serif">{photos[i].title}</b>
              <span className="pg-muted">
                {String(i + 1).padStart(3, "0")} / {String(n).padStart(3, "0")}
                {photos[i].chips.length ? ` · ${photos[i].chips.join(" · ")}` : ""}
              </span>
            </figcaption>
          </figure>
        ))}
      </div>

      <section className="pg-end" aria-labelledby="end-h" style={{ minHeight: "60svh" }}>
        <div className="pg-ph" style={{ background: "transparent" }} />
        <div style={{ position: "relative", zIndex: 3 }}>
          <h2 id="end-h">
            Book a session <em className="pg-it">like this.</em>
          </h2>
          <div className="acts" style={{ marginTop: 32 }}>
            {book && (
              <a href={book} target="_blank" rel="noopener noreferrer" className="pg-btn pg-btn-paper">
                <CalendarDays size={18} aria-hidden="true" />
                {bookLabel}
              </a>
            )}
            {others.map((o) => (
              <Link key={o.id} href={`/${b.slug}/work/${o.slug}`} className="pg-btn pg-btn-line">
                {o.name}
              </Link>
            ))}
            <Link href={`/${b.slug}`} className="pg-btn pg-btn-line">
              See the full page
            </Link>
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
            <img src="/brand/tikka-lockup-reversed.svg" alt="Tikka" width={58} height={17} />
          </Link>
        </div>
      </footer>

      <PhotoStage photos={photos} exhibitions={[]} book={book ? { href: book, target: "_blank", rel: "noopener noreferrer", label: bookLabel } : undefined} />
    </div>
  );
}
