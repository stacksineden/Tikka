"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

// The moving parts of the Photography page (components/business/photo/PhotoPage.tsx renders
// everything else on the server): the contact-sheet opening, scroll reveals, the room taking the
// colour of the photo in front of you, the desktop exhibitions wall, the photo book's filters, and
// two full-screen layers: an exhibition (one collection, one photo per screen) and the viewer
// (swipe, double-tap zoom, a desktop magnifier, camera settings, a film strip). No libraries;
// transform and opacity only; prefers-reduced-motion turns the motion off in photo.css.

export interface StagePhoto {
  kind: "photo" | "video";
  url: string;
  thumb: string;
  /** width / height; an estimate until the photo loads when not `measured`. */
  r: number;
  measured: boolean;
  tone?: string;
  title: string;
  group: string;
  chips: string[];
}

export interface StageCollection {
  name: string;
  line: string;
  /** Indexes into the photos. */
  ids: number[];
}

type BookLink = Record<string, string | undefined> & { label: string };

const pad = (n: number, l = 3) => String(n).padStart(l, "0");
const wide = () => window.matchMedia("(min-width: 900px)").matches;
/** A photo that won't load leaves its own colour showing, never a broken-image icon. */
const hideBroken = (e: React.SyntheticEvent<HTMLImageElement>) => (e.currentTarget.style.visibility = "hidden");
const toneStyle = (tone?: string) => (tone ? ({ "--tone": tone } as React.CSSProperties) : undefined);

function lock(on: boolean) {
  document.documentElement.style.overflow = on ? "hidden" : "";
}

