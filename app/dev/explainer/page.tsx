import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import { notFound } from "next/navigation";
import { Spark, Tick } from "@/components/tikka/glyphs";
import { SoloCard } from "@/components/tikka/SoloCard";
import type { CardFace, CardReveal } from "@/components/tikka/TikkaCard";
import { TikkaPack } from "@/components/tikka/TikkaPack";
import { qrSvg } from "@/lib/qr";
import "./explainer.css";

// DEV ONLY: the 9:16 explainer video, played as one long CSS timeline on a 540×960 stage.
// scripts/render-explainer.cjs seeks it frame by frame and makes a 1080×1920 MP4. It uses the
// real card, pack, QR and fonts, so the video matches the product. Edit the words or timings
// below, then render again. The chat screens are styled as a chat, not a copy of WhatsApp's app.

export const metadata: Metadata = { title: "Explainer", robots: { index: false, follow: false } };

/** Seconds. The render script reads it from the page's data-length. */
const LENGTH = 50;

const FACE: CardFace = {
  name: "Glow Studio",
  initials: "GS",
  category: "Skin & beauty studio",
  area: "Lekki",
  city: "Lagos",
  brandColor: "#9C3B5C",
  onBrandColor: "#FFFFFF",
  verified: true,
  rating: 4.9,
  reviewCount: 128,
  tagline: "Facials, peels and glow-ups since 2019.",
};
const reveal = (tier: CardReveal["tier"], reward: string, claimer: string, serial: string): CardReveal => ({
  tier,
  reward,
  code: "GS-7X4QP",
  expiry: "Sun 14 Dec",
  serial,
  claimer,
});
const RARE = reveal("rare", "20% off any service", "Adaeze", "0412");

const EASE = "cubic-bezier(.2,.8,.2,1)";
/** One entrance: hidden before `start`, then animates in and stays. */
const enter = (name: string, start: number, dur = 0.5, ease = EASE): CSSProperties => ({ animation: `${name} ${dur}s ${ease} ${start}s both` });
/** Visible from `start` to `end`, with a short fade at each end. */
const during = (start: number, end: number, fade = 0.3): CSSProperties => ({
  animation: `xvIn ${fade}s linear ${start}s both, xvOut ${fade}s linear ${end - fade}s forwards`,
});

function Scene({ start, end, children }: { start: number; end: number; children: ReactNode }) {
  return (
    <section className="xv-scene" style={during(start, end, 0.3)}>
      {children}
    </section>
  );
}

function At({ style, children, className = "" }: { style?: CSSProperties; children?: ReactNode; className?: string }) {
  return (
    <div className={className} style={style}>
      {children}
    </div>
  );
}

function Heading({ kicker, title, at }: { kicker: string; title: string; at: number }) {
  return (
    <>
      <At style={enter("xvUp", at)} className="xv-kicker">
        {kicker}
      </At>
      <At style={enter("xvUp", at + 0.15)} className="xv-h">
        {title}
      </At>
    </>
  );
}

function Caption({ start, end, children }: { start: number; end: number; children: ReactNode }) {
  return (
    <At className="xv-caption" style={during(start, end, 0.25)}>
      {children}
    </At>
  );
}

/** A phone, scaled to fit under the heading. Its screens are layers shown one after another. */
function Phone({ at, zoom = 0.92, top = 232, label, children }: { at: number; zoom?: number; top?: number; label?: ReactNode; children: ReactNode }) {
  return (
    <At style={{ position: "absolute", left: "50%", top, translate: "-50% 0", ...enter("xvRise", at, 0.6) }}>
      <div style={{ zoom }}>
        <div className="xv-phone">
          {label}
          <div className="xv-screen">{children}</div>
        </div>
      </div>
    </At>
  );
}

function Layer({ start, end, light = false, children }: { start: number; end: number; light?: boolean; children: ReactNode }) {
  return (
    <div className="xv-layer" style={{ background: light ? "var(--surface)" : "var(--night)", color: light ? "var(--ink)" : "var(--on-night)", ...during(start, end, 0.2) }}>
      {children}
    </div>
  );
}

