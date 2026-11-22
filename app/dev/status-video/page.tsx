import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import { notFound } from "next/navigation";
import { Spark, Tick } from "@/components/tikka/glyphs";
import { SoloCard } from "@/components/tikka/SoloCard";
import type { CardFace, CardReveal } from "@/components/tikka/TikkaCard";
import { TikkaPack } from "@/components/tikka/TikkaPack";
import { qrSvg } from "@/lib/qr";
import "../explainer/explainer.css";
import "./status-video.css";

// DEV ONLY: the WhatsApp status explainer, 9:16 and 59 seconds (one status). One CSS timeline on a
// 540×960 stage; render it with
//   node scripts/render-explainer.cjs tikka-status.mp4 --url http://localhost:3000/dev/status-video
// The script, the voice lines and the sound cues are in docs/STATUS_VIDEO.md. Photos are AI-made
// stand-ins in public/dev/explainer/. Words stay inside WhatsApp's safe area (see the CSS).

export const metadata: Metadata = { title: "Status video", robots: { index: false, follow: false } };

const LENGTH = 59;
const IMG = "/dev/explainer";

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
const RARE: CardReveal = { tier: "rare", reward: "20% off any service", code: "GS-7X4QP", expiry: "Sun 14 Dec", serial: "0412", claimer: "Adaeze" };

const EASE = "cubic-bezier(.2,.8,.2,1)";
const enter = (name: string, start: number, dur = 0.5, ease = EASE): CSSProperties => ({ animation: `${name} ${dur}s ${ease} ${start}s both` });
const during = (start: number, end: number, fade = 0.3): CSSProperties => ({
  animation: `xvIn ${fade}s linear ${start}s both, xvOut ${fade}s linear ${end - fade}s forwards`,
});
/** An entrance, then a gentle float that keeps it alive. */
const floatIn = (start: number, name = "xvPop", dur = 0.45): CSSProperties => ({
  animation: `${name} ${dur}s ${EASE} ${start}s both, svFloat 3.2s ease-in-out ${start + dur}s infinite`,
});

function At({ style, children, className = "" }: { style?: CSSProperties; children?: ReactNode; className?: string }) {
  return (
    <div className={className} style={style}>
      {children}
    </div>
  );
}

function Scene({ start, end, fade = 0.35, children }: { start: number; end: number; fade?: number; children: ReactNode }) {
  return (
    <section style={{ position: "absolute", inset: 0, ...during(start, end, fade) }}>
      {children}
    </section>
  );
}

/** Words on screen, word by word. */
function Say({ top, at, words, night = false, size }: { top: number; at: number; words: string; night?: boolean; size?: number }) {
  return (
    <div className={`sv-say ${night ? "sv-say-night" : ""}`} style={{ top, ...(size ? { fontSize: size, lineHeight: `${size + 6}px` } : {}) }}>
      {words.split(" ").map((w, i) => (
        <span key={i} style={{ display: "inline-block", marginRight: "0.26em", ...enter("xvWord", at + i * 0.09, 0.4) }}>
          {w}
        </span>
      ))}
    </div>
  );
}

function Face({ src, size, x, y, style }: { src: string; size: number; x: number; y: number; style?: CSSProperties }) {
  return (
    <div className="sv-face" style={{ width: size, height: size, left: x - size / 2, top: y - size / 2, ...style }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`${IMG}/${src}`} alt="" />
    </div>
  );
}

/* The platforms' own icons (Simple Icons shapes) in their own colours. These are Instagram's,
   TikTok's and WhatsApp's marks, not Tikka colours, so they don't come from the tokens. */