export function PhotoStage({ photos, exhibitions, sets, heroSrc, book }: { photos: StagePhoto[]; exhibitions: StageCollection[]; sets?: StageCollection; heroSrc?: string; book?: BookLink }) {
  const [ratios, setRatios] = useState(() => photos.map((p) => p.r));
  const [ex, setEx] = useState<number | null>(null);
  const [view, setView] = useState<{ ids: number[]; at: number; from: string } | null>(null);

  /* ---------- The page: images, reveals, tint, bar, dock, wall, filters, opening ---------- */
  useEffect(() => {
    const root = document.getElementById("biz");
    if (!root) return;
    root.classList.add("pg-js");
    const cleanups: (() => void)[] = [];

    // Photos fade in once loaded; a photo without a saved shape gets its real one.
    const settle = (img: HTMLImageElement) => {
      img.classList.add("ok");
      const pic = img.closest<HTMLElement>(".pg-pic[data-i]");
      if (!pic || !img.naturalWidth) return;
      const i = Number(pic.dataset.i);
      if (photos[i] && !photos[i].measured) {
        const r = img.naturalWidth / img.naturalHeight;
        pic.style.setProperty("--r", String(r));
        setRatios((all) => all.map((x, k) => (k === i ? r : x)));
      }
    };
    const wire = (scope: ParentNode) =>
      scope.querySelectorAll<HTMLImageElement>(".pg-ph > img:not(.ok)").forEach((img) => {
        // A photo that won't load leaves its own colour showing, never a broken-image icon.
        if (img.complete) return img.naturalWidth ? settle(img) : img.remove();
        img.addEventListener("load", () => settle(img), { once: true });
        img.addEventListener("error", () => img.remove(), { once: true });
      });
    wire(root);

    // Reveals and light leaks: once each.
    const reveal = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && (e.target.classList.add("in"), reveal.unobserve(e.target))),
      { rootMargin: "0px 0px -10% 0px" },
    );
    root.querySelectorAll("[data-pg-r], [data-pg-leak]").forEach((el) => reveal.observe(el));
    cleanups.push(() => reveal.disconnect());

    // The room takes the colour of the photo in the middle of the screen.
    const tint = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && root.style.setProperty("--tint", (e.target as HTMLElement).dataset.tone!)),
      { rootMargin: "-45% 0px -45% 0px" },
    );
    root.querySelectorAll("[data-tone]").forEach((el) => (el as HTMLElement).dataset.tone && !el.closest(".pg-sheet") && tint.observe(el));
    cleanups.push(() => tint.disconnect());

    // Bar, dock and (desktop) the exhibitions wall sliding sideways as you scroll down.
    const bar = root.querySelector<HTMLElement>("[data-pg-bar]");
    const dock = root.querySelector<HTMLElement>("[data-pg-dock]");
    const pin = root.querySelector<HTMLElement>("[data-pg-pin]");
    const wall = root.querySelector<HTMLElement>("[data-pg-wall]");
    const wallBar = root.querySelector<HTMLElement>("[data-pg-wall-bar]");
    const canPin = !!pin && !!wall && CSS.supports("overflow", "clip") && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const size = () => {
      if (!pin || !wall) return;
      const on = canPin && wide();
      pin.classList.toggle("on", on);
      pin.style.height = on ? `${window.innerHeight + Math.max(0, wall.scrollWidth - window.innerWidth)}px` : "";
      if (!on) wall.style.transform = "";
    };
    const onScroll = () => {
      bar?.classList.toggle("solid", window.scrollY > 40);
      dock?.classList.toggle("show", window.scrollY > window.innerHeight * 0.7);
      if (pin?.classList.contains("on") && wall) {
        const span = pin.offsetHeight - window.innerHeight;
        const k = span > 0 ? Math.min(1, Math.max(0, -pin.getBoundingClientRect().top / span)) : 0;
        wall.style.transform = `translateX(${-k * Math.max(0, wall.scrollWidth - window.innerWidth)}px)`;
        if (wallBar) wallBar.style.transform = `scaleX(${k})`;
      }
    };
    const onResize = () => (size(), onScroll());
    size();
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    window.addEventListener("load", onResize);
    cleanups.push(() => (window.removeEventListener("scroll", onScroll), window.removeEventListener("resize", onResize), window.removeEventListener("load", onResize)));

    // Clicks: filters, the photo book, exhibitions, sets.
    const book = root.querySelector<HTMLElement>("[data-pg-book]");
    let filter = "";
    const visible = () => photos.map((_, i) => i).filter((i) => !filter || photos[i].group === filter);
    const onClick = (e: MouseEvent) => {
      const t = e.target as Element;
      const f = t.closest<HTMLButtonElement>("[data-pg-filters] button");
      if (f && book) {
        filter = f.dataset.f ?? "";
        f.parentElement!.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === f)));
        book.classList.add("fade");
        window.setTimeout(() => {
          book.querySelectorAll<HTMLElement>(".pg-pic").forEach((p) => (p.hidden = !!filter && p.dataset.g !== filter));
          book.classList.remove("fade");
        }, 250);
        return;
      }
      const pic = t.closest<HTMLElement>("[data-pg-book] .pg-pic");
      if (pic) {
        const ids = visible();
        setView({ ids, at: Math.max(0, ids.indexOf(Number(pic.dataset.i))), from: filter || "Portfolio" });
        return;
      }
      const card = t.closest<HTMLElement>("[data-ex]");
      if (card) return setEx(Number(card.dataset.ex));
      const set = t.closest<HTMLElement>("[data-set]");
      if (set && sets) setView({ ids: sets.ids, at: Number(set.dataset.set), from: sets.name });
    };
    root.addEventListener("click", onClick);
    cleanups.push(() => root.removeEventListener("click", onClick));

    // The opening: the contact sheet the inline script showed (first visit only).
    const sheet = document.getElementById("pg-sheet");
    const hero = root.querySelector<HTMLElement>("[data-pg-hero]");
    if (sheet && !sheet.hidden) {
      sheet.dataset.run = "1";
      lock(true);
      const timers: number[] = [];
      let zoomer: HTMLElement | null = null;
      const finish = () => {
        timers.forEach(clearTimeout);
        sheet.classList.add("gone");
        hero?.classList.add("live");
        lock(false);
        window.setTimeout(() => ((sheet.hidden = true), zoomer?.remove()), 650);
      };
      // The strips started sliding in before the page's script loaded (the inline script); the rest
      // keeps time from then.
      const at = (ms: number) => Math.max(0, ms - (Date.now() - Number(sheet.dataset.t ?? Date.now())));
      timers.push(window.setTimeout(() => sheet.classList.add("circle"), at(1300)));
      timers.push(
        window.setTimeout(() => {
          const fr = sheet.querySelector<HTMLElement>("[data-picked]");
          if (!fr || !heroSrc) return;
          const r = fr.getBoundingClientRect();
          zoomer = document.createElement("div");
          zoomer.className = "pg-zoomer";
          Object.assign(zoomer.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
          zoomer.style.background = getComputedStyle(fr.querySelector(".pg-ph")!).backgroundColor;
          const img = document.createElement("img");
          img.alt = "";
          img.onerror = () => img.remove();
          img.src = heroSrc;
          zoomer.appendChild(img);
          root.appendChild(zoomer);
          fr.style.visibility = "hidden";
          sheet.classList.add("zoom");
          const s = Math.max(window.innerWidth / r.width, window.innerHeight / r.height);
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              if (zoomer) zoomer.style.transform = `translate(${(window.innerWidth - r.width * s) / 2 - r.left}px, ${(window.innerHeight - r.height * s) / 2 - r.top}px) scale(${s})`;
            }),
          );
        }, at(2200)),
      );
      timers.push(window.setTimeout(finish, at(3300)));
      sheet.addEventListener("click", finish, { once: true });
      cleanups.push(() => timers.forEach(clearTimeout));
    } else {
      hero?.classList.add("live");
    }

    return () => cleanups.forEach((c) => c());
  }, [photos, sets, heroSrc]);

  const openView = useCallback((ids: number[], at: number, from: string) => setView({ ids, at, from }), []);

  return (
    <>
      {ex !== null && exhibitions[ex] && (
        <Exhibition
          key={ex}
          c={exhibitions[ex]}
          n={ex}
          next={exhibitions.length > 1 ? (ex + 1) % exhibitions.length : null}
          nextName={exhibitions.length > 1 ? exhibitions[(ex + 1) % exhibitions.length].name : ""}
          photos={photos}
          ratios={ratios}
          book={book}
          onClose={() => setEx(null)}
          onNext={(i) => setEx(i)}
          onOpen={openView}
          covered={!!view}
        />
      )}
      {view && <Viewer {...view} photos={photos} ratios={ratios} book={book} onClose={() => setView(null)} keepLock={ex !== null} />}
    </>
  );
}