function ChatHead() {
  return (
    <div className="xv-chat-head">
      <span style={{ fontSize: 22, lineHeight: 1, opacity: 0.8 }}>‹</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/tikka-app-icon.svg" alt="" width={34} height={34} style={{ borderRadius: 999 }} />
      <span style={{ display: "grid" }}>
        <b style={{ fontSize: 15 }}>Tikka</b>
        <span style={{ fontSize: 11, color: "var(--on-night-muted)" }}>Business account</span>
      </span>
    </div>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
      <path d="M3 20.5 21 12 3 3.5l.01 6.6L15 12 3.01 13.9z" />
    </svg>
  );
}

const SPARKS = Array.from({ length: 12 }, (_, i) => {
  const angle = (i / 12) * Math.PI * 2 + 0.2;
  const r = i % 2 ? 165 : 235;
  return { dx: Math.round(Math.cos(angle) * r), dy: Math.round(Math.sin(angle) * r), size: i % 3 === 0 ? 34 : 22, delay: (i % 4) * 0.04 };
});

const COUNT = ["0", "186", "472", "815", "1,103", "1,248"];
const QUESTION = ["Who", "were", "the", "other", "1,245?"];

export default async function ExplainerPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const qr = await qrSvg("GS-7X4QP");

  return (
    <main style={{ display: "grid", placeItems: "center", minHeight: "100vh", background: "var(--night)" }}>
      <div className="xv" data-theme="light" data-length={LENGTH}>
        <div className="xv-glow" />

        {/* 1 · The hook: 1,248 saw it, 3 walked in */}
        <Scene start={0} end={5.2}>
          <div style={{ position: "absolute", left: 0, right: 0, top: 200 }}>
            <At style={{ animation: `xvShrinkOut .35s ease-in 2.0s forwards` }}>
              <div style={{ position: "relative", height: 130 }}>
                {COUNT.map((n, i) => (
                  <At
                    key={n}
                    style={{
                      position: "absolute",
                      inset: 0,
                      fontSize: 118,
                      lineHeight: "130px",
                      fontWeight: 800,
                      letterSpacing: "-0.04em",
                      ...(i === COUNT.length - 1 ? enter("xvCount", 0.15 + i * 0.17, 0.12, "linear") : during(0.15 + i * 0.17, 0.15 + (i + 1) * 0.17, 0.04)),
                    }}
                  >
                    {n}
                  </At>
                ))}
              </div>
              <At style={enter("xvUp", 0.35, 0.4)} className="xv-sub">
                <span style={{ fontSize: 26, lineHeight: "34px", color: "var(--on-night)", fontWeight: 700 }}>people saw your post this week.</span>
              </At>
            </At>
          </div>
          <div style={{ position: "absolute", left: 0, right: 0, top: 200 }}>
            <At style={{ fontSize: 150, lineHeight: "150px", fontWeight: 800, letterSpacing: "-0.04em", ...enter("xvSlam", 2.15, 0.45) }}>3</At>
            <At style={{ fontSize: 32, lineHeight: "40px", fontWeight: 800, ...enter("xvUp", 2.4, 0.35) }}>walked in.</At>
          </div>
          <div style={{ position: "absolute", left: 30, right: 30, top: 520, display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "4px 14px" }}>
            {QUESTION.map((w, i) => (
              <At
                key={w}
                style={{
                  fontSize: i === QUESTION.length - 1 ? 60 : 46,
                  lineHeight: "64px",
                  fontWeight: 800,
                  letterSpacing: "-0.03em",
                  color: i === QUESTION.length - 1 ? "var(--on-night)" : "var(--on-night-muted)",
                  ...enter("xvWord", 3.15 + i * 0.17, 0.4),
                }}
              >
                {w}
              </At>
            ))}
          </div>
        </Scene>

        {/* 2 · Tikka bursts out of the pack */}
        <Scene start={5.2} end={9.4}>
          <div style={{ position: "absolute", left: 75, top: 150, width: 390, height: 452 }}>
            <At style={{ position: "absolute", inset: 0, ...enter("xvDrop", 5.35, 0.6) }}>
              <At style={{ position: "absolute", inset: 0, transformOrigin: "50% 80%", ...enter("xvShake", 6.0, 0.45, "ease-in-out") }}>
                <At style={{ position: "absolute", inset: 0, animation: `xvAway .35s ease-in 6.5s forwards` }}>
                  <div className="tk-stage" data-theme="light">
                    <TikkaPack as="div" businessName={FACE.name} initials={FACE.initials} brandColor={FACE.brandColor} onBrandColor={FACE.onBrandColor} total={600} contents={{ legendary: 12, rare: 60, thankYou: 528 }} />
                  </div>
                </At>
              </At>
            </At>
            <At className="xv-flash" style={{ animation: `xvFlash .7s ease-out 6.5s both` }} />
            {SPARKS.map((s, i) => (
              <At
                key={i}
                className="xv-spark"
                style={{ width: s.size, height: s.size, margin: `-${s.size / 2}px 0 0 -${s.size / 2}px`, ["--dx" as string]: `${s.dx}px`, ["--dy" as string]: `${s.dy}px`, animation: `xvSparkFly 1.1s cubic-bezier(.1,.7,.3,1) ${6.6 + s.delay}s both` }}
              >
                <Spark className="size-full" />
              </At>
            ))}
            <At style={{ position: "absolute", left: 0, right: 0, top: 190, display: "grid", placeItems: "center", ...enter("xvBurst", 6.6, 0.6) }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/tikka-lockup-reversed.svg" alt="Tikka" width={270} height={79} />
            </At>
          </div>
          <At style={{ position: "absolute", left: 40, right: 40, top: 640, ...enter("xvUp", 7.35, 0.5) }}>
            <span style={{ fontSize: 28, lineHeight: "36px", fontWeight: 800, textWrap: "balance" }}>Turn people who see your business into customers who walk in.</span>
          </At>
        </Scene>

        {/* 3 · Run a drop */}
        <Scene start={9.4} end={14.6}>
          <Heading kicker="1 · Run a drop" title="Collectible cards for your customers" at={9.55} />
          <div style={{ position: "relative", width: 460, height: 300, marginTop: 50 }}>
            <At style={{ position: "absolute", left: 0, top: 24, ...enter("xvFanL", 10.2, 0.6) }}>
              <SoloCard zoom={0.6} flipped label="" face={FACE} total={600} reveal={reveal("thank_you", "Priority booking", "Tunde", "0533")} />
            </At>
            <At style={{ position: "absolute", right: 0, top: 24, ...enter("xvFanR", 10.4, 0.6) }}>
              <SoloCard zoom={0.6} flipped label="" face={FACE} total={600} finish="holo" reveal={reveal("legendary", "Free signature facial", "Kemi", "0087")} />
            </At>
            <At style={{ position: "absolute", left: 146, top: 0, zIndex: 2, ...enter("xvFanC", 10.6, 0.6) }}>
              <SoloCard zoom={0.6} flipped label="" face={FACE} total={600} reveal={RARE} />
            </At>
          </div>
          <div style={{ display: "grid", gap: 10, marginTop: 30 }}>
            {[
              ["var(--rarity-legendary)", "Legendary · very few"],
              ["var(--rarity-rare)", "Rare · some"],
              ["var(--rarity-common)", "Thank-you · everyone else"],
            ].map(([c, t], i) => (
              <At key={t} style={enter("xvLeft", 11.3 + i * 0.2, 0.45)} className="xv-pill">
                <span style={{ width: 10, height: 10, borderRadius: 99, background: c }} />
                {t}
              </At>
            ))}
          </div>
          <Caption start={12.3} end={14.6}>
            Every Tikka holds something. Nobody walks away with nothing.
          </Caption>
        </Scene>

        {/* 4 · Share one link */}
        <Scene start={14.6} end={19.4}>
          <Heading kicker="2 · Share one link" title="Put it where people already see you" at={14.75} />
          <At style={{ marginTop: 64, ...enter("xvZoom", 15.4) }}>
            <div className="xv-pill xv-mono" style={{ fontSize: 17, padding: "16px 22px", background: "var(--on-night)", color: "var(--ink)" }}>
              usetikka.com/d/glow-studio/glow-up
            </div>
          </At>
          <div style={{ display: "grid", gap: 14, marginTop: 36, width: 360 }}>
            {["Your WhatsApp status", "Your Instagram bio", "A QR poster at your counter"].map((t, i) => (
              <At key={t} style={enter("xvLeft", 15.9 + i * 0.35, 0.45)} className="xv-pill">
                <span style={{ display: "inline-flex", width: "100%", alignItems: "center", gap: 12, fontSize: 20 }}>
                  <Spark className="size-[18px] shrink-0 text-gold" />
                  {t}
                </span>
              </At>
            ))}
          </div>
          <Caption start={17.2} end={19.4}>
            One link. More people through your door.
          </Caption>
        </Scene>

        {/* 5 · They claim on WhatsApp */}
        <Scene start={19.4} end={29.8}>
          <Heading kicker="3 · They claim on WhatsApp" title="No app. No forms." at={19.55} />
          <Phone
            at={19.85}
            label={
              <>
                <At className="xv-app-label xv-pill" style={{ ...during(21.9, 24.6, 0.2), fontSize: 15, padding: "6px 14px" }}>
                  On WhatsApp
                </At>
                <At className="xv-app-label xv-pill" style={{ ...during(27.9, 29.8, 0.2), fontSize: 15, padding: "6px 14px" }}>
                  On WhatsApp
                </At>
              </>
            }
          >
            {/* a · the claim sheet */}
            <Layer start={19.85} end={21.9}>
              <div style={{ display: "grid", justifyItems: "center", paddingTop: 34 }}>
                <SoloCard zoom={0.55} label="" face={FACE} total={600} />
                <p style={{ marginTop: 16, fontSize: 22, fontWeight: 800 }}>Claim your Tikka</p>
                <div style={{ width: 236, marginTop: 14, textAlign: "left" }}>
                  <p style={{ fontSize: 12, color: "var(--on-night-muted)" }}>First name</p>
                  <div style={{ marginTop: 6, height: 44, borderRadius: 12, background: "var(--night-raised)", display: "flex", alignItems: "center", padding: "0 14px", fontSize: 16 }}>Adaeze</div>
                </div>
                <At style={{ width: 236, marginTop: 16, ...enter("xvTap", 21.3, 0.3, "ease-in-out") }}>
                  <div className="xv-btn xv-btn-gold" style={{ fontSize: 16 }}>
                    Continue on WhatsApp
                  </div>
                </At>
              </div>
            </Layer>

            {/* b · the chat: the message is ready, they tap Send */}
            <Layer start={21.9} end={24.6} light>
              <ChatHead />
              <div className="xv-chat-body">
                <At className="xv-bubble-out" style={enter("xvUp", 23.15, 0.3)}>
                  Claim my Tikka <b>TK-4821K</b> from Glow Studio
                  <span style={{ display: "block", textAlign: "right", fontSize: 10, color: "var(--ink-muted)" }}>9:41 ✓✓</span>
                </At>
              </div>
              <div className="xv-chat-input">
                <div className="xv-chat-field">
                  <At style={{ animation: `xvClear .1s linear 23.1s forwards` }}>Claim my Tikka TK-4821K from Glow Studio</At>
                </div>
                <At className="xv-send" style={enter("xvTap", 22.75, 0.3, "ease-in-out")}>
                  <SendIcon />
                </At>
              </div>
            </Layer>

            {/* c · back on the page: hold, tremble, flip */}
            <Layer start={24.6} end={27.9}>
              <div style={{ display: "grid", justifyItems: "center", paddingTop: 26 }}>
                <span className="xv-pill" style={{ fontSize: 13, padding: "6px 12px" }}>
                  <Tick className="size-4" /> Confirmed on WhatsApp
                </span>
                <div style={{ position: "relative", width: 230, height: 322, marginTop: 34 }}>
                  <At style={{ position: "absolute", inset: -40, borderRadius: 999, background: "radial-gradient(closest-side, var(--rarity-rare), transparent)", ...enter("xvGlowOn", 26.3, 0.5) }} />
                  <At style={{ position: "absolute", inset: 0, transformOrigin: "50% 90%", ...enter("xvShake", 25.6, 0.4, "ease-in-out") }}>
                    <At style={{ animation: `xvSquashOut .25s ease-in 26.05s forwards` }}>
                      <SoloCard zoom={0.82} label="" face={FACE} total={600} claimedBy="Adaeze" />
                    </At>
                  </At>
                  <At style={{ position: "absolute", inset: 0, ...enter("xvSquashIn", 26.3, 0.3, "ease-out") }}>
                    <SoloCard zoom={0.82} flipped label="" face={FACE} total={600} reveal={RARE} />
                  </At>
                </div>
              </div>
            </Layer>

            {/* d · Tikka's reply: the card, saved in their chat */}
            <Layer start={27.9} end={29.8} light>
              <ChatHead />
              <div className="xv-chat-body">
                <div className="xv-bubble-out">
                  Claim my Tikka <b>TK-4821K</b> from Glow Studio
                  <span style={{ display: "block", textAlign: "right", fontSize: 10, color: "var(--ink-muted)" }}>9:41 ✓✓</span>
                </div>
                <At className="xv-bubble-in" style={enter("xvUp", 28.1, 0.35)}>
                  <div style={{ display: "grid", placeItems: "center", padding: "6px 0 8px", borderRadius: 10, background: "var(--night)" }}>
                    <SoloCard zoom={0.4} flipped label="" face={FACE} total={600} reveal={RARE} />
                  </div>
                  <p style={{ marginTop: 6 }}>
                    🎟 You got a Tikka from Glow Studio! 20% off any service · Rare · Code <b>GS-7X4QP</b> · till Sun 14 Dec. Show this at the counter.
                  </p>
                </At>
              </div>
              <div className="xv-chat-input">
                <div className="xv-chat-field" style={{ color: "var(--ink-muted)" }}>
                  Message
                </div>
                <div className="xv-send">
                  <SendIcon />
                </div>
              </div>
            </Layer>
          </Phone>
          <Caption start={20.2} end={21.9}>
            They tap Claim and type their first name.
          </Caption>
          <Caption start={21.9} end={24.6}>
            WhatsApp opens with the message ready. They tap Send.
          </Caption>
          <Caption start={24.6} end={27.9}>
            Back on your page: hold, flip, see what they got.
          </Caption>
          <Caption start={27.9} end={29.8}>
            Their Tikka is saved in their WhatsApp.
          </Caption>
        </Scene>

        {/* 6 · At your counter: QR or code */}
        <Scene start={29.8} end={37.0}>
          <Heading kicker="4 · At your counter" title="They show the QR or the code" at={29.95} />
          <Phone at={30.25}>
            {/* a · the customer's Tikka */}
            <Layer start={30.25} end={32.6}>
              <div style={{ display: "grid", justifyItems: "center", paddingTop: 40 }}>
                <p style={{ fontSize: 13, color: "var(--on-night-muted)" }}>Glow Studio · 20% off any service</p>
                <p style={{ marginTop: 6, fontSize: 22, fontWeight: 800 }}>Show this at the counter</p>
                <div style={{ marginTop: 22, width: 196, height: 196, borderRadius: 18, background: "var(--surface-raised)", padding: 12 }} dangerouslySetInnerHTML={{ __html: qr }} />
                <p className="xv-mono" style={{ marginTop: 22, fontSize: 30, fontWeight: 700, letterSpacing: "0.06em" }}>
                  GS-7X4QP
                </p>
                <p style={{ marginTop: 6, fontSize: 13, color: "var(--on-night-muted)" }}>Rare · ends Sun 14 Dec</p>
                <p style={{ marginTop: 18, fontSize: 12, color: "var(--on-night-muted)" }}>Also in your WhatsApp</p>
              </div>
            </Layer>

            {/* b · the staff phone scans it */}
            <Layer start={32.6} end={34.4} light>
              <div style={{ padding: "34px 18px 0", textAlign: "left" }}>
                <p style={{ fontSize: 20, fontWeight: 800 }}>Redeem</p>
                <p style={{ marginTop: 2, fontSize: 12, color: "var(--ink-muted)" }}>Scan the QR on their Tikka, or type the code.</p>
                <div style={{ position: "relative", marginTop: 16, height: 240, borderRadius: 18, background: "var(--ink)", display: "grid", placeItems: "center", overflow: "hidden" }}>
                  <div style={{ width: 150, height: 150, borderRadius: 10, background: "var(--surface-raised)", padding: 8, rotate: "-4deg" }} dangerouslySetInnerHTML={{ __html: qr }} />
                  <At className="xv-scanline" style={{ top: 20, animation: `xvScan 1.4s ease-in-out 32.7s 1 both` }} />
                </div>
                <div style={{ marginTop: 16, height: 44, borderRadius: 12, border: "1px solid var(--line-strong)", display: "flex", alignItems: "center", padding: "0 14px", fontSize: 14, color: "var(--ink-muted)" }}>
                  or type the code: GS-7X4QP
                </div>
              </div>
            </Layer>

            {/* c · valid, confirm, done */}
            <Layer start={34.4} end={37.0} light>
              <div style={{ padding: "34px 18px 0", textAlign: "left" }}>
                <p style={{ fontSize: 20, fontWeight: 800 }}>Redeem</p>
                <div className="xv-panel" style={{ marginTop: 16, padding: 18, background: "var(--success-soft)" }}>
                  <span className="xv-tag" style={{ background: "var(--success)", color: "var(--on-success)" }}>
                    Valid
                  </span>
                  <p className="xv-mono" style={{ marginTop: 10, fontSize: 22, fontWeight: 700, letterSpacing: "0.04em" }}>
                    GS-7X4QP
                  </p>
                  <p style={{ marginTop: 6, fontSize: 16, fontWeight: 700 }}>Adaeze O. · 20% off any service</p>
                  <p style={{ marginTop: 2, fontSize: 12, color: "var(--ink-muted)" }}>Rare · ends Sun 14 Dec</p>
                </div>
                <At style={{ marginTop: 16, ...enter("xvTap", 35.15, 0.3, "ease-in-out") }}>
                  <div className="xv-btn" style={{ fontSize: 16 }}>
                    Confirm redemption
                  </div>
                </At>
                <At style={{ marginTop: 16, display: "grid", placeItems: "center", ...enter("xvPop", 35.5, 0.4) }}>
                  <div className="xv-pill" style={{ background: "var(--success)", color: "var(--on-success)", fontSize: 15, padding: "10px 16px" }}>
                    <Tick className="size-4" />
                    Done. Adaeze&apos;s Tikka is used.
                  </div>
                </At>
              </div>
            </Layer>
          </Phone>
          <Caption start={30.5} end={32.6}>
            They show their Tikka: a QR and a code.
          </Caption>
          <Caption start={32.6} end={34.4}>
            You scan the QR, or type the code.
          </Caption>
          <Caption start={34.4} end={37.0}>
            Confirm. Done in seconds.
          </Caption>
        </Scene>

        {/* 7 · You follow up */}
        <Scene start={37.0} end={41.8}>
          <Heading kicker="5 · You follow up" title="Every claimer becomes a lead" at={37.15} />
          <div style={{ display: "grid", gap: 10, marginTop: 44, width: 440 }}>
            {[
              ["Adaeze O.", "Rare · came in", "var(--rarity-rare)"],
              ["Kemi A.", "Legendary · came in", "var(--rarity-legendary)"],
              ["Tunde B.", "Thank-you · not yet", "var(--rarity-common)"],
            ].map(([name, meta, color], i) => (
              <At key={name} style={enter("xvLeft", 37.8 + i * 0.3, 0.45)}>
                <div className="xv-panel" style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px" }}>
                  <span style={{ width: 12, height: 12, borderRadius: 99, background: color, flex: "none" }} />
                  <span style={{ flex: 1 }}>
                    <b style={{ fontSize: 18 }}>{name}</b>
                    <span style={{ display: "block", fontSize: 14, color: "var(--ink-muted)" }}>{meta}</span>
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "var(--brand)" }}>Message</span>
                </div>
              </At>
            ))}
          </div>
          <At style={{ marginTop: 34, ...enter("xvZoom", 39.2) }}>
            <span className="xv-tag">Example</span>
            <p style={{ marginTop: 10, fontSize: 18, color: "var(--on-night-muted)" }}>This drop brought in</p>
            <p style={{ fontSize: 56, lineHeight: "60px", fontWeight: 800, letterSpacing: "-0.03em", color: "var(--gold)" }}>₦1.9M</p>
          </At>
        </Scene>

        {/* 8 · Plus: a free business page */}
        <Scene start={41.8} end={46.2}>
          <Heading kicker="Plus" title="A free page for your business" at={41.95} />
          <Phone at={42.3} zoom={0.86} top={226}>
            <Layer start={42.3} end={46.2} light>
              <div style={{ padding: "16px 12px 6px", background: "var(--surface-raised)" }}>
                <div className="xv-mono" style={{ fontSize: 11, textAlign: "center", padding: "6px 0", borderRadius: 999, background: "var(--surface-sunken)", color: "var(--ink-muted)" }}>
                  usetikka.com/glow-studio
                </div>
              </div>
              <At style={{ animation: `xvScroll 2.4s ease-in-out 43.3s both` }}>
                <div style={{ height: 110, background: FACE.brandColor }} />
                <div style={{ padding: "0 16px", textAlign: "left" }}>
                  <div style={{ marginTop: -34, width: 68, height: 68, borderRadius: 999, background: FACE.brandColor, color: FACE.onBrandColor, border: "4px solid var(--surface)", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 22 }}>GS</div>
                  <p style={{ marginTop: 8, fontSize: 22, fontWeight: 800 }}>Glow Studio</p>
                  <p style={{ fontSize: 13, color: "var(--ink-muted)" }}>Skin &amp; beauty studio · Lekki, Lagos</p>
                  <p style={{ marginTop: 4, fontSize: 13, fontWeight: 700 }}>★ 4.9 · 128 reviews</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 14 }}>
                    {["Book", "Call", "WhatsApp", "Directions"].map((b, i) => (
                      <div key={b} className="xv-btn" style={{ height: 40, fontSize: 14, ...(i === 0 ? {} : { background: "var(--surface-raised)", color: "var(--ink)", border: "1px solid var(--line-strong)" }) }}>
                        {b}
                      </div>
                    ))}
                  </div>
                  <p style={{ marginTop: 18, fontSize: 15, fontWeight: 800 }}>Services</p>
                  {[
                    ["Signature facial", "₦25,000"],
                    ["Chemical peel", "₦35,000"],
                    ["Brow tint", "₦8,000"],
                    ["Glow-up package", "₦60,000"],
                  ].map(([s, p]) => (
                    <div key={s} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--line)", fontSize: 14 }}>
                      <span>{s}</span>
                      <b>{p}</b>
                    </div>
                  ))}
                  <p style={{ marginTop: 16, fontSize: 15, fontWeight: 800 }}>Hours</p>
                  <p style={{ marginTop: 4, fontSize: 14, color: "var(--ink-muted)" }}>Mon–Sat · 9am–7pm</p>
                </div>
              </At>
            </Layer>
          </Phone>
          <Caption start={42.9} end={46.2}>
            Your mini website for your Instagram and WhatsApp bio.
          </Caption>
        </Scene>

        {/* 9 · Start free */}
        <Scene start={46.2} end={LENGTH + 1}>
          <div style={{ marginTop: 290, display: "grid", justifyItems: "center" }}>
            <At style={enter("xvBurst", 46.35, 0.6)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/tikka-lockup-reversed.svg" alt="Tikka" width={220} height={64} />
            </At>
            <At style={{ marginTop: 40, ...enter("xvUp", 46.95) }} className="xv-big">
              Your first drop is free.
            </At>
            <At style={{ marginTop: 34, width: 320, ...enter("xvUp", 47.5) }}>
              <div className="xv-btn" style={{ background: "var(--on-night)", color: "var(--night)", height: 60, fontSize: 22 }}>
                usetikka.com
              </div>
            </At>
          </div>
        </Scene>
      </div>
    </main>
  );
}