const PATHS = {
  instagram:
    "M7.03.084c-1.277.06-2.149.264-2.911.563-.789.308-1.458.72-2.123 1.388S.92 3.373.616 4.163c-.296.764-.496 1.636-.552 2.914C.008 8.354-.005 8.765.001 12.024c.006 3.258.021 3.667.083 4.947.061 1.277.264 2.148.563 2.911.308.789.72 1.457 1.388 2.123.668.665 1.337 1.074 2.129 1.38.763.295 1.636.496 2.913.552 1.277.056 1.688.069 4.946.063 3.258-.006 3.668-.021 4.948-.081 1.28-.061 2.147-.265 2.91-.563.789-.309 1.458-.72 2.123-1.388.665-.668 1.075-1.338 1.38-2.128.296-.764.497-1.636.552-2.913.056-1.281.069-1.69.063-4.948-.006-3.258-.021-3.667-.082-4.947-.06-1.28-.264-2.149-.563-2.912-.308-.789-.72-1.457-1.388-2.123C21.298 1.33 20.628.921 19.838.617 19.074.321 18.202.12 16.924.065 15.647.009 15.236-.005 11.977.001 8.718.008 8.31.022 7.03.084m.14 21.693c-1.17-.051-1.805-.245-2.229-.408-.56-.216-.96-.477-1.382-.895-.422-.418-.681-.819-.9-1.378-.164-.423-.362-1.058-.417-2.228-.06-1.265-.072-1.644-.079-4.848-.007-3.204.005-3.583.061-4.848.05-1.169.246-1.805.408-2.228.216-.561.476-.96.895-1.382.419-.422.818-.681 1.378-.9.423-.165 1.058-.361 2.227-.417 1.266-.06 1.645-.072 4.848-.079 3.203-.007 3.584.005 4.85.061 1.169.051 1.805.244 2.228.408.561.216.96.475 1.382.895.422.419.682.818.9 1.379.166.422.362 1.056.417 2.226.06 1.266.074 1.645.08 4.848.006 3.203-.006 3.584-.061 4.848-.051 1.17-.245 1.806-.408 2.23-.216.56-.476.96-.895 1.381-.419.421-.818.681-1.378.9-.423.165-1.058.362-2.226.417-1.266.06-1.645.072-4.85.079-3.204.007-3.582-.006-4.848-.061M16.953 5.586a1.44 1.44 0 1 0 1.437-1.442 1.44 1.44 0 0 0-1.437 1.442M5.839 12.012a6.162 6.162 0 1 0 12.323-.024 6.162 6.162 0 0 0-12.323.024M8 12.008A4 4 0 1 1 12.008 16 4 4 0 0 1 8 12.008",
  tiktok:
    "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z",
  whatsapp:
    "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z",
};
type Platform = keyof typeof PATHS;
const PLATFORM_BG: Record<Platform, string> = {
  instagram: "linear-gradient(45deg, #FEDA75 0%, #FA7E1E 25%, #D62976 50%, #962FBF 75%, #4F5BD5 100%)",
  tiktok: "#000000",
  whatsapp: "#25D366",
};

function Icon({ name, size = 38 }: { name: Platform; size?: number }) {
  return (
    <span className="sv-icon" style={{ width: size, height: size, borderRadius: size * 0.29, background: PLATFORM_BG[name] }}>
      <svg viewBox="0 0 24 24" width={size * 0.58} height={size * 0.58} fill="#FFFFFF" aria-hidden="true">
        <path d={PATHS[name]} />
      </svg>
    </span>
  );
}

function Bubble({ icon, x, y, at, children }: { icon: Platform; x: number; y: number; at: number; children: ReactNode }) {
  return (
    <At className="sv-bubble" style={{ left: x, top: y, ...floatIn(at) }}>
      <Icon name={icon} />
      {children}
    </At>
  );
}

/** A number that ticks through `steps`, then stays on the last one. */
function Counter({ steps, at, every, style }: { steps: string[]; at: number; every: number; style: CSSProperties }) {
  return (
    <div style={{ position: "relative", ...style }}>
      <span style={{ visibility: "hidden" }}>{steps[steps.length - 1]}</span>
      {steps.map((s, i) => (
        <At
          key={i}
          style={{
            position: "absolute",
            inset: 0,
            ...(i === steps.length - 1 ? enter("xvIn", at + i * every, 0.01, "linear") : { animation: `xvIn .01s linear ${at + i * every}s both, xvOut .01s linear ${at + (i + 1) * every}s forwards` }),
          }}
        >
          {s}
        </At>
      ))}
    </div>
  );
}

const SPARKS = Array.from({ length: 10 }, (_, i) => {
  const angle = (i / 10) * Math.PI * 2 + 0.3;
  const r = i % 2 ? 150 : 210;
  return { dx: Math.round(Math.cos(angle) * r), dy: Math.round(Math.sin(angle) * r), size: i % 3 === 0 ? 30 : 20, delay: (i % 4) * 0.04 };
});
const ORBIT = ["c1.webp", "c2.webp", "c3.webp", "c4.webp", "c5.webp"];
const LEADS: [string, string, string][] = [
  ["Adaeze O.", "0803 ••• 4417", "Rare"],
  ["Tunde A.", "0816 ••• 2290", "Thank-you"],
  ["Mama Kemi", "0705 ••• 8812", "Thank-you"],
  ["Chidi N.", "0902 ••• 1174", "Rare"],
  ["Zainab B.", "0813 ••• 6605", "Thank-you"],
];
const FRIENDS = [
  { src: "c2.webp", x: 110, y: 520 },
  { src: "c3.webp", x: 270, y: 560 },
  { src: "c4.webp", x: 430, y: 520 },
];
const PROMISE = "Your posts get views. Tikka turns them into customers who show up and pay.";
const SERVICES: [string, string, string][] = [
  ["Signature facial", "60 min · ₦20,000", "₦5,000 deposit"],
  ["Chemical peel", "45 min · ₦35,000", "₦8,000 deposit"],
  ["Brow tint", "20 min · ₦8,000", "No deposit"],
];
const BOOKINGS: [string, string, string, boolean][] = [
  ["Zainab B.", "Sat 13 · 2:00pm", "Deposit paid ₦5,000", true],
  ["Funke A.", "Sat 13 · 3:30pm", "Deposit paid ₦8,000", true],
  ["Ngozi E.", "Mon 15 · 10:00am", "Deposit paid ₦5,000", true],
];