function StagePh({ p, eager = false }: { p: StagePhoto; eager?: boolean }) {
  return (
    <div className="pg-ph" style={toneStyle(p.tone)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={p.kind === "video" ? p.thumb : p.url} alt={p.title} loading={eager ? "eager" : "lazy"} decoding="async" className="ok" onError={hideBroken} />
    </div>
  );
}

/* ---------- One collection, full screen: one photo per screen (sideways on desktop) ---------- */
function Exhibition({ c, n, next, nextName, photos, ratios, book, onClose, onNext, onOpen, covered }: { c: StageCollection; n: number; next: number | null; nextName: string; photos: StagePhoto[]; ratios: number[]; book?: BookLink; onClose: () => void; onNext: (i: number) => void; onOpen: (ids: number[], at: number, from: string) => void; covered: boolean }) {
  const track = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState(0);

  useEffect(() => {
    lock(true);
    requestAnimationFrame(() => setOpen(true));
    const t = track.current!;
    const onScroll = () => {
      const d = wide();
      const max = d ? t.scrollWidth - t.clientWidth : t.scrollHeight - t.clientHeight;
      if (bar.current) bar.current.style.transform = `scaleX(${max > 0 ? (d ? t.scrollLeft : t.scrollTop) / max : 0})`;
      const mid = d ? window.innerWidth / 2 : window.innerHeight / 2;
      let at = 0;
      Array.from(t.children).forEach((s, i) => {
        const r = s.getBoundingClientRect();
        if ((d ? r.left : r.top) <= mid && (d ? r.right : r.bottom) > mid) at = i;
      });
      setCur(at);
    };
    const onWheel = (e: WheelEvent) => {
      if (!wide() || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      t.scrollBy({ left: e.deltaY * 1.2 });
    };
    t.addEventListener("scroll", onScroll, { passive: true });
    t.addEventListener("wheel", onWheel, { passive: false });
    return () => (t.removeEventListener("scroll", onScroll), t.removeEventListener("wheel", onWheel), lock(false));
  }, []);

  useEffect(() => {
    if (covered) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    box.current?.querySelector<HTMLElement>("[data-close]")?.focus({ preventScroll: true });
    return () => window.removeEventListener("keydown", onKey);
  }, [covered, onClose]);

  const k = cur - 1;
  const tone = k >= 0 && k < c.ids.length ? photos[c.ids[k]].tone : photos[c.ids[0]]?.tone;
  return (
    <div ref={box} className={`pg-ov ${open ? "open" : ""}`} role="dialog" aria-modal="true" aria-label={`${c.name} exhibition`} style={tone ? ({ "--tint": tone } as React.CSSProperties) : undefined}>
      <div className="pg-ov-top">
        <div>
          <h3>{c.name}</h3>
          <span className="pg-mono pg-muted">{cur === 0 ? c.line : k >= c.ids.length ? "The end" : `${pad(k + 1)} / ${pad(c.ids.length)}`}</span>
        </div>
        <button type="button" className="pg-x" aria-label="Close" onClick={onClose} data-close>
          <X size={22} strokeWidth={1.5} />
        </button>
      </div>
      <div ref={track} className="pg-track">
        <section className="pg-slide title">
          <span className="pg-mono" style={{ color: "var(--pg-accent)" }}>
            Exhibition {pad(n + 1, 2)}
          </span>
          <h2>{c.name}</h2>
          <p>{c.line}</p>
          <span className="pg-mono pg-muted" style={{ marginTop: 20 }}>
            <span className="hidden min-[900px]:inline">Scroll →</span>
            <span className="min-[900px]:hidden">Scroll ↓</span>
          </span>
        </section>
        {c.ids.map((id, i) => {
          const p = photos[id];
          const r = ratios[id];
          return (
            <section key={`${id}-${i}`} className="pg-slide" style={{ "--r": r } as React.CSSProperties}>
              <button type="button" className="pg-pic" style={{ "--r": r } as React.CSSProperties} onClick={() => onOpen(c.ids, i, c.name)} aria-label={`Open ${p.title}`}>
                <StagePh p={p} eager={i < 2} />
              </button>
              <div className="pg-slide-cap pg-mono">
                <b>{p.title}</b>
                <span>
                  {pad(i + 1)} / {pad(c.ids.length)}
                </span>
              </div>
            </section>
          );
        })}
        <section className="pg-slide title">
          <span className="pg-mono" style={{ color: "var(--pg-accent)" }}>
            End of exhibition
          </span>
          <h2 style={{ fontSize: "clamp(44px,8vw,96px)" }}>Book a session like this</h2>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 10, marginTop: 12 }}>
            {book && <BookButton book={book} onClick={onClose} label="Book a session" />}
            {next !== null && (
              <button type="button" className="pg-btn pg-btn-line" onClick={() => onNext(next)}>
                Next: {nextName} →
              </button>
            )}
          </div>
        </section>
      </div>
      <div className="pg-progress">
        <i ref={bar} />
      </div>
    </div>
  );
}