/** A divider card: which fix and which feature ("Tikka fixes both"), and its promise, on the night stage. */
function Chapter({ start, end, n, title }: { start: number; end: number; n: string; title: string }) {
  return (
    <Scene start={start} end={end} fade={0.2}>
      <div className="sv-night" />
      <At style={{ position: "absolute", left: 0, right: 0, top: 360, display: "grid", justifyItems: "center", textAlign: "center" }}>
        <At className="xv-mono" style={{ fontSize: 22, fontWeight: 700, letterSpacing: "0.2em", color: "var(--on-night-muted)", ...enter("xvUp", start + 0.05, 0.35) }}>
          {n}
        </At>
        <At style={{ marginTop: 10, width: 120, height: 3, borderRadius: 3, background: "var(--brand)", transformOrigin: "50% 50%", ...enter("xvStrike", start + 0.15, 0.4) }} />
        <div className="sv-say sv-say-night" style={{ position: "static", marginTop: 22, maxWidth: 400, fontSize: 50, lineHeight: "56px" }}>
          {title.split(" ").map((w, i) => (
            <span key={i} style={{ display: "inline-block", marginRight: "0.26em", ...enter("xvWord", start + 0.2 + i * 0.08, 0.4) }}>
              {w}
            </span>
          ))}
        </div>
      </At>
    </Scene>
  );
}

function Phone({ top = 120, zoom = 0.9, at, children }: { top?: number; zoom?: number; at?: number; children: ReactNode }) {
  return (
    <At style={{ position: "absolute", left: "50%", top, translate: "-50% 0", ...(at !== undefined ? enter("xvRise", at, 0.5) : {}) }}>
      <div style={{ zoom }}>
        <div className="xv-phone">
          <div className="xv-screen" style={{ background: "var(--surface)" }}>
            {children}
          </div>
        </div>
      </div>
    </At>
  );
}

export default async function StatusVideoPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const qr = await qrSvg("GS-7X4QP");

  return (
    <main style={{ display: "grid", placeItems: "center", minHeight: "100vh", background: "var(--night)" }}>
      <div className="xv" data-theme="light" data-length={LENGTH}>
        {/* HOOK · 0–5: views, likes, "how much?" around a worried owner */}
        <Scene start={0} end={5.2} fade={0.01}>
          <div className="sv-light" />
          <At className="sv-ring" style={{ width: 380, height: 380, left: 80, top: 230, animation: `svPulse 2.4s ease-out 0.2s infinite` }} />
          <At className="sv-ring" style={{ width: 330, height: 330, left: 105, top: 255 }} />
          <At style={enter("xvZoom", 0, 0.6)}>
            <Face src="owner-worried.webp" size={270} x={270} y={420} />
          </At>
          {/* A silent audience: lots of views, nobody reaching out. */}
          <Bubble icon="whatsapp" x={28} y={160} at={0.35}>
            <span>Status · 1.2k viewed</span>
          </Bubble>
          <Bubble icon="tiktok" x={292} y={214} at={0.75}>
            <span>8.4k views</span>
          </Bubble>
          <Bubble icon="instagram" x={28} y={590} at={1.15}>
            <span>♥ 640 likes</span>
          </Bubble>
          <Bubble icon="instagram" x={262} y={640} at={1.55}>
            <span style={{ color: "var(--ink-muted)" }}>No new messages</span>
          </Bubble>
          <Say top={724} at={2.3} words="1.2k watched." />
          <Say top={770} at={2.95} words="Nobody came in." />
        </Scene>

        {/* HOOK · 5–9: the booking that didn't come */}
        <Scene start={5} end={9.15}>
          <At style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
            <At style={{ position: "absolute", inset: 0, transformOrigin: "50% 60%", animation: `svPush 4.2s linear 5s both` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${IMG}/chair.webp`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </At>
          </At>
          <At style={{ position: "absolute", inset: 0, background: "var(--night)", ...enter("svDim", 7.0, 1.2, "linear") }} />
          <div className="sv-scrim" />
          <At style={{ position: "absolute", left: 120, top: 150, ...enter("xvUp", 5.3, 0.4) }}>
            <div className="xv-chat" style={{ fontSize: 22, lineHeight: "28px", padding: "14px 20px" }}>
              See you 2pm! 😊
              <span style={{ display: "block", textAlign: "right", fontSize: 12, color: "var(--ink-muted)" }}>Booked · Sat</span>
            </div>
          </At>
          <At className="xv-pill" style={{ position: "absolute", left: 175, top: 278, fontSize: 30, padding: "12px 26px", ...enter("xvPop", 5.8, 0.35) }}>
            <span>🕑</span>
            <Counter steps={["2:00", "2:05", "2:10", "2:15", "2:20", "2:25", "2:30"]} at={5.9} every={0.27} style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }} />
          </At>
          <Say top={688} at={5.5} words="And the ones who book don't show." night />
        </Scene>

        {/* 9–12: Tikka fixes both */}
        <Scene start={9} end={12.15}>
          <div className="sv-light" />
          <At style={{ position: "absolute", left: 0, right: 0, top: 320, display: "grid", justifyItems: "center" }}>
            <At style={enter("xvBurst", 9.2, 0.7)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/tikka-mark.svg" alt="" width={120} height={120} />
            </At>
            <At style={{ marginTop: 26, ...enter("xvUp", 9.65, 0.5) }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/tikka-wordmark.svg" alt="Tikka" width={190} height={60} />
            </At>
          </At>
          <Say top={720} at={10.1} words="Tikka fixes both." />
        </Scene>

        <Chapter start={12} end={13.6} n="FIX 1 · DROPS" title="Turn viewers into customers" />

        {/* 13.5–18: share a drop, free to claim */}
        <Scene start={13.5} end={18.15}>
          <div className="sv-light" />
          <At style={{ position: "absolute", left: 0, right: 0, top: 112, display: "flex", justifyContent: "center", ...enter("xvRise", 13.55, 0.6) }}>
            <div className="sv-pack" style={{ zoom: 0.56 }}>
              <TikkaPack as="div" businessName={FACE.name} initials={FACE.initials} brandColor={FACE.brandColor} onBrandColor={FACE.onBrandColor} total={600} contents={{ legendary: 12, rare: 60, thankYou: 528 }} />
            </div>
          </At>
          <At className="xv-pill" style={{ position: "absolute", left: "50%", top: 412, translate: "-50% 0", background: "var(--surface-raised)", color: "var(--ink)", fontSize: 16, boxShadow: "var(--shadow-raised)", ...enter("xvPop", 14.2, 0.35) }}>
            <span style={{ whiteSpace: "nowrap" }}>🔗 usetikka.com/d/glow-studio</span>
          </At>
          <svg className="sv-line" viewBox="0 0 540 960" width={540} height={960} style={{ position: "absolute", inset: 0 }} aria-hidden="true">
            {["M270 462 C270 520 75 520 75 580", "M270 462 C270 520 205 520 205 580", "M270 462 C270 520 335 520 335 580", "M270 462 C270 520 465 520 465 580"].map((d, i) => (
              <path key={d} d={d} style={{ animation: `svDraw .6s ${EASE} ${14.5 + i * 0.1}s both` }} />
            ))}
          </svg>
          {(["instagram", "tiktok", "whatsapp"] as Platform[]).map((p, i) => (
            <At key={p} style={{ position: "absolute", left: [42, 172, 302][i], top: 586, ...floatIn(15.0 + i * 0.13) }}>
              <Icon name={p} size={66} />
            </At>
          ))}
          <At style={{ position: "absolute", left: 432, top: 586, width: 66, height: 66, borderRadius: 19, background: "var(--surface-raised)", padding: 7, boxShadow: "var(--shadow-raised)", ...floatIn(15.4) }}>
            <div style={{ width: "100%", height: "100%" }} dangerouslySetInnerHTML={{ __html: qr }} />
          </At>
          <Say top={696} at={15.6} words="Share a limited reward." size={34} />
          <Say top={740} at={16.3} words="Free to claim." size={34} />
        </Scene>

        {/* 18–23: they claim it free on WhatsApp */}
        <Scene start={18} end={23.15}>
          <div className="sv-light" />
          <Phone at={18.0}>
            <div className="xv-layer" style={{ background: "var(--night)", color: "var(--on-night)", ...during(18.0, 21.2, 0.2) }}>
              <div style={{ display: "grid", justifyItems: "center", paddingTop: 40 }}>
                <span className="xv-pill" style={{ fontSize: 13, padding: "6px 12px", ...enter("xvIn", 18.2, 0.3, "linear") }}>
                  <Tick className="size-4" /> Claimed free on WhatsApp
                </span>
                <div style={{ position: "relative", width: 230, height: 322, marginTop: 34 }}>
                  <At style={{ position: "absolute", inset: -40, borderRadius: 999, background: "radial-gradient(closest-side, var(--rarity-rare), transparent)", ...enter("xvGlowOn", 19.45, 0.5) }} />
                  <At style={{ position: "absolute", inset: 0, transformOrigin: "50% 90%", ...enter("xvShake", 18.6, 0.45, "ease-in-out") }}>
                    <At style={{ animation: `xvSquashOut .25s ease-in 19.15s forwards` }}>
                      <SoloCard zoom={0.82} label="" face={FACE} total={600} claimedBy="Adaeze" />
                    </At>
                  </At>
                  <At style={{ position: "absolute", inset: 0, ...enter("xvSquashIn", 19.4, 0.3, "ease-out") }}>
                    <SoloCard zoom={0.82} flipped label="" face={FACE} total={600} reveal={RARE} />
                  </At>
                  {SPARKS.map((s, i) => (
                    <At
                      key={i}
                      className="xv-spark"
                      style={{ width: s.size, height: s.size, margin: `${-s.size / 2}px 0 0 ${-s.size / 2}px`, ["--dx" as string]: `${s.dx}px`, ["--dy" as string]: `${s.dy}px`, animation: `xvSparkFly .9s ease-out ${19.45 + s.delay}s both` }}
                    >
                      <Spark className="size-full" />
                    </At>
                  ))}
                </div>
                <At style={{ marginTop: 22, fontSize: 24, fontWeight: 800, ...enter("xvWord", 19.8, 0.45) }}>You got a Tikka!</At>
              </div>
            </div>
            <div className="xv-layer" style={{ background: "var(--surface-sunken)", color: "var(--ink)", ...during(21.2, 23.4, 0.2) }}>
              <div className="xv-chat-head">
                <Icon name="whatsapp" size={34} />
                <span style={{ display: "grid" }}>
                  <b style={{ fontSize: 15 }}>Tikka</b>
                  <span style={{ fontSize: 11, color: "var(--on-night-muted)" }}>Business account</span>
                </span>
              </div>
              <div className="xv-chat-body">
                <div className="xv-bubble-out">
                  Claim my Tikka from Glow Studio
                  <span style={{ display: "block", textAlign: "right", fontSize: 10, color: "var(--ink-muted)" }}>9:41 ✓✓</span>
                </div>
                <At className="xv-bubble-in" style={enter("xvUp", 21.45, 0.35)}>
                  <div style={{ display: "grid", placeItems: "center", padding: "6px 0 8px", borderRadius: 10, background: "var(--night)" }}>
                    <SoloCard zoom={0.42} flipped label="" face={FACE} total={600} reveal={RARE} />
                  </div>
                  <p style={{ marginTop: 6 }}>
                    🎟 You got a Tikka from Glow Studio! 20% off any service · Code <b>GS-7X4QP</b>. Show this at the counter.
                  </p>
                </At>
              </div>
            </div>
          </Phone>
          <Say top={696} at={18.4} words="They claim it on WhatsApp." size={34} />
          <Say top={740} at={19.6} words="No payment." size={34} />
        </Scene>

        {/* 23–26: friends share it */}
        <Scene start={23} end={26.15}>
          <div className="sv-light" />
          <At style={{ position: "absolute", left: "50%", top: 120, translate: "-50% 0", ...enter("xvZoom", 23.05, 0.45) }}>
            <SoloCard zoom={0.5} flipped label="" face={FACE} total={600} reveal={RARE} />
          </At>
          <At className="xv-pill" style={{ position: "absolute", left: "50%", top: 330, translate: "-50% 0", background: "var(--surface-raised)", color: "var(--ink)", fontSize: 15, boxShadow: "var(--shadow-raised)", ...enter("xvPop", 23.4, 0.3) }}>
            <Icon name="whatsapp" size={22} /> Shared with friends
          </At>
          {FRIENDS.map((f, i) => (
            <At key={f.src}>
              <At
                style={{ position: "absolute", left: 252, top: 360, width: 36, height: 50, borderRadius: 7, background: FACE.brandColor, boxShadow: "var(--shadow-raised)", ["--dx" as string]: `${f.x - 270}px`, ["--dy" as string]: `${f.y - 385}px`, animation: `svFly .7s ${EASE} ${23.7 + i * 0.2}s both` }}
              />
              <At style={{ position: "absolute", left: 0, top: 0, ...enter("xvPop", 24.2 + i * 0.2, 0.35) }}>
                <Face src={f.src} size={104} x={f.x} y={f.y} />
              </At>
            </At>
          ))}
          <Say top={696} at={23.6} words="Friends share it." size={34} />
          <Say top={740} at={24.4} words="More people come." size={34} />
        </Scene>

        {/* 26–29.7: they come in; you see who is serious */}
        <Scene start={26} end={29.75}>
          <At style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
            <At style={{ position: "absolute", inset: 0, transformOrigin: "50% 60%", animation: `svPushSlow 3.8s linear 26s both` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${IMG}/chair.webp`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </At>
          </At>
          <div className="sv-scrim" />
          <At style={{ animation: `xvBurst .55s ${EASE} 26.15s both, svShrinkUp .45s ${EASE} 26.95s forwards` }}>
            <Face src="c1.webp" size={200} x={270} y={440} />
            <At className="xv-pill" style={{ position: "absolute", left: 200, top: 552, background: "var(--success)", color: "var(--on-success)", fontSize: 17, ...enter("xvPop", 26.5, 0.3) }}>
              <Tick className="size-4" /> Arrived
            </At>
          </At>
          <At className="sv-card" style={{ position: "absolute", left: 50, right: 50, top: 400, padding: 20, animation: `svSlideUp .45s ${EASE} 27.1s both, xvOut .2s linear 28.1s forwards` }}>
            <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-muted)" }}>Counter · Glow Studio</p>
            <div style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, background: "var(--success-soft)", color: "var(--success)", fontWeight: 800, fontSize: 15 }}>
              <Tick className="size-4" /> Valid
            </div>
            <p style={{ marginTop: 10, fontSize: 20, fontWeight: 800 }}>Adaeze · 20% off any service</p>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "var(--ink-muted)" }}>GS-7X4QP</p>
          </At>
          <At className="sv-card" style={{ position: "absolute", left: 50, right: 50, top: 380, padding: "16px 18px 6px", ...during(28.25, 29.9, 0.2) }}>
            <p style={{ fontSize: 17, fontWeight: 800 }}>Leads · 577</p>
            {LEADS.slice(0, 3).map(([n, p], i) => (
              <At key={n} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderTop: i ? "1px solid var(--line)" : undefined, ...enter("svSlideUp", 28.35 + i * 0.15, 0.3) }}>
                <span style={{ width: 32, height: 32, borderRadius: 999, background: "var(--brand-soft)", color: "var(--brand)", display: "grid", placeItems: "center", fontWeight: 800 }}>{n[0]}</span>
                <span style={{ flex: 1 }}>
                  <b style={{ display: "block", fontSize: 15 }}>{n}</b>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink-muted)" }}>{p}</span>
                </span>
              </At>
            ))}
          </At>
          <Say top={696} at={26.3} words="They come in." night size={34} />
          <Say top={740} at={27.4} words={"You see who's serious."} night size={34} />
        </Scene>

        <Chapter start={29.6} end={31.15} n="FIX 2 · BOOKINGS" title="Make bookings show up" />

        {/* 31–34: your free website, in your bio */}
        <Scene start={31} end={34.15}>
          <div className="sv-light" />
          <At className="sv-bubble" style={{ left: "50%", top: 112, translate: "-50% 0", fontSize: 16, ...enter("xvPop", 31.1, 0.35) }}>
            <Icon name="instagram" size={34} />
            <span style={{ display: "grid", lineHeight: "20px" }}>
              <b>glowstudio.lekki</b>
              <span style={{ fontWeight: 600, color: "var(--brand)" }}>🔗 usetikka.com/glow-studio</span>
            </span>
          </At>
          <Phone top={190} zoom={0.84} at={31.2}>
            <div className="xv-layer" style={{ color: "var(--ink)", overflow: "hidden" }}>
              <At style={{ animation: `svScrollPage 2.5s cubic-bezier(.45,0,.25,1) 31.6s both` }}>
                <div style={{ height: 150, position: "relative", overflow: "hidden" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`${IMG}/chair.webp`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 30%" }} />
                </div>
                <div style={{ padding: "0 16px" }}>
                  <div style={{ marginTop: -30, width: 60, height: 60, borderRadius: 999, background: FACE.brandColor, color: FACE.onBrandColor, display: "grid", placeItems: "center", fontWeight: 800, fontSize: 20, border: "3px solid var(--surface)", position: "relative" }}>GS</div>
                  <p style={{ marginTop: 8, fontSize: 22, fontWeight: 800 }}>Glow Studio</p>
                  <p style={{ fontSize: 13, color: "var(--ink-muted)" }}>Skin &amp; beauty studio · Lekki, Lagos</p>
                  <p style={{ marginTop: 4, fontSize: 13, fontWeight: 700 }}>★ 4.9 · 128 reviews</p>
                  <p style={{ marginTop: 14, fontSize: 15, fontWeight: 800 }}>Services</p>
                  {SERVICES.map(([n, d, dep]) => (
                    <div key={n} style={{ marginTop: 8, padding: 12, borderRadius: 14, background: "var(--surface-raised)", boxShadow: "var(--shadow-raised)", display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ flex: 1 }}>
                        <b style={{ display: "block", fontSize: 14 }}>{n}</b>
                        <span style={{ fontSize: 12, color: "var(--ink-muted)" }}>{d}</span>
                        <span style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--brand)" }}>{dep}</span>
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 800, padding: "6px 12px", borderRadius: 999, background: "var(--brand)", color: "var(--on-brand)" }}>Book</span>
                    </div>
                  ))}
                  <p style={{ marginTop: 16, fontSize: 15, fontWeight: 800 }}>Our work</p>
                  <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                    {["c1.webp", "c3.webp", "c5.webp", "owner-smiling.webp", "c4.webp", "c2.webp"].map((src) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={src} src={`${IMG}/${src}`} alt="" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 8 }} />
                    ))}
                  </div>
                  <p style={{ marginTop: 16, fontSize: 15, fontWeight: 800 }}>Reviews</p>
                  <div style={{ marginTop: 8, padding: 12, borderRadius: 14, background: "var(--surface-raised)", boxShadow: "var(--shadow-raised)", fontSize: 13 }}>
                    <b>★★★★★</b> “My skin has never looked this good.” <span style={{ color: "var(--ink-muted)" }}>· Kemi</span>
                  </div>
                </div>
              </At>
            </div>
          </Phone>
          <Say top={720} at={31.3} words="Your free website. In your bio." size={34} />
        </Scene>

        {/* 34–40: a new customer books and pays a deposit */}
        <Scene start={34} end={40.15}>
          <div className="sv-light" />
          <Phone top={190} zoom={0.84}>
            <div className="xv-layer" style={{ color: "var(--ink)", padding: "34px 18px 0", ...during(34.0, 38.6, 0.2) }}>
              <p style={{ fontSize: 12, color: "var(--ink-muted)", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>Glow Studio · Book</p>
              <p style={{ marginTop: 6, fontSize: 20, fontWeight: 800 }}>Signature facial</p>
              <p style={{ fontSize: 14, color: "var(--ink-muted)" }}>60 min · ₦20,000</p>
              <p style={{ marginTop: 18, fontSize: 13, fontWeight: 700 }}>Pick a day</p>
              <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                {["Thu 11", "Fri 12", "Sat 13", "Mon 15"].map((d, i) => (
                  <div key={d} style={{ position: "relative" }}>
                    <div className="sv-chip">{d}</div>
                    {i === 2 && <At className="sv-chip sv-chip-on" style={{ position: "absolute", inset: 0, ...enter("xvPop", 35.0, 0.25) }}>{d}</At>}
                  </div>
                ))}
              </div>
              <p style={{ marginTop: 16, fontSize: 13, fontWeight: 700 }}>Free times</p>
              <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                {["10:00am", "12:00pm", "2:00pm", "3:30pm", "5:00pm"].map((t, i) => (
                  <div key={t} style={{ position: "relative" }}>
                    <div className="sv-chip">{t}</div>
                    {i === 2 && <At className="sv-chip sv-chip-on" style={{ position: "absolute", inset: 0, ...enter("xvPop", 35.8, 0.25) }}>{t}</At>}
                  </div>
                ))}
              </div>
              <At style={{ position: "absolute", left: 10, right: 10, bottom: 10, padding: 16, borderRadius: 22, background: "var(--surface-raised)", boxShadow: "var(--shadow-raised)", ...enter("svSlideUp", 36.4, 0.45) }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                  <span>Sat 13 · 2:00pm</span>
                  <b>₦20,000</b>
                </div>
                <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 800 }}>
                  <span>Deposit to book</span>
                  <span>₦5,000</span>
                </div>
                <div style={{ marginTop: 4, display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--ink-muted)" }}>
                  <span>Pay at the shop</span>
                  <span>₦15,000</span>
                </div>
                <At style={{ marginTop: 14, ...enter("xvTap", 37.7, 0.3, "ease-in-out") }}>
                  <div className="xv-btn" style={{ fontSize: 17 }}>Pay ₦5,000</div>
                </At>
              </At>
            </div>
            <div className="xv-layer" style={{ color: "var(--ink)", display: "grid", placeItems: "center", alignContent: "center", gap: 14, textAlign: "center", ...during(38.6, 40.4, 0.2) }}>
              <At style={{ width: 92, height: 92, borderRadius: 999, background: "var(--success)", color: "var(--on-success)", display: "grid", placeItems: "center", ...enter("xvBurst", 38.75, 0.5) }}>
                <Tick className="size-12" />
              </At>
              <At style={{ fontSize: 26, fontWeight: 800, ...enter("xvUp", 39.0, 0.4) }}>You&apos;re booked, Zainab</At>
              <At style={{ fontSize: 16, color: "var(--ink-muted)", lineHeight: "24px", ...enter("xvUp", 39.2, 0.4) }}>
                Sat 13 · 2:00pm
                <br />
                Deposit paid <b style={{ color: "var(--ink)" }}>₦5,000</b>
              </At>
            </div>
          </Phone>
          {/* the new customer, who found the page on Instagram */}
          <At className="sv-bubble" style={{ left: "50%", top: 106, translate: "-50% 0", padding: "6px 16px 6px 6px", fontSize: 16, ...enter("xvPop", 34.15, 0.4) }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${IMG}/c5.webp`} alt="" width={52} height={52} style={{ borderRadius: 999, border: "3px solid var(--surface-raised)" }} />
            <span style={{ display: "grid", lineHeight: "20px" }}>
              <b>Zainab</b>
              <span style={{ fontWeight: 600, color: "var(--ink-muted)", fontSize: 14 }}>found you on Instagram</span>
            </span>
          </At>
          <Say top={696} at={34.4} words="They book a time" size={34} />
          <Say top={740} at={35.4} words="and pay a deposit." size={34} />
        </Scene>

        {/* 40–45: the owner's side: deposits paid, money in the bank */}
        <Scene start={40} end={45.15}>
          <div className="sv-light" />
          <At className="sv-card" style={{ position: "absolute", left: 40, right: 40, top: 118, padding: "16px 18px 6px", ...enter("svSlideUp", 40.05, 0.45) }}>
            <p style={{ fontSize: 17, fontWeight: 800 }}>Bookings · Glow Studio</p>
            {BOOKINGS.map(([n, when, dep], i) => (
              <At key={n} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: i ? "1px solid var(--line)" : undefined, ...enter("svSlideUp", 40.3 + i * 0.2, 0.3) }}>
                <span style={{ flex: 1 }}>
                  <b style={{ display: "block", fontSize: 15 }}>{n}</b>
                  <span style={{ fontSize: 12, color: "var(--ink-muted)" }}>{when}</span>
                </span>
                <span style={{ fontSize: 12, fontWeight: 800, padding: "4px 10px", borderRadius: 999, background: "var(--success-soft)", color: "var(--success)" }}>{dep}</span>
              </At>
            ))}
          </At>
          <At className="sv-card" style={{ position: "absolute", left: 70, right: 70, top: 420, padding: 18, textAlign: "center", ...enter("xvRise", 41.9, 0.5) }}>
            <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-muted)" }}>Money</p>
            <p style={{ marginTop: 6, fontSize: 34, fontWeight: 800, letterSpacing: "-0.02em" }}>₦18,000</p>
            <p style={{ fontSize: 14, color: "var(--ink-muted)" }}>in deposits · to your bank next working day</p>
          </At>
          <Say top={696} at={42.6} words="No-show?" size={36} />
          <Say top={742} at={43.2} words="The deposit's yours." size={36} />
        </Scene>

        {/* 45–50: more people in, fewer empty chairs */}
        <Scene start={45} end={50.15}>
          <div className="sv-light" />
          <At className="sv-ring" style={{ width: 400, height: 400, left: 70, top: 170 }} />
          <Face src="owner-smiling.webp" size={220} x={270} y={370} style={enter("xvZoom", 45.05, 0.5)} />
          <At style={{ position: "absolute", left: 70, top: 170, width: 400, height: 400, animation: `svSpin 24s linear 45s both` }}>
            {ORBIT.map((src, i) => {
              const a = (i / ORBIT.length) * Math.PI * 2 - Math.PI / 2;
              const x = 200 + Math.cos(a) * 200;
              const y = 200 + Math.sin(a) * 200;
              return (
                <At key={src} style={{ position: "absolute", left: x - 42, top: y - 42, width: 84, height: 84, animation: `svUnspin 24s linear 45s both` }}>
                  <At style={{ position: "absolute", inset: 0, ...enter("xvPop", 45.3 + i * 0.15, 0.35) }}>
                    <Face src={src} size={84} x={42} y={42} />
                  </At>
                </At>
              );
            })}
          </At>
          <At style={{ position: "absolute", left: 0, right: 0, top: 604, display: "flex", justifyContent: "center", gap: 10 }}>
            <At className="xv-pill" style={{ background: "var(--surface-raised)", color: "var(--ink)", fontSize: 16, boxShadow: "var(--shadow-raised)", ...enter("xvPop", 46.2, 0.35) }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "var(--ink-muted)" }}>EXAMPLE</span> One drop: ₦1.94M
            </At>
            <At className="xv-pill" style={{ background: "var(--surface-raised)", color: "var(--ink)", fontSize: 16, boxShadow: "var(--shadow-raised)", ...enter("xvPop", 46.7, 0.35) }}>
              ₦5,000 on every booking
            </At>
          </At>
          <Say top={704} at={47.2} words="More people in." size={36} />
          <Say top={750} at={47.9} words="Fewer empty chairs." size={36} />
        </Scene>

        {/* 50–55.6: the promise, then the end card (55.6–59) */}
        <Scene start={50} end={55.8}>
          <div className="sv-light" />
          <Face src="owner-smiling.webp" size={190} x={270} y={250} style={enter("xvZoom", 50.1, 0.5)} />
          <div className="sv-say" style={{ top: 400, fontSize: 40, lineHeight: "46px" }}>
            {PROMISE.split(" ").map((w, i) => (
              <span key={i} style={{ display: "inline-block", marginRight: "0.26em", color: i >= 9 ? "var(--brand)" : undefined, ...enter("xvWord", 50.4 + i * 0.22, 0.4) }}>
                {w}
              </span>
            ))}
          </div>
        </Scene>
        <Scene start={55.6} end={LENGTH + 1}>
          <div className="sv-light" />
          <At style={{ position: "absolute", left: 0, right: 0, top: 300, display: "grid", justifyItems: "center" }}>
            <At style={enter("xvBurst", 55.75, 0.6)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/tikka-lockup.svg" alt="Tikka" width={240} height={70} />
            </At>
            <At style={{ marginTop: 44, width: 380, ...enter("xvUp", 56.3, 0.45) }}>
              <div className="xv-btn" style={{ height: 66, fontSize: 24 }}>Get your first drop free</div>
            </At>
            <At style={{ marginTop: 22, fontSize: 28, fontWeight: 800, color: "var(--ink)", ...enter("xvUp", 56.7, 0.45) }}>usetikka.com</At>
          </At>
        </Scene>
      </div>
    </main>
  );
}