function BookButton({ book, onClick, label }: { book: BookLink; onClick: () => void; label?: string }) {
  const { label: own, ...props } = book;
  return (
    <a {...props} className="pg-btn pg-btn-paper" onClick={onClick}>
      {label ?? own}
    </a>
  );
}

/* ---------- One photo, full screen ---------- */
function Viewer({ ids, at, from, photos, ratios, book, onClose, keepLock }: { ids: number[]; at: number; from: string; photos: StagePhoto[]; ratios: number[]; book?: BookLink; onClose: () => void; keepLock: boolean }) {
  const [idx, setIdx] = useState(at);
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const [dims, setDims] = useState<[number, number]>([0, 0]);
  // The swipe hint, once per visit, on phones.
  const [hint, setHint] = useState(() => {
    try {
      if (wide() || sessionStorage.getItem("pg-hint") === "1") return false;
      sessionStorage.setItem("pg-hint", "1");
      return true;
    } catch {
      return false;
    }
  });
  const stage = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const loupe = useRef<HTMLDivElement>(null);
  const film = useRef<HTMLDivElement>(null);
  const drag = useRef({ down: false, sx: 0, sy: 0, dx: 0, pan: [0, 0], start: [0, 0], last: 0 });
  const p = photos[ids[idx]];
  const r = ratios[ids[idx]];

  const go = useCallback(
    (dir: number) => {
      if (ids.length < 2) return;
      const el = img.current;
      if (!el) return setIdx((i) => (i + dir + ids.length) % ids.length);
      el.style.transition = "transform .25s, opacity .25s";
      el.style.transform = `translateX(${-dir * 40}vw)`;
      el.style.opacity = "0";
      window.setTimeout(() => {
        setZoom(null);
        drag.current.pan = [0, 0];
        setIdx((i) => (i + dir + ids.length) % ids.length);
        el.style.transition = "none";
        el.style.transform = `translateX(${dir * 30}vw)`;
        requestAnimationFrame(() => requestAnimationFrame(() => ((el.style.transition = ""), (el.style.transform = ""), (el.style.opacity = "1"))));
      }, 240);
    },
    [ids.length],
  );

  // Fit the photo to the stage, keeping its shape.
  useEffect(() => {
    const fit = () => {
      const s = stage.current?.getBoundingClientRect();
      if (!s) return;
      let w = s.width * (wide() ? 1 : 0.94);
      let h = w / r;
      if (h > s.height) {
        h = s.height;
        w = h * r;
      }
      setDims([w, h]);
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [r]);

  useEffect(() => {
    lock(true);
    requestAnimationFrame(() => setOpen(true));
    const t = window.setTimeout(() => setHint(false), 2200);
    return () => {
      window.clearTimeout(t);
      if (!keepLock) lock(false);
    };
  }, [keepLock]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  useEffect(() => {
    film.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [idx]);

  const onDown = (e: React.PointerEvent) => {
    if (p.kind === "video") return;
    const d = drag.current;
    Object.assign(d, { down: true, sx: e.clientX, sy: e.clientY, dx: 0, start: [...d.pan] });
    img.current?.classList.add("drag");
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (e.pointerType === "mouse" && !d.down) return moveLoupe(e);
    if (!d.down || !img.current) return;
    d.dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (zoom) {
      d.pan = [d.start[0] + d.dx / 2.4, d.start[1] + dy / 2.4];
      inner.current?.style.setProperty("translate", `${d.pan[0]}px ${d.pan[1]}px`);
    } else img.current.style.transform = `translateX(${d.dx}px) rotate(${d.dx / 60}deg)`;
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d.down) return;
    d.down = false;
    img.current?.classList.remove("drag");
    const moved = Math.abs(d.dx) > 8 || Math.abs(e.clientY - d.sy) > 8;
    if (!zoom) {
      if (d.dx < -60) go(1);
      else if (d.dx > 60) go(-1);
      else if (img.current) img.current.style.transform = "";
    }
    if (!moved) {
      const now = Date.now();
      if (now - d.last < 320) {
        d.last = 0;
        if (zoom) {
          setZoom(null);
          d.pan = [0, 0];
          inner.current?.style.removeProperty("translate");
        } else {
          const b = img.current!.getBoundingClientRect();
          setZoom({ x: ((e.clientX - b.left) / b.width) * 100, y: ((e.clientY - b.top) / b.height) * 100 });
          loupe.current?.classList.remove("on");
        }
      } else d.last = now;
    }
  };
  // Desktop: a magnifier that shows the photo at 2.5×.
  const moveLoupe = (e: React.PointerEvent) => {
    const l = loupe.current;
    if (!l || !img.current || zoom || !wide() || p.kind === "video") return;
    const b = img.current.getBoundingClientRect();
    if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom) return l.classList.remove("on");
    const Z = 2.5, L = 220;
    l.style.backgroundImage = `url("${p.url}")`;
    l.style.backgroundSize = `${b.width * Z}px ${b.height * Z}px`;
    l.style.backgroundPosition = `${-((e.clientX - b.left) * Z - L / 2)}px ${-((e.clientY - b.top) * Z - L / 2)}px`;
    l.style.left = `${e.clientX - L / 2}px`;
    l.style.top = `${e.clientY - L / 2}px`;
    l.classList.add("on");
  };

  return (
    <div className={`pg-ov pg-vw ${open ? "open" : ""}`} role="dialog" aria-modal="true" aria-label={p.title} style={p.tone ? ({ "--tint": p.tone } as React.CSSProperties) : undefined}>
      <div className="pg-ov-top">
        <span className="pg-mono pg-muted">
          {pad(idx + 1)} / {pad(ids.length)} · {from}
        </span>
        <button type="button" className="pg-x" aria-label="Close" onClick={onClose} autoFocus>
          <X size={22} strokeWidth={1.5} />
        </button>
      </div>
      {ids.length > 1 && (
        <>
          <button type="button" className="pg-vnav prev" aria-label="Previous photo" onClick={() => go(-1)}>
            <ChevronLeft size={22} strokeWidth={1.5} />
          </button>
          <button type="button" className="pg-vnav next" aria-label="Next photo" onClick={() => go(1)}>
            <ChevronRight size={22} strokeWidth={1.5} />
          </button>
        </>
      )}
      <div ref={stage} className="pg-stage" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={() => loupe.current?.classList.remove("on")}>
        <div ref={img} className={`pg-vimg ${zoom ? "zoomed" : ""}`} style={{ width: dims[0], height: dims[1], ...(zoom ? ({ "--ox": `${zoom.x}%`, "--oy": `${zoom.y}%` } as React.CSSProperties) : {}) }}>
          {p.kind === "video" ? (
            <div className="pg-ph" style={toneStyle(p.tone)}>
              <video src={p.url} poster={p.thumb} controls playsInline preload="metadata" />
            </div>
          ) : (
            <div ref={inner} className="pg-ph" style={toneStyle(p.tone)} key={p.url}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={p.title} decoding="async" draggable={false} className="ok" onError={hideBroken} />
            </div>
          )}
        </div>
        <div className={`pg-hint ${hint ? "on" : ""}`}>Swipe · double-tap to zoom</div>
      </div>
      <div className="pg-vinfo">
        <div>
          <h4>{p.title}</h4>
          <span className="pg-mono pg-muted">{p.group}</span>
          {p.chips.length > 0 && (
            <div className="pg-exif">
              {p.chips.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
          )}
        </div>
        {book && <BookButton book={book} onClick={onClose} />}
        {ids.length > 1 && (
          <div ref={film} className="pg-film">
            {ids.map((id, i) => (
              <button key={`${id}-${i}`} type="button" aria-label={`Photo ${i + 1}`} aria-current={i === idx} style={{ "--r": ratios[id] } as React.CSSProperties} onClick={() => (setZoom(null), setIdx(i))}>
                <div className="pg-ph" style={toneStyle(photos[id].tone)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photos[id].thumb} alt="" loading="lazy" className="ok" onError={hideBroken} />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      <div ref={loupe} className="pg-loupe" aria-hidden="true" />
    </div>
  );
}
